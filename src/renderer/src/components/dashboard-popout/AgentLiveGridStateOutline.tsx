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
  const failed = state === 'failed'
  const working = state === 'working' || state === 'monitoring'
  if (!attention && !failed && state !== 'done' && !working) {
    return null
  }
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 z-10 rounded-[inherit] border-2',
        failed
          ? 'border-destructive/70'
          : attention
            ? 'border-agent-question/70'
            : state === 'done'
              ? 'border-status-success/70'
              : 'border-agent-working/25'
      )}
    />
  )
}
