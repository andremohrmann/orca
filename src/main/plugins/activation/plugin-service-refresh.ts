import {
  discoverPlugins,
  getUserPluginsDir,
  type ValidDiscoveredPlugin
} from '../discovery/plugin-discovery'
import type { PluginConsentLists } from '../../../shared/plugins/approval/plugin-consent-state'
import type { PluginService } from '../plugin-service'
import type { PluginInstallationState } from '../installation/plugin-installation-state'
import type { PluginWorkerController } from '../workers/plugin-worker-controller'
import type { PluginServiceHousekeeping } from '../development/plugin-service-housekeeping'
import { isPluginApproved } from './plugin-activation-policy'
import { collectApprovedWorkerSpecs } from '../workers/worker-admission/plugin-worker-reconciliation'

type RefreshInput = {
  service: Pick<
    PluginService,
    'options' | 'panels' | 'contentPacks' | 'findValidPlugin' | 'refresh'
  >
  installed: PluginInstallationState
  workers: PluginWorkerController
  housekeeping: PluginServiceHousekeeping
  isDisposed: () => boolean
  setReady: (ready: boolean) => void
  retireDeniedBy: (approved: (plugin: ValidDiscoveredPlugin) => boolean) => void
  isRuntimeApproved: (plugin: ValidDiscoveredPlugin) => boolean
  notifyChanged: (contentPacksChanged: boolean) => void
  enabled: boolean
  devPaths: string[]
  consentLists: PluginConsentLists
}

export async function refreshPluginService(input: RefreshInput): Promise<void> {
  const { service, enabled, devPaths, consentLists } = input
  if (input.isDisposed()) {
    return
  }
  input.setReady(false)
  if (!enabled) {
    service.panels.revokeAll()
  }
  const next = enabled
    ? await discoverPlugins({
        pluginsDir: getUserPluginsDir(service.options.userDataPath),
        devPluginPaths: devPaths,
        hostVersion: service.options.hostVersion
      })
    : []
  if (input.isDisposed()) {
    return
  }
  input.installed.discovered = next
  input.retireDeniedBy((plugin) => isPluginApproved(enabled, plugin, consentLists))
  await service.contentPacks.reconcile(
    next,
    (plugin) => isPluginApproved(enabled, plugin, consentLists),
    service.options.getKeybindings?.()
  )
  input.setReady(true)
  const specs = collectApprovedWorkerSpecs(next, input.isRuntimeApproved)
  input.notifyChanged(true)
  await input.workers.reconcile(specs, (key) => service.findValidPlugin(key))
  if (input.isDisposed()) {
    return
  }
  input.housekeeping.sync({
    enabled,
    devPaths,
    reapIdle: () => input.workers.reapIdle(),
    refresh: () => void service.refresh()
  })
  input.notifyChanged(false)
}
