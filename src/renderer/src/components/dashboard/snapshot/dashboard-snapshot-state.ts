import type {
  DashboardSnapshotInput as StockInput,
  DashboardSnapshotState as StockState
} from './build-dashboard-snapshot'
import type { DashboardUsageSnapshotState } from '../dashboard-usage-snapshot'

export type DashboardSnapshotState = StockState & Partial<DashboardUsageSnapshotState>
export type DashboardSnapshotInput = StockInput & Partial<DashboardUsageSnapshotState>
