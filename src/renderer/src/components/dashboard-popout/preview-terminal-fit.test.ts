// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest'
import type { Terminal } from '@xterm/xterm'
import { fitPreviewTerminalToBox } from './preview-terminal-fit'

function terminal(rows = 24): Terminal {
  return { rows, buffer: { active: { cursorY: rows - 1 } } } as Terminal
}

function fixture(args: { boxWidth: number; boxHeight: number; screenWidth: number }): HTMLElement {
  const box = document.createElement('div')
  Object.defineProperty(box, 'clientWidth', { configurable: true, value: args.boxWidth })
  Object.defineProperty(box, 'clientHeight', { configurable: true, value: args.boxHeight })
  const container = document.createElement('div')
  const screen = document.createElement('div')
  screen.className = 'xterm-screen'
  Object.defineProperty(screen, 'offsetWidth', { configurable: true, value: args.screenWidth })
  Object.defineProperty(screen, 'offsetHeight', { configurable: true, value: 384 })
  container.appendChild(screen)
  box.appendChild(container)
  document.body.appendChild(box)
  return container
}

describe('fitPreviewTerminalToBox', () => {
  it('requests a grid claim when an unscaled live-view terminal overflows horizontally', () => {
    const container = fixture({ boxWidth: 600, boxHeight: 300, screenWidth: 900 })
    const onUnscaledOverflow = vi.fn()

    fitPreviewTerminalToBox({
      container,
      terminal: terminal(),
      scaleToFit: false,
      onUnscaledOverflow
    })

    expect(container.style.transform).toBe('')
    expect(onUnscaledOverflow).toHaveBeenCalledOnce()
  })
})
