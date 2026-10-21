import { describe, expect, it } from 'vitest'
import { getAgentLiveGridColumns } from './agent-live-grid-layout'

describe('getAgentLiveGridColumns', () => {
  it('lays twelve terminals out as a readable widescreen mosaic', () => {
    expect(getAgentLiveGridColumns(12, 1920, 1080)).toBe(4)
  })

  it('adapts the split direction to the available viewport', () => {
    expect(getAgentLiveGridColumns(6, 1600, 900)).toBe(3)
    expect(getAgentLiveGridColumns(6, 900, 1600)).toBe(2)
  })

  it('keeps empty measurements and a single terminal stable', () => {
    expect(getAgentLiveGridColumns(8, 0, 0)).toBe(1)
    expect(getAgentLiveGridColumns(1, 1920, 1080)).toBe(1)
  })

  it('lets density trade off count against readability', () => {
    expect(getAgentLiveGridColumns(8, 1920, 1080, 'compact')).toBeGreaterThan(
      getAgentLiveGridColumns(8, 1920, 1080, 'large')
    )
  })
})
