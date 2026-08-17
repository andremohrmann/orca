import { useCallback, useRef, useState } from 'react'
import type { Terminal } from '@xterm/xterm'
import { useAppStore } from '@/store'
import { PreviewTerminalContextMenu } from './PreviewTerminalContextMenu'

type PreviewClipboardPaster = (
  activeElementAtDispatch: Element | null,
  source: 'keyboard' | 'app-menu'
) => Promise<void>

export function usePreviewTerminalContextMenu(
  terminalRef: React.MutableRefObject<Terminal | null>
): {
  pasteClipboardTextRef: React.MutableRefObject<PreviewClipboardPaster | null>
  installContextMenu: (container: HTMLElement, getTerminal: () => Terminal | null) => () => void
  contextMenu: React.ReactNode
} {
  const keybindings = useAppStore((state) => state.keybindings)
  const pasteClipboardTextRef = useRef<PreviewClipboardPaster | null>(null)
  const [menu, setMenu] = useState({
    open: false,
    point: { x: 0, y: 0 }
  })

  const installContextMenu = useCallback(
    (container: HTMLElement, getTerminal: () => Terminal | null): (() => void) => {
      const handleContextMenu = (event: MouseEvent): void => {
        const terminal = getTerminal()
        if (!terminal) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        terminal.focus()
        const frame = container.closest<HTMLElement>('[data-preview-terminal-frame="true"]')
        const bounds = frame?.getBoundingClientRect()
        setMenu({
          open: true,
          point: bounds
            ? { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
            : { x: event.clientX, y: event.clientY }
        })
      }
      container.addEventListener('contextmenu', handleContextMenu, { capture: true })
      return () =>
        container.removeEventListener('contextmenu', handleContextMenu, { capture: true })
    },
    []
  )

  const contextMenu = (
    <PreviewTerminalContextMenu
      open={menu.open}
      onOpenChange={(open) => setMenu((current) => ({ ...current, open }))}
      point={menu.point}
      keybindings={keybindings}
      onCopy={() => {
        const selection = terminalRef.current?.getSelection()
        if (selection) {
          void window.api.ui.writeTerminalClipboardText(selection).catch(() => undefined)
        }
        terminalRef.current?.focus()
      }}
      onSelectAll={() => {
        terminalRef.current?.selectAll()
        terminalRef.current?.focus()
      }}
      onPaste={() => {
        terminalRef.current?.focus()
        void pasteClipboardTextRef.current?.(document.activeElement, 'app-menu')
      }}
    />
  )

  return { pasteClipboardTextRef, installContextMenu, contextMenu }
}
