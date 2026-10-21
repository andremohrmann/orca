import type { Terminal } from '@xterm/xterm'
import { installPreviewTerminalDomPasteShortcut } from './preview-terminal-dom-paste-shortcut'
import { installPreviewTerminalFocusReporting } from './preview-terminal-focus-reporting'
import { installPreviewTerminalRightClickPaste } from './preview-terminal-right-click-paste'
import type { PreviewTerminalPasteSource } from './preview-terminal-paste'

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
    installPreviewTerminalDomPasteShortcut({ container, pasteClipboardText })
  ]
  return () => {
    for (const dispose of disposers) {
      dispose()
    }
  }
}
