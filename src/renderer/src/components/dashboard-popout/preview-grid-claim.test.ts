// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreviewGridClaim } from './preview-grid-claim'

function dimension(element: HTMLElement, name: string, value: number): void {
  Object.defineProperty(element, name, { configurable: true, value })
}

describe('createPreviewGridClaim', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('waits for a resize signal instead of polling while layout is unmeasurable', async () => {
    vi.useFakeTimers()
    const fit = vi.fn(async () => ({ cols: 90, rows: 30 }))
    Object.assign(window, { api: { terminalPreview: { fit } } })
    const box = document.createElement('div')
    const container = document.createElement('div')
    const screen = document.createElement('div')
    screen.className = 'xterm-screen'
    box.appendChild(container)
    container.appendChild(screen)
    dimension(box, 'clientWidth', 900)
    dimension(box, 'clientHeight', 480)
    dimension(screen, 'offsetWidth', 0)
    dimension(screen, 'offsetHeight', 0)
    const onFitApplied = vi.fn()
    const claim = createPreviewGridClaim({
      ptyId: 'pty-1',
      container,
      getTerminal: () => ({ cols: 80, rows: 24 }) as never,
      onFitApplied
    })

    claim.schedule()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(fit).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)

    dimension(screen, 'offsetWidth', 800)
    dimension(screen, 'offsetHeight', 384)
    claim.schedule()
    await vi.advanceTimersByTimeAsync(200)
    expect(fit).toHaveBeenCalledWith('pty-1', 90, 30)
    expect(onFitApplied).toHaveBeenCalledOnce()
    claim.dispose()
  })

  it('coalesces a continuous resize burst into one settled fit request', async () => {
    vi.useFakeTimers()
    const fit = vi.fn(async (_ptyId: string, cols: number, rows: number) => ({ cols, rows }))
    Object.assign(window, { api: { terminalPreview: { fit } } })
    const box = document.createElement('div')
    const container = document.createElement('div')
    const screen = document.createElement('div')
    screen.className = 'xterm-screen'
    box.appendChild(container)
    container.appendChild(screen)
    dimension(box, 'clientWidth', 800)
    dimension(box, 'clientHeight', 480)
    dimension(screen, 'offsetWidth', 800)
    dimension(screen, 'offsetHeight', 384)
    const claim = createPreviewGridClaim({
      ptyId: 'pty-1',
      container,
      getTerminal: () => ({ cols: 80, rows: 24 }) as never
    })

    claim.schedule()
    for (let step = 1; step <= 10; step += 1) {
      await vi.advanceTimersByTimeAsync(100)
      dimension(box, 'clientWidth', 800 + step * 20)
      claim.schedule()
    }

    expect(fit).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    expect(fit).toHaveBeenCalledTimes(1)
    expect(fit).toHaveBeenCalledWith('pty-1', 100, 30)
    claim.dispose()
  })

  it('reclaims an unchanged grid after another terminal surface takes ownership', async () => {
    const fit = vi.fn(async (_ptyId: string, cols: number, rows: number) => ({ cols, rows }))
    Object.assign(window, { api: { terminalPreview: { fit } } })
    const box = document.createElement('div')
    const container = document.createElement('div')
    const screen = document.createElement('div')
    screen.className = 'xterm-screen'
    box.appendChild(container)
    container.appendChild(screen)
    dimension(box, 'clientWidth', 800)
    dimension(box, 'clientHeight', 480)
    dimension(screen, 'offsetWidth', 800)
    dimension(screen, 'offsetHeight', 384)
    const claim = createPreviewGridClaim({
      ptyId: 'pty-1',
      container,
      getTerminal: () => ({ cols: 80, rows: 24 }) as never
    })

    claim.requestNow()
    claim.requestNow()
    expect(fit).toHaveBeenCalledTimes(1)

    claim.reclaim()
    expect(fit).toHaveBeenCalledTimes(2)
    expect(fit).toHaveBeenLastCalledWith('pty-1', 80, 30)
    claim.dispose()
  })

  it('releases ownership without disconnecting and can reclaim the same grid', async () => {
    const fit = vi.fn(async (_ptyId: string, cols: number, rows: number) => ({ cols, rows }))
    let resolveRelease!: () => void
    const releaseFit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRelease = resolve
        })
    )
    Object.assign(window, { api: { terminalPreview: { fit, releaseFit } } })
    const box = document.createElement('div')
    const container = document.createElement('div')
    const screen = document.createElement('div')
    screen.className = 'xterm-screen'
    box.appendChild(container)
    container.appendChild(screen)
    dimension(box, 'clientWidth', 800)
    dimension(box, 'clientHeight', 480)
    dimension(screen, 'offsetWidth', 800)
    dimension(screen, 'offsetHeight', 384)
    const claim = createPreviewGridClaim({
      ptyId: 'pty-1',
      container,
      getTerminal: () => ({ cols: 80, rows: 24 }) as never
    })

    claim.requestNow()
    claim.release()
    expect(releaseFit).toHaveBeenCalledWith('pty-1')

    claim.reclaim()
    expect(fit).toHaveBeenCalledTimes(1)
    resolveRelease()
    await vi.waitFor(() => expect(fit).toHaveBeenCalledTimes(2))
    expect(fit).toHaveBeenCalledTimes(2)
    expect(fit).toHaveBeenLastCalledWith('pty-1', 80, 30)
    claim.dispose()
  })

  it('cancels pending claims and ignores resize signals while inactive', async () => {
    vi.useFakeTimers()
    const fit = vi.fn(async () => ({ cols: 80, rows: 30 }))
    const releaseFit = vi.fn(async () => {})
    Object.assign(window, { api: { terminalPreview: { fit, releaseFit } } })
    const box = document.createElement('div')
    const container = document.createElement('div')
    const screen = document.createElement('div')
    screen.className = 'xterm-screen'
    box.appendChild(container)
    container.appendChild(screen)
    dimension(box, 'clientWidth', 800)
    dimension(box, 'clientHeight', 480)
    dimension(screen, 'offsetWidth', 800)
    dimension(screen, 'offsetHeight', 384)
    let active = true
    const claim = createPreviewGridClaim({
      ptyId: 'pty-1',
      container,
      getTerminal: () => ({ cols: 80, rows: 24 }) as never,
      isActive: () => active
    })

    claim.schedule()
    active = false
    claim.release()
    await vi.advanceTimersByTimeAsync(200)
    claim.schedule()
    claim.requestNow()
    expect(fit).not.toHaveBeenCalled()
    expect(releaseFit).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    claim.dispose()
  })
})
