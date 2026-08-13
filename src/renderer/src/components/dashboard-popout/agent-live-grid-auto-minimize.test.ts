import { describe, expect, it } from 'vitest'
import type { DashboardCard } from '../../../../shared/dashboard-snapshot'
import { inactiveLivePaneKeys, liveCardActivityAt } from './agent-live-grid-auto-minimize'

const NOW = 1_000_000

function card(overrides: Partial<DashboardCard> = {}): DashboardCard {
  return {
    paneKey: 'pane-1',
    ptyId: 'pty-1',
    agentType: 'codex',
    bucket: 'working',
    dotState: 'working',
    task: 'Ship it',
    repoId: 'repo-1',
    worktreeId: 'worktree-1',
    tabId: 'tab-1',
    leafId: 'leaf-1',
    repoName: 'repo',
    worktreeName: 'workspace',
    startedAt: NOW - 20 * 60_000,
    finishedAt: null,
    stateChangedAt: NOW - 20 * 60_000,
    unseen: false,
    ...overrides
  }
}

describe('Live view auto-minimize', () => {
  it('uses the newest known card activity timestamp', () => {
    expect(
      liveCardActivityAt(
        card({
          startedAt: 1,
          stateChangedAt: 2,
          finishedAt: 3,
          statusUpdatedAt: 4
        })
      )
    ).toBe(4)
  })

  it('selects inactive live panes without hiding attention or manually restored panes', () => {
    const minimized = new Set<string>()
    const hidden = new Set<string>()
    const restoredAt = new Map<string, number>([['restored', NOW - 2 * 60_000]])

    expect(
      inactiveLivePaneKeys({
        cards: [
          card({ paneKey: 'inactive' }),
          card({ paneKey: 'fresh', statusUpdatedAt: NOW - 2 * 60_000 }),
          card({ paneKey: 'attention', bucket: 'attention', dotState: 'waiting' }),
          card({ paneKey: 'closed', ptyId: null }),
          card({ paneKey: 'restored' })
        ],
        minimizedPaneKeys: minimized,
        hiddenPaneKeys: hidden,
        restoredAtByPaneKey: restoredAt,
        now: NOW,
        afterMinutes: 5
      })
    ).toEqual(['inactive'])
  })

  it('does nothing while disabled', () => {
    expect(
      inactiveLivePaneKeys({
        cards: [card()],
        minimizedPaneKeys: new Set(),
        hiddenPaneKeys: new Set(),
        restoredAtByPaneKey: new Map(),
        now: NOW,
        afterMinutes: 0
      })
    ).toEqual([])
  })
})
