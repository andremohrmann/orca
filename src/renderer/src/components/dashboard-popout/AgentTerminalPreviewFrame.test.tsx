// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { createRef } from 'react'
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AgentTerminalPreviewFrame } from './AgentTerminalPreviewFrame'

describe('AgentTerminalPreviewFrame', () => {
  it('reclaims and focuses a live preview when activated', () => {
    const onActivate = vi.fn()
    const terminalRef = { current: { focus: vi.fn() } }

    const view = render(
      <AgentTerminalPreviewFrame
        containerRef={createRef<HTMLDivElement>()}
        terminalRef={terminalRef as never}
        ptyGone={false}
        onActivate={onActivate}
        terminalTheme={null}
      />
    )

    fireEvent.pointerDown(view.container.firstElementChild!)

    expect(onActivate).toHaveBeenCalledOnce()
    expect(terminalRef.current.focus).toHaveBeenCalledOnce()
  })

  it('routes closed preview clicks to the restore action', () => {
    const onClosedActivate = vi.fn()
    const terminalRef = { current: { focus: vi.fn() } }

    const view = render(
      <AgentTerminalPreviewFrame
        containerRef={createRef<HTMLDivElement>()}
        terminalRef={terminalRef as never}
        ptyGone={true}
        onClosedActivate={onClosedActivate}
        terminalTheme={null}
      />
    )

    fireEvent.pointerDown(view.container.firstElementChild!)
    fireEvent.click(view.getByRole('button', { name: /No live terminal/ }))

    expect(terminalRef.current.focus).not.toHaveBeenCalled()
    expect(onClosedActivate).toHaveBeenCalledOnce()
  })
})
