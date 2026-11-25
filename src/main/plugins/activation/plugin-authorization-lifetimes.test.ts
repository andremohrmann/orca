import { expect, it } from 'vitest'
import { PluginAuthorizationLifetimes } from './plugin-authorization-lifetimes'
import { pluginManifestSchema } from '../../../shared/plugins/manifest/plugin-manifest'
import type { ValidDiscoveredPlugin } from '../discovery/plugin-discovery'

it('keeps authorization withdrawn until every overlapping departure finishes, including duplicate and stale finishes', () => {
  const plugin: ValidDiscoveredPlugin = {
    pluginKey: 'samples.departure',
    rootDir: '/isolated/plugin',
    manifest: pluginManifestSchema.parse({
      manifestVersion: 1,
      id: 'departure',
      publisher: 'samples',
      name: 'Departure',
      version: '1.0.0',
      engines: { orca: '>=1.0.0' },
      pluginApi: 1,
      contributes: {},
      capabilities: []
    }),
    consentFingerprint: 'approved',
    contentHash: 'a'.repeat(64),
    isDev: false
  }
  const owner = new PluginAuthorizationLifetimes()
  const before = owner.epochFor(plugin.pluginKey, plugin)
  expect(before).not.toBeNull()
  const finishA = owner.beginDeparture(plugin.pluginKey)
  const finishB = owner.beginDeparture(plugin.pluginKey)
  expect(owner.epochFor(plugin.pluginKey, plugin)).toBeNull()
  finishA()
  finishA()
  expect(owner.epochFor(plugin.pluginKey, plugin)).toBeNull()
  finishB()
  const after = owner.epochFor(plugin.pluginKey, plugin)
  expect(after).not.toBeNull()
  expect(after).not.toBe(before)
  const stale = owner.beginDeparture(plugin.pluginKey)
  owner.clear()
  const current = owner.beginDeparture(plugin.pluginKey)
  stale()
  expect(owner.epochFor(plugin.pluginKey, plugin)).toBeNull()
  current()
  expect(owner.epochFor(plugin.pluginKey, plugin)).not.toBeNull()
})
