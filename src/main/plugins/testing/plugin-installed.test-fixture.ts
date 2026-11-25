import { mkdtemp, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  pluginManifestSchema,
  type PluginManifest
} from '../../../shared/plugins/manifest/plugin-manifest'
import { hashPluginTree } from '../artifacts/plugin-content-hash'
const roots: string[] = []

export async function createInstalledPlugin(options: {
  worker: boolean
  summary?: boolean
}): Promise<{
  userDataPath: string
  pluginKey: string
  rootDir: string
  manifest: PluginManifest
  contentHash: string
}> {
  const userDataPath = await mkdtemp(join(tmpdir(), 'orca-plugin-service-integrity-'))
  roots.push(userDataPath)
  const pluginKey = 'samples.demo'
  const pluginDir = join(userDataPath, 'plugins', pluginKey)
  const stagingDir = join(pluginDir, 'staging')
  await mkdir(stagingDir, { recursive: true })
  const manifest = pluginManifestSchema.parse({
    manifestVersion: 1,
    id: 'demo',
    publisher: 'samples',
    name: 'Demo',
    version: '1.0.0',
    engines: { orca: '>=1.0.0' },
    pluginApi: 1,
    ...(options.worker ? { main: 'worker.js' } : {}),
    contributes: {
      panels: [{ id: 'panel', title: 'Panel', entry: 'panel.html' }],
      commands: options.worker ? [{ id: 'run', title: 'Run' }] : [],
      events: []
    },
    capabilities: options.summary ? [{ kind: 'agent:summary' }] : []
  })
  await writeFile(join(stagingDir, 'orca-plugin.json'), JSON.stringify(manifest))
  await writeFile(join(stagingDir, 'panel.html'), '<h1>Panel</h1>')
  await writeFile(join(stagingDir, 'payload.txt'), 'original')
  if (options.worker) {
    await writeFile(join(stagingDir, 'worker.js'), 'export default async function () {}')
  }
  const content = await hashPluginTree(stagingDir)
  if (!content.ok) {
    throw new Error(content.error)
  }
  const rootDir = join(pluginDir, content.hash)
  await rename(stagingDir, rootDir)
  await writeFile(join(pluginDir, 'current'), content.hash)
  return { userDataPath, pluginKey, rootDir, manifest, contentHash: content.hash }
}

export async function cleanupInstalledPluginFixtures(): Promise<void> {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
}
