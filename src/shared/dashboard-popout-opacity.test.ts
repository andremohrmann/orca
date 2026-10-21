import { describe, expect, it } from 'vitest'
import { normalizeDashboardPopoutOpacity } from './dashboard-popout-opacity'

describe('normalizeDashboardPopoutOpacity', () => {
  it('keeps the window recoverable and rejects invalid persisted values', () => {
    expect(normalizeDashboardPopoutOpacity(0.734)).toBe(0.73)
    expect(normalizeDashboardPopoutOpacity(0)).toBe(0.2)
    expect(normalizeDashboardPopoutOpacity(2)).toBe(1)
    expect(normalizeDashboardPopoutOpacity(Number.NaN)).toBe(1)
  })
})
