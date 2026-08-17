import type { Terminal } from '@xterm/xterm'

export function installPreviewTerminalFocusReporting({
  container,
  getTerminal,
  sendInput,
  requestInputRefresh
}: {
  container: HTMLElement
  getTerminal: () => Terminal | null
  sendInput: (data: string) => void
  requestInputRefresh: () => void
}): () => void {
  const reportTerminalFocus = (focused: boolean): void => {
    if (!getTerminal()?.modes.sendFocusMode) {
      return
    }
    sendInput(focused ? '\x1b[I' : '\x1b[O')
    requestInputRefresh()
  }
  const handleFocusIn = (event: FocusEvent): void => {
    if (event.target instanceof Element && event.target.closest('.xterm')) {
      reportTerminalFocus(true)
    }
  }
  const handleFocusOut = (event: FocusEvent): void => {
    if (!container.contains(event.relatedTarget as Node | null)) {
      reportTerminalFocus(false)
    }
  }
  container.addEventListener('focusin', handleFocusIn)
  container.addEventListener('focusout', handleFocusOut)
  return () => {
    container.removeEventListener('focusin', handleFocusIn)
    container.removeEventListener('focusout', handleFocusOut)
  }
}
