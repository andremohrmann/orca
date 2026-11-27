import { describe, expect, it } from 'vitest'
import {
  normalizeAgentDashboardLiveLayout,
  resetAgentDashboardLiveLayout
} from './agent-dashboard-live-layout'

describe('normalizeAgentDashboardLiveLayout', () => {
  it('only hides child agents when explicitly enabled, including saved layouts', () => {
    for (const layout of [null, {}, { hideChildAgents: 'true' }, { hideChildAgents: false }]) {
      expect(normalizeAgentDashboardLiveLayout(layout).hideChildAgents).toBe(false)
    }
    expect(normalizeAgentDashboardLiveLayout({ hideChildAgents: true }).hideChildAgents).toBe(true)
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

  it('round-trips only safe border overrides and clears them without losing layout state', () => {
    const saved = normalizeAgentDashboardLiveLayout({
      pinned: { pane: 2 },
      density: 'compact',
      borderColors: {
        attention: ' #12ABef ',
        working: '#39F',
        done: '20bc40',
        failed: 'url(https://example.invalid/color)',
        idle: '#ffffff'
      }
    })
    const restored = normalizeAgentDashboardLiveLayout(JSON.parse(JSON.stringify(saved)))
    expect(restored.borderColors).toEqual({
      attention: '#12abef',
      working: '#39f',
      done: '#20bc40'
    })
    const reset = normalizeAgentDashboardLiveLayout({ ...restored, borderColors: undefined })
    expect(reset.borderColors).toBeUndefined()
    expect(reset.pinned).toEqual({ pane: 2 })
    expect(reset.density).toBe('compact')
    const resetLayout = resetAgentDashboardLiveLayout(restored)
    expect(resetLayout.borderColors).toEqual(restored.borderColors)
    expect(resetLayout.pinned).toBeUndefined()
  })
})
