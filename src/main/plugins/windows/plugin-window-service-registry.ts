import type { PluginWindowService } from './plugin-window-service'

let desktopWindows: PluginWindowService | null = null

export function getPluginWindowService(): PluginWindowService | null {
  return desktopWindows
}

export function setPluginWindowService(service: PluginWindowService | null): void {
  desktopWindows?.dispose()
  desktopWindows = service
}
