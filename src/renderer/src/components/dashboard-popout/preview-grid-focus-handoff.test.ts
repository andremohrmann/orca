// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreviewGridFocusHandoff } from './preview-grid-focus-handoff'

function previewBox(): HTMLElement {
  const box = document.createElement('div')
  const container = document.createElement('div')
  const screen = document.createElement('div')
  screen.className = 'xterm-screen'
  box.append(container)
  container.append(screen)
  Object.defineProperties(box, { clientWidth: { value: 800 }, clientHeight: { value: 480 } })
  Object.defineProperties(screen, { offsetWidth: { value: 800 }, offsetHeight: { value: 384 } })
  return container
}

describe('preview grid focus handoff', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it.each([false, true])(
    'does not crop a new main-window session when the background preview mounts (release on blur: %s)',
    async (releaseOnWindowBlur) => {
      vi.useFakeTimers()
      const focus = vi.spyOn(document, 'hasFocus').mockReturnValue(false)
      const fit = vi.fn(async () => ({ cols: 80, rows: 30 }))
      const releaseFit = vi.fn(async () => {})
      const claim = createPreviewGridFocusHandoff({
        claimGrid: true,
        releaseOnWindowBlur,
        ptyId: 'new-session',
        container: previewBox(),
        getTerminal: () => ({ cols: 80, rows: 24 }) as never,
        transport: { fit, releaseFit }
      })
      try {
        claim.requestNow()
        claim.schedule()
        await vi.advanceTimersByTimeAsync(200)
        expect(fit).not.toHaveBeenCalled()

        focus.mockReturnValue(true)
        window.dispatchEvent(new Event('focus'))
        await vi.waitFor(() => expect(fit).toHaveBeenCalledExactlyOnceWith('new-session', 80, 30))
      } finally {
        claim.dispose()
      }
    }
  )

  it('preserves the held Live View grid on blur but cancels background resize claims', async () => {
    vi.useFakeTimers()
    const focus = vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    const fit = vi.fn(async () => ({ cols: 80, rows: 30 }))
    const releaseFit = vi.fn(async () => {})
    const container = previewBox()
    const claim = createPreviewGridFocusHandoff({
      claimGrid: true,
      releaseOnWindowBlur: false,
      ptyId: 'session',
      container,
      getTerminal: () => ({ cols: 80, rows: 24 }) as never,
      transport: { fit, releaseFit }
    })
    try {
      claim.schedule()
      focus.mockReturnValue(false)
      window.dispatchEvent(new Event('blur'))
      await vi.advanceTimersByTimeAsync(200)
      expect(fit).not.toHaveBeenCalled()
      expect(releaseFit).not.toHaveBeenCalled()

      focus.mockReturnValue(true)
      window.dispatchEvent(new Event('focus'))
      expect(fit).toHaveBeenCalledTimes(1)
      focus.mockReturnValue(false)
      window.dispatchEvent(new Event('blur'))
      expect(releaseFit).not.toHaveBeenCalled()
      claim.reclaim()
      expect(fit).toHaveBeenCalledTimes(1)
      focus.mockReturnValue(true)
      window.dispatchEvent(new Event('focus'))
      expect(fit).toHaveBeenCalledTimes(2)
    } finally {
      claim.dispose()
    }
    window.dispatchEvent(new Event('focus'))
    expect(fit).toHaveBeenCalledTimes(2)
  })
})
