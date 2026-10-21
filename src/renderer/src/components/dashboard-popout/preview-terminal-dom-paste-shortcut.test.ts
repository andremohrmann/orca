// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest'
import { installPreviewTerminalDomPasteShortcut } from './preview-terminal-dom-paste-shortcut'

vi.mock('@/lib/shortcut-platform', () => ({
  getShortcutPlatform: () => 'linux'
}))

describe('installPreviewTerminalDomPasteShortcut', () => {
  it('handles plain Ctrl+V before the terminal app-menu fallback', () => {
    const container = document.createElement('div')
    const input = document.createElement('input')
    container.appendChild(input)
    document.body.appendChild(container)
    input.focus()
    const pasteClipboardText = vi.fn()
    const dispose = installPreviewTerminalDomPasteShortcut({ container, pasteClipboardText })
    const event = new KeyboardEvent('keydown', {
      key: 'v',
      code: 'KeyV',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    })

    input.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(pasteClipboardText).toHaveBeenCalledWith(input, 'keyboard')
    dispose()
  })

  it('ignores shifted paste chords so the terminal key handler can own them', () => {
    const container = document.createElement('div')
    const pasteClipboardText = vi.fn()
    const dispose = installPreviewTerminalDomPasteShortcut({ container, pasteClipboardText })

    container.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'V',
        code: 'KeyV',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true
      })
    )

    expect(pasteClipboardText).not.toHaveBeenCalled()
    dispose()
  })
})
