// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { useEffect, useRef } from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Terminal } from '@xterm/xterm'
import { usePreviewTerminalContextMenu } from './usePreviewTerminalContextMenu'

vi.mock('@/store', () => {
  const state = { keybindings: {} }
  const useAppStore = (selector: (value: typeof state) => unknown): unknown => selector(state)
  useAppStore.getState = (): typeof state => state
  return { useAppStore }
})

function Fixture({ terminal }: { terminal: Terminal }): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(terminal)
  const { installContextMenu, contextMenu } = usePreviewTerminalContextMenu(terminalRef)
  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }
    return installContextMenu(host, () => terminalRef.current)
  }, [installContextMenu])
  return (
    <div data-preview-terminal-frame="true">
      <div ref={hostRef} data-testid="terminal-host" />
      {contextMenu}
    </div>
  )
}

describe('usePreviewTerminalContextMenu', () => {
  const writeTerminalClipboardText = vi.fn(async () => {})

  beforeEach(() => {
    Object.assign(window, {
      api: {
        ui: { writeTerminalClipboardText }
      }
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('opens on right-click and copies the preview terminal selection', async () => {
    const terminal = {
      focus: vi.fn(),
      getSelection: () => 'selected text',
      selectAll: vi.fn()
    } as unknown as Terminal
    const view = render(<Fixture terminal={terminal} />)

    fireEvent.contextMenu(view.getByTestId('terminal-host'), { clientX: 20, clientY: 30 })
    fireEvent.click(await view.findByText('Copy'))

    await waitFor(() => expect(writeTerminalClipboardText).toHaveBeenCalledWith('selected text'))
    expect(terminal.focus).toHaveBeenCalled()
  })
})
