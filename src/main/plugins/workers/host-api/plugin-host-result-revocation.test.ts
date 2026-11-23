import { expect, it } from 'vitest'
import { executePluginHostCall } from './plugin-host-methods'
import { PluginHostCallError } from './plugin-host-call-scope'
import type { PluginHostServices } from './plugin-host-method-bindings'
import { createPluginHostCallScope } from '../../runtime/plugin-service-host-call'
import { pluginManifestSchema } from '../../../../shared/plugins/manifest/plugin-manifest'
import type { ValidDiscoveredPlugin } from '../../discovery/plugin-discovery'

const unavailable = (): never => {
  throw new Error('unexpected service access')
}
const services = {
  resolveActiveWorktreeContext: unavailable,
  listWorktreeTerminals: unavailable,
  listAgentStatuses: unavailable,
  sendTerminalText: unavailable,
  dispatchPluginNotification: unavailable,
  storage: { get: unavailable, set: unavailable, delete: unavailable, keys: unavailable },
  secrets: { get: unavailable, set: unavailable, delete: unavailable, protection: unavailable },
  settings: { getAll: unavailable, set: unavailable }
} satisfies PluginHostServices

it('withholds an asynchronous host result after approval is revoked', async () => {
  let active = true
  const pending = executePluginHostCall({
    pluginId: 'author.dashboard',
    method: 'host.customContract',
    params: undefined,
    surface: 'worker',
    grantedCapabilities: [],
    services,
    scope: {
      assertActive() {
        if (!active) {
          throw new PluginHostCallError('consent_required', 'plugin was revoked')
        }
      }
    }
  })
  active = false
  expect(await pending).toEqual({
    ok: false,
    code: 'consent_required',
    error: 'plugin was revoked'
  })
})

it('does not carry an admitted call into a separately approved content revision', () => {
  const admitted: ValidDiscoveredPlugin = {
    pluginKey: 'author.dashboard',
    rootDir: '/isolated/plugin',
    manifest: pluginManifestSchema.parse({
      manifestVersion: 2,
      execution: 'trusted-worker',
      id: 'dashboard',
      name: 'Dashboard',
      version: '1.0.0',
      engines: { orca: '>=1.4.260' },
      pluginApi: 1,
      main: 'worker.mjs'
    }),
    consentFingerprint: 'approval-a',
    contentHash: 'a'.repeat(64),
    isDev: false
  }
  let current = admitted
  const scope = createPluginHostCallScope(admitted, () => current, undefined)
  scope.assertActive()
  current = { ...admitted, contentHash: 'b'.repeat(64), consentFingerprint: 'approval-b' }
  expect(() => scope.assertActive()).toThrow('plugin is no longer enabled')
})

it('withholds a completed result when its caller cancels before delivery', async () => {
  const controller = new AbortController()
  const pending = executePluginHostCall({
    pluginId: 'author.dashboard',
    method: 'host.customContract',
    params: undefined,
    surface: 'worker',
    grantedCapabilities: [],
    services,
    scope: {
      signal: controller.signal,
      assertActive: () => controller.signal.throwIfAborted()
    }
  })
  controller.abort()
  expect(await pending).toEqual({
    ok: false,
    code: 'cancelled',
    error: 'plugin host call was cancelled'
  })
})
