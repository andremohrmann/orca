import type { DashboardCard } from '../../../../shared/dashboard-snapshot'
import type {
  AgentDashboardLiveLayout,
  AgentDashboardLiveSort
} from '../../../../shared/agent-dashboard-live-layout'

const BUCKET_RANK = { attention: 0, working: 1, done: 2, idle: 3 } as const

function cardLabel(card: DashboardCard): string {
  return `${card.worktreeName || card.repoName || card.conversationName || ''} ${
    card.conversationName || ''
  }`.toLowerCase()
}

export function sortedLiveCards(
  cards: DashboardCard[],
  sort: AgentDashboardLiveSort
): DashboardCard[] {
  const next = [...cards]
  if (sort === 'attention') {
    return next.sort((a, b) => BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket])
  }
  if (sort === 'workspace') {
    return next.sort((a, b) => cardLabel(a).localeCompare(cardLabel(b)))
  }
  if (sort === 'recent') {
    return next.sort((a, b) => b.stateChangedAt - a.stateChangedAt)
  }
  return next
}

export function mergeLiveOrder(
  cards: DashboardCard[],
  layout: AgentDashboardLiveLayout
): DashboardCard[] {
  const sorted = sortedLiveCards(cards, layout.sort ?? 'manual')
  if ((layout.sort ?? 'manual') !== 'manual') {
    return sorted
  }
  const cardsByPaneKey = new Map(cards.map((card) => [card.paneKey, card]))
  const retained = (layout.order ?? [])
    .map((paneKey) => cardsByPaneKey.get(paneKey))
    .filter((card): card is DashboardCard => card !== undefined)
  const retainedKeys = new Set(retained.map((card) => card.paneKey))
  return [...retained, ...cards.filter((card) => !retainedKeys.has(card.paneKey))]
}

export function orderedPaneKeys(cards: DashboardCard[]): string[] {
  return cards.map((card) => card.paneKey)
}
