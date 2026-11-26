import { buildDashboardSnapshot } from './build-dashboard-snapshot'
import type { DashboardSnapshotInput } from './dashboard-snapshot-state'
import { buildDashboardUsageSnapshot } from '../dashboard-usage-snapshot'

export function buildCustomDashboardSnapshot(
  state: DashboardSnapshotInput,
  ...args: Parameters<typeof buildDashboardSnapshot> extends [unknown, ...infer Rest] ? Rest : never
): ReturnType<typeof buildDashboardSnapshot> {
  return {
    ...buildDashboardSnapshot(state, ...args),
    usage: buildDashboardUsageSnapshot(state)
  }
}
