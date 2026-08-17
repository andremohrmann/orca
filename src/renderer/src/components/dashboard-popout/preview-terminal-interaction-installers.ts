import type { Terminal } from '@xterm/xterm'
import { installPreviewTerminalDomPasteShortcut } from './preview-terminal-dom-paste-shortcut'
import { installPreviewTerminalFocusReporting } from './preview-terminal-focus-reporting'

export function installPreviewTerminalInteractions({
  container,
  getTerminal,
  sendInput,
  requestInputRefresh,
  installContextMenu,
  pasteClipboardText
}: {
  container: HTMLElement
  getTerminal: () => Terminal | null
  sendInput: (data: string) => void
  requestInputRefresh: () => void
  installContextMenu: (container: HTMLElement, getTerminal: () => Terminal | null) => () => void
  pasteClipboardText: (activeElement: Element | null, source: 'keyboard') => void
}): () => void {
  const disposers = [
    installPreviewTerminalFocusReporting({
      container,
      getTerminal,
      sendInput,
      requestInputRefresh
    }),
    installContextMenu(container, getTerminal),
    installPreviewTerminalDomPasteShortcut({ container, pasteClipboardText })
  ]
  return () => {
    for (const dispose of disposers) {
      dispose()
    }
  }
}
