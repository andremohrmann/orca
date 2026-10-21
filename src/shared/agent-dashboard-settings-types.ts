import type { AgentDashboardLiveLayout } from './agent-dashboard-live-layout'
import type { AgentDashboardView } from './agent-dashboard-view'
import type { AgentDashboardMode } from './ui-chrome-types'

export type AgentDashboardSettings = {
  /** Experimental: pop-out Kanban dashboard for monitoring and opening agent terminals across worktrees. */
  experimentalAgentDashboardPopout?: boolean
  /** How the Agent Dashboard opens: an in-window companion board or a separate pop-out window. Defaults to in-window. */
  experimentalAgentDashboardMode?: AgentDashboardMode
  /** Default dashboard surface when opening from the sidebar. */
  experimentalAgentDashboardDefaultView?: AgentDashboardView
  /** Opens the dashboard directly to Live view after startup when enabled. */
  experimentalAgentDashboardOpenLiveOnStartup?: boolean
  /** Live view ordering, density, names, and auto-minimize preferences. */
  experimentalAgentDashboardLiveLayout?: AgentDashboardLiveLayout
  /** Includes stale quiet agents as a fourth Agent Dashboard column. */
  experimentalAgentDashboardShowIdle?: boolean
}
