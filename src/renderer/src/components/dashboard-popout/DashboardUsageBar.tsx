import { AlertTriangle } from 'lucide-react'
import type { DashboardUsageSnapshot } from '../../../../shared/agent-status/presentation/dashboard-snapshot'
import type {
  ProviderRateLimits,
  RateLimitWindow
} from '../../../../shared/agent-usage/rate-limits/rate-limit-types'
import {
  clampUsedPercent,
  getDisplayedUsagePercentage,
  normalizeUsagePercentageDisplay,
  type UsagePercentageDisplay
} from '../../../../shared/agent-usage/display/usage-percentage-display'
import { normalizeStatusBarUsageMode } from '../../../../shared/status-bar/status-bar-usage-mode'
import {
  formatRateLimitWindowChipLabel,
  formatWindowLabel
} from '../../../../shared/agent-usage/rate-limits/rate-limit-window-label'
import { getProviderDisplayName } from '../../../../shared/agent-usage/display/usage-provider-windows'
import { cn } from '@/lib/class-names'
import { useTranslate, type Translate } from '@/i18n/use-translate'
import { getWindowSections, ProviderIcon } from '@/components/status-bar/usage/provider-usage-panel'
import { getProviderUsageStatusLabel } from '../../../../shared/agent-usage/status-copy/usage-error-copy'
import { usageBarClass } from '@/components/status-bar/usage/usage-health-tone'
import { formatUsagePercentageLabel } from '@/components/status-bar/usage/usage-percentage-label'

type UsageSection = { label: string; window: RateLimitWindow }

function usageSections(provider: ProviderRateLimits, t?: Translate): UsageSection[] {
  return getWindowSections(provider, t).filter(
    (section): section is UsageSection => section.window !== null && section.window !== undefined
  )
}

function dashboardUsageSection(provider: ProviderRateLimits, t: Translate): UsageSection | null {
  const sections = usageSections(provider, t)
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
    return { ...tightest, label: t('dashboardPopout.usage.fable', 'Fable') }
  }
  return { ...tightest, label: formatRateLimitWindowChipLabel(tightest.window) }
}

function windowLabel(provider: ProviderRateLimits, section: UsageSection, t: Translate): string {
  if (provider.buckets?.some((bucket) => bucket.name === section.label)) {
    return section.label
  }
  if (section.window === provider.fableWeekly) {
    return t('dashboardPopout.usage.fable', 'Fable')
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
  const t = useTranslate()
  const section = dashboardUsageSection(provider, t)
  const statusLabel = getProviderUsageStatusLabel(provider, t)

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
      title={`${getProviderDisplayName(provider.provider)} · ${formatUsagePercentageLabel(used, display, t)}`}
    >
      <ProviderIcon provider={provider.provider} />
      {!compact ? (
        <span className="text-muted-foreground">{getProviderDisplayName(provider.provider)}</span>
      ) : null}
      {!compact ? (
        <span className="text-muted-foreground/70">{windowLabel(provider, section, t)}</span>
      ) : null}
      <span className="h-[5px] w-8 overflow-hidden rounded-full bg-muted">
        <span
          className={cn('block h-full rounded-full', usageBarClass(used, 'health'))}
          style={{ width: `${shown}%` }}
        />
      </span>
      <span className="tabular-nums">{formatUsagePercentageLabel(used, display, t)}</span>
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
  const t = useTranslate()
  if (!usage || usage.providers.length === 0) {
    return null
  }
  const display = normalizeUsagePercentageDisplay(usage.usagePercentageDisplay)
  const mode = normalizeStatusBarUsageMode(usage.statusBarUsageMode)
  const compact = mode === 'compact'

  return (
    <div className="scrollbar-sleek flex h-6 min-h-[24px] shrink-0 items-center gap-3 overflow-x-auto border-t border-border bg-[var(--bg-titlebar,var(--card))] px-3 text-xs text-muted-foreground select-none">
      <span className="shrink-0 text-[11px] font-medium">
        {t('dashboardPopout.usage.label', 'Usage')}
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
