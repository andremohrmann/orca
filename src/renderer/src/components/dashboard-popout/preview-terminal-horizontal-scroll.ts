import { clearPreviewTerminalTimer } from './preview-terminal-session'
import { resetPreviewTerminalHorizontalScroll } from './preview-terminal-fit'

export function createPreviewTerminalHorizontalScrollReset(container: HTMLElement): {
  schedule: () => void
  dispose: () => void
} {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    schedule: () => {
      clearPreviewTerminalTimer(timer)
      timer = setTimeout(() => {
        timer = null
        resetPreviewTerminalHorizontalScroll(container)
      }, 60)
    },
    dispose: () => clearPreviewTerminalTimer(timer)
  }
}
