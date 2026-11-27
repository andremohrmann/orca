import type { AppState } from '@/store/types'
import type { DashboardUsageSnapshot } from '../../../../shared/agent-status/presentation/dashboard-snapshot'
import type {
  ProviderRateLimits,
  RateLimitState
} from '../../../../shared/agent-usage/rate-limits/rate-limit-types'
import type { StatusBarUsageMode } from '../../../../shared/status-bar/status-bar-usage-mode'
import type { UsagePercentageDisplay } from '../../../../shared/agent-usage/display/usage-percentage-display'
import { isStatusBarItemAvailable } from '../status-bar/composition/status-bar-agent-gating'
import { getVisibleUsageProvider } from '../status-bar/composition/status-bar-provider-visibility'
import { mapProviders, USAGE_PROVIDER_IDS } from '../status-bar/usage/owner-usage-rate-limits'

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
  const usageSettings = {
    ...state.settings,
    minimaxCookieConfigured: rateLimits.minimaxCookieConfigured,
    minimaxApiKeyConfigured: rateLimits.minimaxApiKeyConfigured,
    opencodeGoApiKeyConfigured: rateLimits.opencodeGoApiKeyConfigured,
    zcodePlanApiKeyConfigured: rateLimits.zcodePlanApiKeyConfigured,
    cursorAuthConfigured: rateLimits.cursorAuthConfigured,
    grokAuthConfigured: rateLimits.grokAuthConfigured
  }
  const providers = Object.values(
    mapProviders((key) => {
      const id = USAGE_PROVIDER_IDS[key]
      return statusBarItems.includes(id) && isStatusBarItemAvailable(id, detectedAgentIds)
        ? getVisibleUsageProvider(id, rateLimits[key], usageSettings)
        : null
    })
  ).filter((provider): provider is ProviderRateLimits => provider !== null)

  if (providers.length === 0) {
    return undefined
  }
  return {
    providers,
    usagePercentageDisplay: state.usagePercentageDisplay,
    statusBarUsageMode: state.statusBarUsageMode
  }
}
