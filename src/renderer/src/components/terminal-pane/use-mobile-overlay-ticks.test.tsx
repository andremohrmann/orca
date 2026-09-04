// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { PaneManager } from '@/lib/pane-manager/pane-manager'
import { hydrateOverrides, setFitOverride } from '@/lib/pane-manager/mobile-fit-overrides'
import { DESKTOP_FIT_RENDERER_REASSERT_DELAY_MS } from '../../../../shared/terminal-desktop-fit-timing'
import { useMobileOverlayTicks } from './use-mobile-overlay-ticks'

vi.mock('@/lib/pane-manager/pane-tree-ops', () => ({ safeFit: vi.fn() }))
vi.mock('./desktop-fit-fallback', () => ({ applyDesktopFitFallbackAfterReplay: vi.fn() }))

describe('useMobileOverlayTicks desktop restore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    hydrateOverrides([])
  })

  afterEach(() => {
    cleanup()
    hydrateOverrides([])
    vi.useRealTimers()
  })

  function renderDesktopRestoreHook() {
    const pane = {
      id: 1,
      terminal: { cols: 160, rows: 48 },
      container: { getBoundingClientRect: () => ({ width: 800, height: 600 }) }
    }
    const reassertPtySizeAfterWindowWake = vi.fn()
    const managerRef = {
      current: { getPanes: () => [pane] } as unknown as PaneManager
    }
    const paneTransportsRef = {
      current: new Map([[1, { getPtyId: () => 'pty-1' }]])
    }
    const panePtyBindingsRef = {
      current: new Map([[1, { dispose: vi.fn(), reassertPtySizeAfterWindowWake }]])
    }
    const isVisibleRef = { current: true }
    renderHook(() =>
      useMobileOverlayTicks({
        managerRef,
        paneTransportsRef,
        panePtyBindingsRef,
        isVisibleRef
      })
    )
    return reassertPtySizeAfterWindowWake
  }

  it('reasserts the desktop PTY size after main stops suppressing renderer resizes', () => {
    const reassertPtySizeAfterWindowWake = renderDesktopRestoreHook()

    act(() => {
      setFitOverride('pty-1', 'remote-desktop-fit', 80, 18)
      setFitOverride('pty-1', 'desktop-fit', 160, 48)
    })

    act(() => vi.advanceTimersByTime(DESKTOP_FIT_RENDERER_REASSERT_DELAY_MS - 1))
    expect(reassertPtySizeAfterWindowWake).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1))
    expect(reassertPtySizeAfterWindowWake).toHaveBeenCalledTimes(1)
  })

  it('does not apply a stale desktop reassertion after Live View retakes the grid', () => {
    const reassertPtySizeAfterWindowWake = renderDesktopRestoreHook()

    act(() => {
      setFitOverride('pty-1', 'remote-desktop-fit', 80, 18)
      setFitOverride('pty-1', 'desktop-fit', 160, 48)
      setFitOverride('pty-1', 'remote-desktop-fit', 90, 22)
      vi.advanceTimersByTime(DESKTOP_FIT_RENDERER_REASSERT_DELAY_MS)
    })

    expect(reassertPtySizeAfterWindowWake).not.toHaveBeenCalled()
  })
})
