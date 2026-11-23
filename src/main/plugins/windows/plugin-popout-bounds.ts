import type { BrowserWindow } from 'electron'

export function trackPluginPopoutBounds(
  window: BrowserWindow,
  parent: BrowserWindow,
  rememberBounds: () => void,
  onClosed: () => void
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const close = (): void => {
    rememberBounds()
    if (!window.isDestroyed()) {
      window.destroy()
    }
  }
  const schedule = (): void => {
    if (timer) {
      clearTimeout(timer)
    }
    timer = setTimeout(rememberBounds, 300)
  }
  parent.once('closed', close)
  window.on('resize', schedule)
  window.on('move', schedule)
  window.on('close', rememberBounds)
  window.once('closed', () => {
    if (timer) {
      clearTimeout(timer)
    }
    parent.removeListener('closed', close)
    onClosed()
  })
  return close
}
