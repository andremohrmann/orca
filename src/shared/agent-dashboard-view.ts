export type AgentDashboardView = 'board' | 'live' | 'map'

export const DEFAULT_AGENT_DASHBOARD_VIEW: AgentDashboardView = 'board'

export function isAgentDashboardView(value: unknown): value is AgentDashboardView {
  return value === 'board' || value === 'live' || value === 'map'
}

export function normalizeAgentDashboardView(value: unknown): AgentDashboardView {
  return isAgentDashboardView(value) ? value : DEFAULT_AGENT_DASHBOARD_VIEW
}
