// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest'
import { installPreviewGridFocusOwnership } from './preview-grid-focus-ownership'

describe('installPreviewGridFocusOwnership', () => {
  it('releases on blur, reclaims on focus, and removes both listeners', () => {
    const reclaim = vi.fn()
    const release = vi.fn()
    const target = new EventTarget() as Window
    const dispose = installPreviewGridFocusOwnership({
      enabled: true,
      reclaim,
      release,
      target,
      isFocused: () => true
    })

    target.dispatchEvent(new Event('blur'))
    target.dispatchEvent(new Event('focus'))
    expect(release).toHaveBeenCalledOnce()
    expect(reclaim).toHaveBeenCalledOnce()

    dispose()
    target.dispatchEvent(new Event('blur'))
    target.dispatchEvent(new Event('focus'))
    expect(release).toHaveBeenCalledOnce()
    expect(reclaim).toHaveBeenCalledOnce()
  })

  it('immediately releases a claim installed in a background window', () => {
    const release = vi.fn()
    installPreviewGridFocusOwnership({
      enabled: true,
      reclaim: vi.fn(),
      release,
      target: new EventTarget() as Window,
      isFocused: () => false
    })

    expect(release).toHaveBeenCalledOnce()
  })
})
