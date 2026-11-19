import type { Terminal } from '@xterm/xterm'
import { installPreviewTerminalAppMenuClipboard } from '../standalone-terminal/input/preview-terminal-app-menu-clipboard'
import { installPreviewTerminalDomPasteShortcut } from './preview-terminal-dom-paste-shortcut'
import { installPreviewTerminalFocusReporting } from './preview-terminal-focus-reporting'
import { installPreviewTerminalRightClickPaste } from '../standalone-terminal/input/preview-terminal-right-click-paste'
import type { PreviewTerminalPasteSource } from '../standalone-terminal/input/preview-terminal-paste'

export function installPreviewTerminalInteractions({
  container,
  getTerminal,
  sendInput,
  requestInputRefresh,
  isRightClickToPasteEnabled,
  pasteClipboardText
}: {
  container: HTMLElement
  getTerminal: () => Terminal | null
  sendInput: (data: string) => void
  requestInputRefresh: () => void
  isRightClickToPasteEnabled: () => boolean
  pasteClipboardText: (activeElement: Element | null, source: PreviewTerminalPasteSource) => void
}): () => void {
  const disposers = [
    installPreviewTerminalFocusReporting({
      container,
      getTerminal,
      sendInput,
      requestInputRefresh
    }),
    installPreviewTerminalRightClickPaste({
      container,
      getTerminal,
      isRightClickToPasteEnabled,
      pasteClipboardText
    }),
    installPreviewTerminalDomPasteShortcut({ container, pasteClipboardText }),
    installPreviewTerminalAppMenuClipboard({ container, getTerminal, pasteClipboardText })
  ]
  return () => {
    for (const dispose of disposers) {
      dispose()
    }
  }
}
