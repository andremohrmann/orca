import { randomUUID } from 'node:crypto'
import type { ValidDiscoveredPlugin } from '../discovery/plugin-discovery'

export class PluginAuthorizationLifetimes {
  private readonly approved = new Map<string, { epoch: string; subject: string }>()
  private readonly departing = new Map<string, Set<symbol>>()

  epochFor(key: string, plugin: ValidDiscoveredPlugin | null): string | null {
    if (!plugin || this.departing.has(key)) {
      this.approved.delete(key)
      return null
    }
    const subject = JSON.stringify([
      plugin.rootDir,
      plugin.contentHash,
      plugin.consentFingerprint,
      plugin.devRevision,
      plugin.manifest
    ])
    const current = this.approved.get(key)
    if (current?.subject === subject) {
      return current.epoch
    }
    const epoch = randomUUID()
    this.approved.set(key, { epoch, subject })
    return epoch
  }

  retainApproved(approved: (key: string) => boolean): void {
    for (const key of this.approved.keys()) {
      if (!approved(key)) {
        this.approved.delete(key)
      }
    }
  }

  retire(key: string): void {
    this.approved.delete(key)
  }

  beginDeparture(key: string): () => void {
    this.retire(key)
    const pending = this.departing.get(key) ?? new Set<symbol>()
    const token = Symbol('plugin-departure')
    pending.add(token)
    this.departing.set(key, pending)
    return () => {
      if (!pending.delete(token)) {
        return
      }
      if (!pending.size && this.departing.get(key) === pending) {
        this.departing.delete(key)
      }
    }
  }

  clear(): void {
    this.approved.clear()
    this.departing.clear()
  }
}
