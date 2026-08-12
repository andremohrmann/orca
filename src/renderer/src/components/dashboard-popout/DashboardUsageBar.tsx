import { AlertTriangle } from 'lucide-react'
import type { DashboardUsageSnapshot } from '../../../../shared/dashboard-snapshot'
import type { ProviderRateLimits, RateLimitWindow } from '../../../../shared/rate-limit-types'
import {
  clampUsedPercent,
  getDisplayedUsagePercentage,
  normalizeUsagePercentageDisplay,
  type UsagePercentageDisplay
} from '../../../../shared/usage-percentage-display'
import { normalizeStatusBarUsageMode } from '../../../../shared/status-bar-usage-mode'
import { formatRateLimitWindowChipLabel, formatWindowLabel } from '@/lib/window-label-formatter'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import {
  barColor,
  getProviderDisplayName,
  getProviderUsageStatusLabel,
  getWindowSections,
  ProviderIcon
} from '@/components/status-bar/tooltip'
import { formatUsagePercentageLabel } from '@/components/status-bar/usage-percentage-label'

type UsageSection = { label: string; window: RateLimitWindow }

function usageSections(provider: ProviderRateLimits): UsageSection[] {
  return getWindowSections(provider).filter(
    (section): section is UsageSection => section.window !== null && section.window !== undefined
  )
}

function dashboardUsageSection(provider: ProviderRateLimits): UsageSection | null {
  const sections = usageSections(provider)
  if (sections.length === 0) {
    return null
  }
  const tightest = sections.reduce((current, candidate) =>
    clampUsedPercent(candidate.window.usedPercent) > clampUsedPercent(current.window.usedPercent)
      ? candidate
      : current
  )
  if (provider.buckets?.some((bucket) => bucket.name === tightest.label)) {
    return tightest
  }
  if (tightest.window === provider.fableWeekly) {
    return { ...tightest, label: 'Fable' }
  }
  return { ...tightest, label: formatRateLimitWindowChipLabel(tightest.window) }
}

function windowLabel(provider: ProviderRateLimits, section: UsageSection): string {
  if (provider.buckets?.some((bucket) => bucket.name === section.label)) {
    return section.label
  }
  if (section.window === provider.fableWeekly) {
    return 'Fable'
  }
  return formatWindowLabel(section.window.windowMinutes)
}

function UsageProviderMeter({
  provider,
  compact,
  display
}: {
  provider: ProviderRateLimits
  compact: boolean
  display: UsagePercentageDisplay
}): React.JSX.Element {
  const section = dashboardUsageSection(provider)
  const statusLabel = getProviderUsageStatusLabel(provider)

  if (provider.status === 'idle' || (provider.status === 'fetching' && !section)) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <ProviderIcon provider={provider.provider} />
        <span className="animate-pulse">···</span>
      </span>
    )
  }

  if (provider.status === 'unavailable') {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground/50">
        <ProviderIcon provider={provider.provider} />
        <span>--</span>
      </span>
    )
  }

  if (!section) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <ProviderIcon provider={provider.provider} />
        <AlertTriangle className="size-3" />
        {!compact ? <span className="font-medium">{statusLabel}</span> : null}
      </span>
    )
  }

  const used = clampUsedPercent(section.window.usedPercent)
  const shown = getDisplayedUsagePercentage(section.window.usedPercent, display)
  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={`${getProviderDisplayName(provider.provider)} · ${formatUsagePercentageLabel(used, display)}`}
    >
      <ProviderIcon provider={provider.provider} />
      {!compact ? (
        <span className="text-muted-foreground">{getProviderDisplayName(provider.provider)}</span>
      ) : null}
      {!compact ? (
        <span className="text-muted-foreground/70">{windowLabel(provider, section)}</span>
      ) : null}
      <span className="h-[5px] w-8 overflow-hidden rounded-full bg-muted">
        <span
          className={cn('block h-full rounded-full', barColor(used))}
          style={{ width: `${shown}%` }}
        />
      </span>
      <span className="tabular-nums">{formatUsagePercentageLabel(used, display)}</span>
      {provider.status === 'error' ? (
        <AlertTriangle className="size-3 text-muted-foreground/80" />
      ) : null}
    </span>
  )
}

export function DashboardUsageBar({
  usage
}: {
  usage: DashboardUsageSnapshot | undefined
}): React.JSX.Element | null {
  if (!usage || usage.providers.length === 0) {
    return null
  }
  const display = normalizeUsagePercentageDisplay(usage.usagePercentageDisplay)
  const mode = normalizeStatusBarUsageMode(usage.statusBarUsageMode)
  const compact = mode === 'compact'

  return (
    <div className="scrollbar-sleek flex h-6 min-h-[24px] shrink-0 items-center gap-3 overflow-x-auto border-t border-border bg-[var(--bg-titlebar,var(--card))] px-3 text-xs text-muted-foreground select-none">
      <span className="shrink-0 text-[11px] font-medium">
        {translate('dashboardPopout.usage.label', 'Usage')}
      </span>
      <div className="flex min-w-0 items-center gap-3">
        {usage.providers.map((provider) => (
          <UsageProviderMeter
            key={provider.provider}
            provider={provider}
            compact={compact}
            display={display}
          />
        ))}
      </div>
    </div>
  )
}
