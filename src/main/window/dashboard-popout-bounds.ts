import { app, type BrowserWindow, type Event } from 'electron'
import type { NativeSettingsProjection } from '../core-desktop/native-settings-projection'
import { rectHasVisibleAreaOnAnyDisplay } from './presentation/window-bounds-validation'

export function resolveDashboardPopoutBounds(
  nativeSettings: NativeSettingsProjection | null,
  minWidth: number,
  minHeight: number
): {
  x: number
  y: number
  width: number
  height: number
} | null {
  const raw = nativeSettings?.getUI().dashboardPopoutBounds ?? null
  if (
    raw &&
    raw.width >= minWidth &&
    raw.height >= minHeight &&
    rectHasVisibleAreaOnAnyDisplay(raw, minWidth / 2, minHeight / 2)
  ) {
    return raw
  }
  if (raw) {
    console.warn('[dashboard-popout] Discarding off-screen/near-min popout bounds:', raw)
  }
  return null
}

export function installDashboardPopoutBoundsPersistence(
  window: BrowserWindow,
  nativeSettings: NativeSettingsProjection | null,
  minWidth: number,
  minHeight: number
): void {
  // Freeze/debounce remembered bounds during teardown so resize events cannot replace them with minimum size.
  let boundsTimer: ReturnType<typeof setTimeout> | null = null
  let windowClosing = false
  const saveBounds = (): void => {
    if (boundsTimer) {
      clearTimeout(boundsTimer)
    }
    boundsTimer = setTimeout(() => {
      boundsTimer = null
      if (
        windowClosing ||
        window.isDestroyed() ||
        window.isMinimized() ||
        window.isFullScreen() ||
        window.isMaximized()
      ) {
        return
      }
      const bounds = window.getBounds()
      if (bounds.width < minWidth || bounds.height < minHeight) {
        return
      }
      void nativeSettings?.requestCoreWrite({
        kind: 'ui',
        updates: { dashboardPopoutBounds: bounds, dashboardPopoutMaximized: false }
      })
    }, 500)
  }
  window.on('resize', saveBounds)
  window.on('move', saveBounds)
  window.on('maximize', () => {
    void nativeSettings?.requestCoreWrite({
      kind: 'ui',
      updates: { dashboardPopoutMaximized: true }
    })
  })
  window.on('unmaximize', () => {
    void nativeSettings?.requestCoreWrite({
      kind: 'ui',
      updates: { dashboardPopoutMaximized: false }
    })
  })

  const freezeBounds = (event?: Event): void => {
    if (event?.defaultPrevented) {
      return
    }
    windowClosing = true
    if (boundsTimer) {
      clearTimeout(boundsTimer)
      boundsTimer = null
    }
  }
  window.on('close', freezeBounds)
  app.on('before-quit', freezeBounds)

  window.on('closed', () => {
    freezeBounds()
    app.removeListener('before-quit', freezeBounds)
  })
}
