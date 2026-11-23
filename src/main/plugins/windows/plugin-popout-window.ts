import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import type { z } from 'zod'
import {
  pluginFrameKey,
  pluginFramePartition
} from '../../../shared/plugins/frames/plugin-frame-guest'
import type { pluginWindowBoundsSchema } from '../../../shared/plugins/workers/plugin-host-api-window'
import { rectHasVisibleAreaOnAnyDisplay } from '../../window/presentation/window-bounds-validation'
import { installPrivilegedWindowNavigationPolicy } from '../../window/security/privileged-window-navigation'
import { hardenPluginFrameGuestPreferences } from '../../window/security/main-window-webview-security'
import {
  admitPluginFrameAttach,
  attachPluginFrameGuest
} from '../panels/guest-isolation/plugin-frame-guest-registry'
import { installPluginDesktopFrameServices } from '../panels/desktop-actions/plugin-frame-desktop-services'
import type { Store } from '../../persistence/loading-store/store'
import { isMacAppPasteInput } from '../../window/editing/mac-app-paste-input'

export function createPluginPopoutWindow(input: {
  pluginId: string
  title: string
  bounds: z.infer<typeof pluginWindowBoundsSchema> | null
  opacity: number
  store: Pick<Store, 'getSettings' | 'updateSettings'>
}): BrowserWindow {
  const { pluginId, bounds } = input
  const usable = bounds && rectHasVisibleAreaOnAnyDisplay(bounds, 240, 180) ? bounds : null
  const window = new BrowserWindow({
    width: usable?.width ?? 960,
    height: usable?.height ?? 720,
    ...(usable ? { x: usable.x, y: usable.y } : {}),
    minWidth: 480,
    minHeight: 360,
    show: false,
    autoHideMenuBar: true,
    title: input.title,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: `orca-plugin-popout-${pluginFrameKey(pluginId)}`,
      additionalArguments: ['--orca-plugin-popout'],
      webviewTag: true
    }
  })
  installPrivilegedWindowNavigationPolicy(window.webContents)
  window.webContents.on('before-input-event', (event, input) => {
    if (isMacAppPasteInput(input)) {
      event.preventDefault()
      window.webContents.send('ui:appMenuPaste')
    }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false)
  )
  window.webContents.session.setPermissionCheckHandler(() => false)
  installPluginDesktopFrameServices(window, input.store)
  window.webContents.on('will-attach-webview', (event, preferences, params) => {
    const partition = preferences.partition ?? ''
    if (
      partition !== pluginFramePartition(pluginFrameKey(pluginId)) ||
      !admitPluginFrameAttach(partition, params.src)
    ) {
      event.preventDefault()
      return
    }
    hardenPluginFrameGuestPreferences(
      preferences,
      join(__dirname, 'plugin-frame-guest-preload.js'),
      partition
    )
    delete params.preload
    delete params.allowpopups
  })
  window.webContents.on('did-attach-webview', (_event, guest) => {
    if (!attachPluginFrameGuest(guest, window.webContents)) {
      guest.close()
    }
  })
  if (process.platform !== 'linux') {
    window.setOpacity(input.opacity)
  }
  window.on('page-title-updated', (event) => event.preventDefault())
  return window
}
