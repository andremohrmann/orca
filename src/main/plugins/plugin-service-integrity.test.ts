import {
  createInstalledPlugin,
  cleanupInstalledPluginFixtures
} from './testing/plugin-installed.test-fixture'
import { writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fingerprintPluginConsent } from '../../shared/plugins/approval/plugin-consent-fingerprint'
import { PluginContentVerifier } from './artifacts/plugin-content-integrity'
import { PluginService } from './plugin-service'
import type { PluginWorkerFactory } from './workers/worker-supervision/plugin-worker-startup'

function createService(
  plugin: Awaited<ReturnType<typeof createInstalledPlugin>>,
  workerFactory?: PluginWorkerFactory
): PluginService {
  const consentFingerprint = fingerprintPluginConsent(plugin.manifest, plugin.contentHash)
  return new PluginService({
    userDataPath: plugin.userDataPath,
    hostVersion: '1.4.0',
    isPluginSystemEnabled: () => true,
    getDisabledPlugins: () => [],
    getPluginConsents: () => ({ [plugin.pluginKey]: consentFingerprint }),
    getDevPluginPaths: () => [],
    workerFactory
  })
}

afterEach(async () => {
  await cleanupInstalledPluginFixtures()
})

describe('PluginService content verification on load', () => {
  it('does not share an in-flight verification across same-key content revisions', async () => {
    const oldPlugin = await createInstalledPlugin({ worker: false })
    const newPlugin = await createInstalledPlugin({ worker: false })
    await writeFile(join(oldPlugin.rootDir, 'payload.txt'), 'tampered old revision')
    const verifier = new PluginContentVerifier()

    const oldVerification = verifier.verify({
      pluginKey: oldPlugin.pluginKey,
      rootDir: oldPlugin.rootDir,
      contentHash: basename(oldPlugin.rootDir)
    })
    const newVerification = verifier.verify({
      pluginKey: newPlugin.pluginKey,
      rootDir: newPlugin.rootDir,
      contentHash: basename(newPlugin.rootDir)
    })

    await expect(oldVerification).rejects.toThrow('integrity verification')
    await expect(newVerification).resolves.toBeUndefined()
  })

  it('detects tampering on the first panel load after discovery', async () => {
    const plugin = await createInstalledPlugin({ worker: false })
    const service = createService(plugin)
    await service.initialize()
    expect(service.findValidPlugin(plugin.pluginKey)).not.toBeNull()

    await writeFile(join(plugin.rootDir, 'payload.txt'), 'tampered after discovery')

    await expect(service.panels.readEntry(plugin.pluginKey, 'panel')).resolves.toBeNull()
    await service.dispose()
  })

  it('detects tampering on a later panel load after a successful first load', async () => {
    const plugin = await createInstalledPlugin({ worker: false })
    const service = createService(plugin)
    await service.initialize()
    await expect(service.panels.readEntry(plugin.pluginKey, 'panel')).resolves.not.toBeNull()

    await writeFile(join(plugin.rootDir, 'payload.txt'), 'tampered after first load')

    await expect(service.panels.readEntry(plugin.pluginKey, 'panel')).resolves.toBeNull()
    await service.dispose()
  })

  it('blocks a worker fork when installed content changed after discovery', async () => {
    const plugin = await createInstalledPlugin({ worker: true })
    const workerFactory = vi.fn<PluginWorkerFactory>()
    const service = createService(plugin, workerFactory)
    await service.initialize()
    await writeFile(join(plugin.rootDir, 'payload.txt'), 'tampered after discovery')

    await expect(service.invokeCommand(plugin.pluginKey, 'run')).rejects.toThrow(
      'integrity verification'
    )
    await service.dispose()
  })
})
