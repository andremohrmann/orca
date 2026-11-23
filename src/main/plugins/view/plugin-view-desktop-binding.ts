import { app, nativeImage, type BrowserWindow } from 'electron'
import { setPluginViewForRpc } from '../../runtime/rpc/methods/plugins/plugin-view'
import { listPluginsForClients } from '../discovery/plugin-client-list'
import type { PluginService } from '../plugin-service'
import {
  livePluginFrameGuests,
  setPluginFrameGuestLogSink
} from '../panels/guest-isolation/plugin-frame-guest-diagnostics'
import { createPluginViewDesktop } from './plugin-view-desktop'
import { isPluginShotWindowShown } from './plugin-shot-policy'
import {
  setPluginHostRendererRequest,
  setPluginExistingAgentReveal
} from './plugin-host-renderer-actions'
import { requestPluginViewFromRenderer } from './plugin-view-renderer-relay'
import { revealPluginExistingAgent } from './plugin-existing-agent-reveal'
import type { PluginRuntimeRpc } from '../workers/host-api/plugin-host-runtime-call'
import { PluginHostCallError } from '../workers/host-api/plugin-host-call-scope'

const HOST_ACTION_TIMEOUT_MS = 10_000

/** Guest console lines into plugin logs, and `plugins.open` / `plugins.shot` for the desktop
 *  app; a headless serve leaves open and shot refusing. */
export function bindPluginDesktopViews(
  serveMode: boolean,
  service: PluginService,
  getMainWindow: () => BrowserWindow | null,
  runtimeRpc?: PluginRuntimeRpc
): void {
  setPluginFrameGuestLogSink((pluginKey) => service.captureLog(pluginKey))
  if (serveMode) {
    setPluginViewForRpc(null)
    setPluginHostRendererRequest(null)
    setPluginExistingAgentReveal(null)
    return
  }
  // The one main window, so a worker's editor.open and commands.run always reach the same one.
  setPluginHostRendererRequest((body) => {
    const window = getMainWindow()
    return window && !window.isDestroyed()
      ? requestPluginViewFromRenderer(window.webContents, body, HOST_ACTION_TIMEOUT_MS)
      : null
  })
  setPluginExistingAgentReveal((input, scope, pluginId) => {
    const window = getMainWindow()
    if (!window || window.isDestroyed()) {
      throw new PluginHostCallError('unavailable', 'Orca has no window open to reveal this chat')
    }
    return revealPluginExistingAgent(
      input,
      scope,
      (body) => requestPluginViewFromRenderer(window.webContents, body, HOST_ACTION_TIMEOUT_MS),
      runtimeRpc,
      pluginId
    )
  })
  setPluginViewForRpc(
    createPluginViewDesktop({
      rendererContents: () => {
        const window = getMainWindow()
        return window && !window.isDestroyed() ? window.webContents : null
      },
      windowShown: () => {
        const window = getMainWindow()
        return window !== null && isPluginShotWindowShown(window)
      },
      source: {
        list: () => listPluginsForClients(service),
        findValidPlugin: (pluginKey) => service.findValidPlugin(pluginKey)
      },
      logsSince: (pluginKey, cursor) => service.getLogsSince(pluginKey, cursor),
      guestsOf: livePluginFrameGuests,
      imageFromBitmap: (bitmap, size) => nativeImage.createFromBitmap(bitmap, size),
      shotScratchRoot: () => app.getPath('temp')
    })
  )
}
