// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest'
import type { Terminal } from '@xterm/xterm'
import {
  fitPreviewTerminalToBox,
  resetPreviewTerminalHorizontalScroll
} from './preview-terminal-fit'

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

  it('clips the rendered screen to the preview box after fitting', () => {
    const container = fixture({ boxWidth: 600, boxHeight: 300, screenWidth: 900 })

    fitPreviewTerminalToBox({
      container,
      terminal: terminal(),
      scaleToFit: true,
      onUnscaledOverflow: vi.fn()
    })

    const screen = container.querySelector<HTMLElement>('.xterm-screen')!
    expect(container.style.overflow).toBe('hidden')
    expect(screen.style.overflow).toBe('hidden')
  })

  it('resets horizontal xterm scroll drift', () => {
    const container = document.createElement('div')
    const viewport = document.createElement('div')
    viewport.className = 'xterm-viewport'
    viewport.scrollLeft = 120
    const screen = document.createElement('div')
    screen.className = 'xterm-screen'
    screen.scrollLeft = 80
    container.append(viewport, screen)

    resetPreviewTerminalHorizontalScroll(container)

    expect(viewport.scrollLeft).toBe(0)
    expect(screen.scrollLeft).toBe(0)
  })
})
