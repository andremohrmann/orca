import { HEX_COLOR_RE } from './color/color-validation'

export type AgentDashboardLiveDensity = 'auto' | 'compact' | 'comfortable' | 'large'
export type AgentDashboardLiveSort = 'manual' | 'attention' | 'workspace' | 'recent'

export const AGENT_DASHBOARD_LIVE_BORDER_STATES = [
  'attention',
  'working',
  'done',
  'failed'
] as const
export type AgentDashboardLiveBorderState = (typeof AGENT_DASHBOARD_LIVE_BORDER_STATES)[number]
export type AgentDashboardLiveBorderColors = Partial<Record<AgentDashboardLiveBorderState, string>>

export type AgentDashboardLiveLayout = {
  order?: string[]
  pinned?: Record<string, number>
  minimized?: string[]
  hidden?: string[]
  names?: Record<string, string>
  density?: AgentDashboardLiveDensity
  sort?: AgentDashboardLiveSort
  hideClosed?: boolean
  hideChildAgents?: boolean
  borderColors?: AgentDashboardLiveBorderColors
  /** Minutes before inactive Live view windows auto-minimize. 0 disables it. */
  autoMinimizeAfterMinutes?: number
}

export const DEFAULT_AGENT_DASHBOARD_LIVE_LAYOUT: AgentDashboardLiveLayout = {
  density: 'auto',
  sort: 'manual',
  hideClosed: false,
  hideChildAgents: false,
  autoMinimizeAfterMinutes: 0
}

export function resetAgentDashboardLiveLayout(
  layout: AgentDashboardLiveLayout
): AgentDashboardLiveLayout {
  return { ...DEFAULT_AGENT_DASHBOARD_LIVE_LAYOUT, borderColors: layout.borderColors }
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

function pinnedPositions(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const positions = new Set<number>()
  const entries = Object.entries(value).filter(([key, position]) => {
    if (
      !key ||
      typeof position !== 'number' ||
      !Number.isInteger(position) ||
      position < 0 ||
      position > 1023 ||
      positions.has(position)
    ) {
      return false
    }
    positions.add(position)
    return true
  })
  return entries.length ? Object.fromEntries(entries) : undefined
}

function namesRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] =>
      typeof entry[0] === 'string' && typeof entry[1] === 'string' && entry[1].trim().length > 0
  )
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

export function isAgentDashboardLiveDensity(value: unknown): value is AgentDashboardLiveDensity {
  return value === 'auto' || value === 'compact' || value === 'comfortable' || value === 'large'
}

export function isAgentDashboardLiveSort(value: unknown): value is AgentDashboardLiveSort {
  return value === 'manual' || value === 'attention' || value === 'workspace' || value === 'recent'
}

function autoMinimizeAfterMinutes(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }
  return Math.min(1_440, Math.max(0, Math.round(value)))
}

export function normalizeAgentDashboardLiveBorderColors(
  value: unknown
): AgentDashboardLiveBorderColors | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const entries = Object.entries(value).filter(
    (entry): entry is [AgentDashboardLiveBorderState, string] =>
      AGENT_DASHBOARD_LIVE_BORDER_STATES.some((state) => state === entry[0]) &&
      typeof entry[1] === 'string' &&
      HEX_COLOR_RE.test(entry[1].trim())
  )
  return entries.length
    ? Object.fromEntries(
        entries.map(([state, color]) => [state, `#${color.trim().replace(/^#/, '').toLowerCase()}`])
      )
    : undefined
}

export function normalizeAgentDashboardLiveLayout(value: unknown): AgentDashboardLiveLayout {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_AGENT_DASHBOARD_LIVE_LAYOUT
  }
  const layout = value as AgentDashboardLiveLayout
  return {
    order: stringArray(layout.order),
    pinned: pinnedPositions(layout.pinned),
    minimized: stringArray(layout.minimized),
    hidden: stringArray(layout.hidden),
    names: namesRecord(layout.names),
    density: isAgentDashboardLiveDensity(layout.density) ? layout.density : 'auto',
    sort: isAgentDashboardLiveSort(layout.sort) ? layout.sort : 'manual',
    hideClosed: layout.hideClosed === true,
    hideChildAgents: layout.hideChildAgents === true,
    borderColors: normalizeAgentDashboardLiveBorderColors(layout.borderColors),
    autoMinimizeAfterMinutes: autoMinimizeAfterMinutes(layout.autoMinimizeAfterMinutes)
  }
}
