import { join } from 'node:path'
import { z } from 'zod'
import {
  pluginWindowBoundsSchema,
  pluginWindowPresentationSchema
} from '../../../shared/plugins/workers/plugin-host-api-window'
import { readNodeFileWithinLimit } from '../../../shared/file-content/node-bounded-file-reader'
import { writePluginFileAtomically } from '../installation/plugin-atomic-file-write'
import { PluginHostCallError } from '../workers/host-api/plugin-host-call-scope'

const savedSchema = z.record(
  z.string(),
  z.strictObject({
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    startup: pluginWindowPresentationSchema.nullable(),
    bounds: pluginWindowBoundsSchema.nullable(),
    opacity: z.number().min(0.2).max(1)
  })
)
export type PluginWindowPreference = z.infer<typeof savedSchema>[string]

export class PluginWindowPreferences {
  private readonly path: string
  private state: z.infer<typeof savedSchema> = {}
  private unreadable = false
  private readonly loading: Promise<void>
  private writes: Promise<void> = Promise.resolve()

  constructor(userDataPath: string) {
    this.path = join(userDataPath, 'plugin-window-presentation.json')
    this.loading = this.load()
  }

  private async load(): Promise<void> {
    try {
      const { buffer } = await readNodeFileWithinLimit(this.path, 1024 * 1024, {
        regularFileOnly: true
      })
      this.state = savedSchema.parse(JSON.parse(buffer.toString('utf8')))
    } catch (error) {
      this.unreadable = !(error instanceof Error && 'code' in error && error.code === 'ENOENT')
    }
  }

  whenReady(): Promise<void> {
    return this.loading
  }

  entries(): [string, PluginWindowPreference][] {
    return Object.entries(this.state)
  }

  get(key: string, revision: string): PluginWindowPreference {
    const old = this.state[key]
    return old?.revision === revision ? old : { revision, startup: null, bounds: null, opacity: 1 }
  }

  set(
    key: string,
    revision: string,
    patch: Partial<Omit<PluginWindowPreference, 'revision'>>,
    assertPublish: () => void = () => {}
  ): Promise<void> {
    const write = this.writes.then(async () => {
      await this.loading
      assertPublish()
      await this.write(key, revision, patch, assertPublish)
    })
    this.writes = write.catch(() => {})
    return write
  }

  private async write(
    key: string,
    revision: string,
    patch: Partial<Omit<PluginWindowPreference, 'revision'>>,
    assertPublish: () => void
  ): Promise<void> {
    if (this.unreadable) {
      throw new PluginHostCallError(
        'unavailable',
        'window preferences could not be read; refusing to overwrite them'
      )
    }
    const next = { ...this.state, [key]: { ...this.get(key, revision), ...patch } }
    const parsed = savedSchema.parse(next)
    const serialized = JSON.stringify(parsed, null, 2)
    if (Buffer.byteLength(serialized, 'utf8') > 1024 * 1024) {
      throw new PluginHostCallError('too_large', 'window preferences exceed the storage limit')
    }
    await writePluginFileAtomically(this.path, serialized, { mode: 0o600, assertPublish })
    this.state = parsed
  }
}
