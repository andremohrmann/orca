import type { WebContents } from 'electron'

export class PluginTerminalSurfaceCapacity {
  private readonly waiters = new Set<WebContents>()
  wait(contents: WebContents): { unavailable: 'capacity' } {
    if (this.waiters.size < 128) {
      this.waiters.add(contents)
    }
    return { unavailable: 'capacity' }
  }
  release(): void {
    const waiters = [...this.waiters]
    this.waiters.clear()
    for (const contents of waiters) {
      if (contents.isDestroyed()) {
        continue
      }
      try {
        contents.send('pluginTerminalSurface:available')
      } catch {
        continue
      }
    }
  }
}
