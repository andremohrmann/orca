import { app, type BrowserWindow } from 'electron'
import type { PluginService } from '../plugin-service'
import type { Store } from '../../persistence/loading-store/store'
import { PluginWindowService, setPluginWindowService } from './plugin-window-service'

export function installPluginWindowPresentation(
  service: PluginService,
  getMainWindow: () => BrowserWindow | null,
  store: Store
): void {
  const windows = new PluginWindowService(service, getMainWindow, store)
  setPluginWindowService(windows)
  const restore = (): void => {
    void windows.restoreStartup()
  }
  const mainWindow = getMainWindow()
  if (mainWindow && !mainWindow.webContents.isLoading()) {
    restore()
  } else if (mainWindow) {
    mainWindow.webContents.once('did-finish-load', restore)
  } else {
    const onWindow = (_event: Electron.Event, window: BrowserWindow): void => {
      window.webContents.once('did-finish-load', () => {
        if (getMainWindow() === window) {
          app.off('browser-window-created', onWindow)
          restore()
        }
      })
    }
    app.on('browser-window-created', onWindow)
    app.once('will-quit', () => app.off('browser-window-created', onWindow))
  }
  app.once('will-quit', () => setPluginWindowService(null))
}
