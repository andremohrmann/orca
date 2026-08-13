import type { DashboardCard } from '../../../../shared/dashboard-snapshot'

const MINUTE_MS = 60_000

export function liveCardActivityAt(card: DashboardCard): number {
  return Math.max(
    card.statusUpdatedAt ?? 0,
    card.stateChangedAt,
    card.finishedAt ?? 0,
    card.startedAt
  )
}

export function inactiveLivePaneKeys(args: {
  cards: DashboardCard[]
  minimizedPaneKeys: ReadonlySet<string>
  hiddenPaneKeys: ReadonlySet<string>
  restoredAtByPaneKey: ReadonlyMap<string, number>
  now: number
  afterMinutes: number
}): string[] {
  if (args.afterMinutes <= 0) {
    return []
  }
  const cutoff = args.now - args.afterMinutes * MINUTE_MS
  return args.cards
    .filter((card) => {
      if (
        !card.ptyId ||
        card.bucket === 'attention' ||
        args.minimizedPaneKeys.has(card.paneKey) ||
        args.hiddenPaneKeys.has(card.paneKey)
      ) {
        return false
      }
      const restoredAt = args.restoredAtByPaneKey.get(card.paneKey) ?? 0
      return Math.max(liveCardActivityAt(card), restoredAt) <= cutoff
    })
    .map((card) => card.paneKey)
}
