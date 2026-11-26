import { describe, expect, it } from 'vitest'
import type { DashboardCard } from '../../../../shared/agent-status/presentation/dashboard-snapshot'
import { placeLiveCards, toggleLivePin } from './agent-live-grid-pins'
import { normalizeAgentDashboardLiveLayout } from '../../../../shared/agent-dashboard-live-layout'
import { mergeLiveOrder, moveLiveCardBefore, sortedLiveCards } from './agent-live-grid-order'

function card(paneKey: string, overrides: Partial<DashboardCard> = {}): DashboardCard {
  return {
    paneKey,
    ptyId: paneKey,
    agentType: 'codex',
    bucket: 'working',
    dotState: 'working',
    task: paneKey,
    repoId: 'repo',
    worktreeId: paneKey,
    tabId: paneKey,
    leafId: paneKey,
    repoName: 'repo',
    worktreeName: paneKey,
    startedAt: 1,
    finishedAt: null,
    stateChangedAt: 1,
    unseen: false,
    ...overrides
  }
}

describe('agent live grid order', () => {
  it('merges persisted manual order with new live cards', () => {
    expect(
      mergeLiveOrder([card('a'), card('b'), card('c')], { order: ['b', 'a'] }).map(
        (item) => item.paneKey
      )
    ).toEqual(['b', 'a', 'c'])
  })

  it('sorts attention cards first', () => {
    expect(
      sortedLiveCards(
        [card('done', { bucket: 'done' }), card('attention', { bucket: 'attention' })],
        'attention'
      ).map((item) => item.paneKey)
    ).toEqual(['attention', 'done'])
  })

  it('moves a dragged live card before the drop target', () => {
    expect(
      moveLiveCardBefore([card('a'), card('b'), card('c')], 'c', 'a').map((item) => item.paneKey)
    ).toEqual(['c', 'a', 'b'])
  })
  it('keeps saved pins in their slots through sorting, removal and restoration', () => {
    const layout = normalizeAgentDashboardLiveLayout(
      JSON.parse(JSON.stringify(toggleLivePin({}, 'b', 2)))
    )
    const keys = (cards: (DashboardCard | null)[]) => cards.map((item) => item?.paneKey ?? null)
    const cards = [card('b'), card('a'), card('c')]
    expect(keys(placeLiveCards(sortedLiveCards(cards, 'workspace'), layout.pinned))).toEqual([
      'a',
      'c',
      'b'
    ])
    expect(keys(placeLiveCards([card('a'), card('b')], layout.pinned))).toEqual(['a', null, 'b'])
    expect(keys(placeLiveCards([card('a')], layout.pinned))).toEqual(['a'])
    expect(keys(placeLiveCards(cards, toggleLivePin(layout, 'b', 2).pinned))).toEqual([
      'b',
      'a',
      'c'
    ])
  })
})
