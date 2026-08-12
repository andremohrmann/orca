import { describe, expect, it } from 'vitest'
import type { DashboardCard } from '../../../../shared/dashboard-snapshot'
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
})
