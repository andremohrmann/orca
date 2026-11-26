import type { DashboardCard } from '../../../../shared/agent-status/presentation/dashboard-snapshot'
import type { AgentDashboardLiveLayout } from '../../../../shared/agent-dashboard-live-layout'

export function placeLiveCards<T extends DashboardCard>(
  cards: T[],
  pinned: AgentDashboardLiveLayout['pinned']
): (T | null)[] {
  const slots: (T | null)[] = Array.from({ length: cards.length }, () => null)
  const remaining: T[] = []
  for (const card of cards) {
    const position = pinned?.[card.paneKey]
    if (
      typeof position !== 'number' ||
      !Number.isInteger(position) ||
      position < 0 ||
      position > 1023 ||
      slots[position]
    ) {
      remaining.push(card)
      continue
    }
    while (slots.length <= position) {
      slots.push(null)
    }
    slots[position] = card
  }
  let index = 0
  for (const card of remaining) {
    while (slots[index]) {
      index++
    }
    slots[index++] = card
  }
  return slots
}

export function toggleLivePin(
  layout: AgentDashboardLiveLayout,
  paneKey: string,
  position: number
): AgentDashboardLiveLayout {
  const pinned = { ...layout.pinned }
  if (typeof pinned[paneKey] === 'number') {
    delete pinned[paneKey]
  } else {
    pinned[paneKey] = position
  }
  return { ...layout, pinned }
}
