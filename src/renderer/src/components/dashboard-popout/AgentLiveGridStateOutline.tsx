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
  if (!attention && dashboardCardDisplayState(card) !== 'done') {
    return null
  }
  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-0 z-10 rounded-[inherit] border-2',
        attention ? 'border-agent-question/70' : 'border-status-success/70'
      )}
    />
  )
}
