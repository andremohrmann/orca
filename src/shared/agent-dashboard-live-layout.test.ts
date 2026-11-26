import { describe, expect, it } from 'vitest'
import { normalizeAgentDashboardLiveLayout } from './agent-dashboard-live-layout'

describe('normalizeAgentDashboardLiveLayout', () => {
  it('only hides child agents when explicitly enabled, including saved layouts', () => {
    for (const layout of [null, {}, { hideChildAgents: 'true' }, { hideChildAgents: false }]) {
      expect(normalizeAgentDashboardLiveLayout(layout).hideChildAgents).toBe(false)
    }
    expect(normalizeAgentDashboardLiveLayout({ hideChildAgents: true }).hideChildAgents).toBe(true)
  })

  it('defaults Live auto-minimize off', () => {
    expect(normalizeAgentDashboardLiveLayout(null).autoMinimizeAfterMinutes).toBe(0)
  })

  it('normalizes the Live auto-minimize minutes range', () => {
    expect(
      normalizeAgentDashboardLiveLayout({ autoMinimizeAfterMinutes: 15.4 }).autoMinimizeAfterMinutes
    ).toBe(15)
    expect(
      normalizeAgentDashboardLiveLayout({ autoMinimizeAfterMinutes: -1 }).autoMinimizeAfterMinutes
    ).toBe(0)
    expect(
      normalizeAgentDashboardLiveLayout({ autoMinimizeAfterMinutes: 9_999 })
        .autoMinimizeAfterMinutes
    ).toBe(1_440)
    expect(
      normalizeAgentDashboardLiveLayout({ autoMinimizeAfterMinutes: '10' }).autoMinimizeAfterMinutes
    ).toBe(0)
  })
  it('rejects invalid or duplicate persisted slots without allocating an unbounded grid', () => {
    expect(
      normalizeAgentDashboardLiveLayout({
        pinned: {
          a: 2,
          duplicate: 2,
          negative: -1,
          fraction: 1.5,
          huge: 1e9,
          text: '1',
          b: 0
        }
      }).pinned
    ).toEqual({ a: 2, b: 0 })
  })
})
