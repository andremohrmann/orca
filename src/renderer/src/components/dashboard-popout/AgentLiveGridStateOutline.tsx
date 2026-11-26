import {
  dashboardCardDisplayState,
  type DashboardCard
} from '../../../../shared/agent-status/presentation/dashboard-snapshot'
import { cn } from '@/lib/class-names'

export function AgentLiveGridStateOutline({
  card
}: {
  card: DashboardCard
}): React.JSX.Element | null {
  const attention = card.bucket === 'attention'
  const state = dashboardCardDisplayState(card)
  const working = state === 'working' || state === 'monitoring'
  if (!attention && state !== 'done' && !working) {
    return null
  }
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 z-10 rounded-[inherit] border-2',
        attention
          ? 'border-agent-question/70'
          : state === 'done'
            ? 'border-status-success/70'
            : 'border-agent-working/25 bg-agent-working/[0.025]'
      )}
    />
  )
}
