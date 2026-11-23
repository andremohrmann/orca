import type { WebContents } from 'electron'
import { isPluginPopoutRenderer } from '../../plugins/windows/plugin-window-service'
import { isTrustedUIRenderer } from '../ui'
import type { PluginService } from '../../plugins/plugin-service'
import { rendererPanelOwner } from '../plugins/plugin-frame-entry-ipc'

let plugins: PluginService | null = null
let stopChanged = (): void => {}
let stopSessionClosed = (): void => {}
const rechecks = new Set<() => void>()
export function bindTerminalSurfacePlugins(service: PluginService): void {
  stopChanged()
  stopSessionClosed()
  plugins = service
  for (const recheck of rechecks) {
    recheck()
  }
  stopSessionClosed = service.panels.onSessionClosed(() => {
    for (const recheck of rechecks) {
      recheck()
    }
  })
  stopChanged = service.onChanged(() => {
    for (const recheck of rechecks) {
      recheck()
    }
  })
}

export function terminalSurfacePermitted(
  contents: WebContents,
  sessionToken: string,
  interactive: boolean
): boolean {
  if (
    contents.isDestroyed() ||
    !(isTrustedUIRenderer(contents) || isPluginPopoutRenderer(contents))
  ) {
    return false
  }
  const session = plugins?.panels.sessionCaller(rendererPanelOwner(contents.id), sessionToken)
  if (!session) {
    return false
  }
  const capabilities = plugins?.getGrantedCapabilities(session.pluginKey)
  return (
    capabilities?.includes('terminal:read') === true &&
    (!interactive || capabilities.includes('terminal:send'))
  )
}

export function observeTerminalSurfaceApproval(recheck: () => void): () => void {
  rechecks.add(recheck)
  return () => {
    rechecks.delete(recheck)
  }
}

export function terminalSurfaceUserDataPath(
  contents: WebContents,
  sessionToken: string
): string | null {
  return terminalSurfacePermitted(contents, sessionToken, false)
    ? plugins!.options.userDataPath
    : null
}
