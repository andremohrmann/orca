import type { AppState } from '@/store/types'
import type { DashboardUsageSnapshot } from '../../../../shared/dashboard-snapshot'
import type { ProviderRateLimits, RateLimitState } from '../../../../shared/rate-limit-types'
import type { StatusBarUsageMode } from '../../../../shared/status-bar-usage-mode'
import type { UsagePercentageDisplay } from '../../../../shared/usage-percentage-display'
import { isStatusBarItemAvailable } from '../status-bar/status-bar-agent-gating'
import { getVisibleUsageProvider } from '../status-bar/status-bar-provider-visibility'

export type DashboardUsageSnapshotState = {
  rateLimits: RateLimitState
  statusBarItems: AppState['statusBarItems']
  usagePercentageDisplay: UsagePercentageDisplay
  statusBarUsageMode: StatusBarUsageMode
}

export function buildDashboardUsageSnapshot(
  state: Partial<DashboardUsageSnapshotState> &
    Partial<Pick<AppState, 'settings' | 'detectedAgentIds'>>
): DashboardUsageSnapshot | undefined {
  const rateLimits = state.rateLimits
  const statusBarItems = state.statusBarItems ?? []
  if (!rateLimits || statusBarItems.length === 0) {
    return undefined
  }
  const detectedAgentIds = state.detectedAgentIds ?? null
  const antigravityUsageConfigured =
    statusBarItems.includes('antigravity') &&
    isStatusBarItemAvailable('antigravity', detectedAgentIds)
  const usageSettings = {
    ...state.settings,
    antigravityUsageConfigured,
    minimaxCookieConfigured: rateLimits.minimaxCookieConfigured,
    grokAuthConfigured: rateLimits.grokAuthConfigured
  }
  const providerEntries: [ProviderRateLimits['provider'], ProviderRateLimits | null | undefined][] =
    [
      ['claude', rateLimits.claude],
      ['codex', rateLimits.codex],
      ['gemini', rateLimits.gemini],
      ['antigravity', rateLimits.antigravity],
      ['opencode-go', rateLimits.opencodeGo],
      ['kimi', rateLimits.kimi],
      ['minimax', rateLimits.minimax],
      ['grok', rateLimits.grok]
    ]
  const providers = providerEntries
    .filter(([id]) => statusBarItems.includes(id) && isStatusBarItemAvailable(id, detectedAgentIds))
    .map(([id, provider]) => getVisibleUsageProvider(id, provider, usageSettings))
    .filter((provider): provider is ProviderRateLimits => provider !== null)

  if (providers.length === 0) {
    return undefined
  }
  return {
    providers,
    usagePercentageDisplay: state.usagePercentageDisplay,
    statusBarUsageMode: state.statusBarUsageMode
  }
}
