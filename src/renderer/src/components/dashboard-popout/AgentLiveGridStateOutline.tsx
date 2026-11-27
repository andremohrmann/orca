import {
  dashboardCardDisplayState,
  type DashboardCard
} from '../../../../shared/agent-status/presentation/dashboard-snapshot'
import { cn } from '@/lib/class-names'
import type { AgentDashboardLiveBorderColors } from '../../../../shared/agent-dashboard-live-layout'

export function AgentLiveGridStateOutline({
  card,
  colors
}: {
  card: DashboardCard
  colors?: AgentDashboardLiveBorderColors
}): React.JSX.Element | null {
  const attention = card.bucket === 'attention'
  const state = dashboardCardDisplayState(card)
  const failed = state === 'failed'
  const working = state === 'working' || state === 'monitoring'
  if (!attention && state === 'idle') {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] bg-background/35 group-hover/live-window:opacity-0 group-focus-within/live-window:opacity-0 motion-safe:transition-opacity"
      />
    )
  }
  if (!attention && !failed && state !== 'done' && !working) {
    return null
  }
  const borderState = failed
    ? 'failed'
    : attention
      ? 'attention'
      : state === 'done'
        ? 'done'
        : 'working'
  const color = colors?.[borderState]
  if (borderState === 'working' && !color) {
    return null
  }
  return (
    <div
      aria-hidden="true"
      style={
        color
          ? {
              borderColor: `color-mix(in srgb, ${color} ${borderState === 'working' ? 25 : 70}%, transparent)`
            }
          : undefined
      }
      className={cn(
        'pointer-events-none absolute inset-0 z-10 rounded-[inherit] border-2',
        failed
          ? 'border-destructive/70'
          : attention
            ? 'border-agent-question/70'
            : state === 'done'
              ? 'border-status-success/70'
              : 'border-transparent'
      )}
    />
  )
}
