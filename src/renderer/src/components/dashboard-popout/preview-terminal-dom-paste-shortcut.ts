import { getShortcutPlatform } from '@/lib/shortcut-platform'
import { keybindingMatchesAction } from '../../../../shared/keybindings'

export function installPreviewTerminalDomPasteShortcut({
  container,
  pasteClipboardText
}: {
  container: HTMLElement
  pasteClipboardText: (activeElement: Element | null, source: 'keyboard') => void
}): () => void {
  const handleKeyDown = (event: KeyboardEvent): void => {
    const platform = getShortcutPlatform()
    const isMenuPasteChord =
      (platform === 'darwin' ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === 'v'
    if (!isMenuPasteChord || !keybindingMatchesAction('terminal.paste', event, platform, {})) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    pasteClipboardText(document.activeElement, 'keyboard')
  }
  container.addEventListener('keydown', handleKeyDown, { capture: true })
  return () => container.removeEventListener('keydown', handleKeyDown, { capture: true })
}
