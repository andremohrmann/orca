// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreviewTerminalHorizontalScrollReset } from './preview-terminal-horizontal-scroll'

describe('createPreviewTerminalHorizontalScrollReset', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('resets horizontal xterm scroll after the submit delay', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    const viewport = document.createElement('div')
    viewport.className = 'xterm-viewport'
    viewport.scrollLeft = 100
    container.appendChild(viewport)
    const reset = createPreviewTerminalHorizontalScrollReset(container)

    reset.schedule()
    expect(viewport.scrollLeft).toBe(100)
    await vi.advanceTimersByTimeAsync(60)

    expect(viewport.scrollLeft).toBe(0)
  })
})
