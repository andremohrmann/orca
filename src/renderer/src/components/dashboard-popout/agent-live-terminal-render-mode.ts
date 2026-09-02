import type { DashboardCardDotState } from '../../../../shared/dashboard-snapshot'

export function liveTerminalUsesSourceGrid(state: DashboardCardDotState): boolean {
  return state === 'working' || state === 'waiting' || state === 'blocked'
}
