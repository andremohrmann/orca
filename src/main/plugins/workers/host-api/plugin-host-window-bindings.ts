import { PLUGIN_HOST_API } from '../../../../shared/plugins/workers/plugin-host-api'
import { bind, type BoundPluginHostMethod } from './plugin-host-method-bind'
import { PluginHostCallError, type PluginHostCallScope } from './plugin-host-call-scope'
import type { PluginHostServices } from './plugin-host-method-bindings'
import { getPluginWindowService } from '../../windows/plugin-window-service-registry'
import type { PluginConfirmationSubject } from '../../consent/plugin-confirmation-subject'

function windows(scope: PluginHostCallScope) {
  if (scope.panel && scope.callerWebContentsId === undefined) {
    throw new PluginHostCallError(
      'not_permitted',
      'plugin window calls require a local desktop frame or worker'
    )
  }
  const service = getPluginWindowService()
  if (!service) {
    throw new PluginHostCallError('unavailable', 'plugin windows require the local Orca desktop')
  }
  return service
}

async function confirmed(
  pluginId: string,
  services: PluginHostServices,
  scope: PluginHostCallScope,
  subject: PluginConfirmationSubject,
  apply: () => void | Promise<void>
) {
  windows(scope)
  scope.assertActive()
  const answer = (await services.confirm?.(pluginId, subject, scope)) ?? 'unavailable'
  scope.assertActive()
  if (answer !== 'allowed') {
    return {
      status: answer === 'cancelled' ? ('cancelled' as const) : ('consent-unavailable' as const)
    }
  }
  await apply()
  return { status: 'applied' as const }
}

const api = PLUGIN_HOST_API
export const PLUGIN_WINDOW_HANDLERS = {
  'window.read': bind(api['window.read'], async ({ panelId }, { pluginId, scope }) =>
    windows(scope).read(pluginId, panelId)
  ),
  'window.open': bind(api['window.open'], async (params, { pluginId, services, scope }) => {
    await windows(scope).read(pluginId, params.panelId)
    return confirmed(
      pluginId,
      services,
      scope,
      { kind: 'window.open', panelId: params.panelId, presentation: params.presentation },
      () => windows(scope).open(pluginId, params.panelId, params.presentation, scope, params.bounds)
    )
  }),
  'window.close': bind(api['window.close'], async ({ panelId }, { pluginId, scope }) => {
    scope.assertActive()
    return { closed: windows(scope).close(pluginId, panelId) }
  }),
  'window.setOpacity': bind(
    api['window.setOpacity'],
    async ({ panelId, opacity }, { pluginId, services, scope }) => {
      const state = await windows(scope).read(pluginId, panelId)
      if (!state.opacitySupported || !state.open) {
        throw new PluginHostCallError(
          'unavailable',
          'opacity needs an open popout on macOS or Windows'
        )
      }
      return confirmed(
        pluginId,
        services,
        scope,
        { kind: 'window.setOpacity', panelId, opacity },
        () => windows(scope).setOpacity(pluginId, panelId, opacity, scope)
      )
    }
  ),
  'window.setStartup': bind(
    api['window.setStartup'],
    async ({ panelId, presentation }, { pluginId, services, scope }) => {
      await windows(scope).read(pluginId, panelId)
      return confirmed(
        pluginId,
        services,
        scope,
        { kind: 'window.setStartup', panelId, presentation },
        () => windows(scope).setStartup(pluginId, panelId, presentation, scope)
      )
    }
  )
} satisfies Record<string, BoundPluginHostMethod>
