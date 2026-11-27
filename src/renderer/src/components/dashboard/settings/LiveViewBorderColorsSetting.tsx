import { useRef, useState } from 'react'
import {
  AGENT_DASHBOARD_LIVE_BORDER_STATES,
  type AgentDashboardLiveBorderColors,
  type AgentDashboardLiveBorderState
} from '../../../../../shared/agent-dashboard-live-layout'
import { rgbaToHex } from '../../../../../shared/color/rgba-contrast'
import { browserColorProbe } from '@/app-shell/appearance/plugin-theme-tokens'
import { useTranslate } from '@/i18n/use-translate'
import { Button } from '@/components/ui/button'
import { ColorPicker } from '@/components/ui/color-picker'
import { SettingsRow } from '../../settings/form-controls/SettingsFormControls'
import { SettingsGroupSubsection } from '../../settings/section-layout/SettingsGroup'

const BORDER_TOKENS: Record<AgentDashboardLiveBorderState, string> = {
  attention: '--agent-question',
  working: '--agent-working',
  done: '--status-success',
  failed: '--destructive'
}

function BorderColorRow({
  state,
  label,
  color,
  onChange
}: {
  state: AgentDashboardLiveBorderState
  label: string
  color: string | undefined
  onChange: (color: string | undefined) => void
}): React.JSX.Element {
  const t = useTranslate()
  const swatchRef = useRef<HTMLSpanElement>(null)
  const [themeColor, setThemeColor] = useState('')
  const pickerLabel = t('dashboardPopout.live.borderColors.picker', '{{state}} border color', {
    state: label
  })
  return (
    <SettingsRow
      label={label}
      control={
        <div className="flex items-center gap-2">
          <ColorPicker
            value={color ?? themeColor}
            label={pickerLabel}
            onChange={(next) => {
              if (next !== (color ?? themeColor)) {
                onChange(next)
              }
            }}
            trigger={
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={pickerLabel}
                onClick={() => {
                  const swatch = swatchRef.current
                  const painted =
                    swatch && browserColorProbe(getComputedStyle(swatch).backgroundColor)
                  if (painted) {
                    setThemeColor(rgbaToHex(painted))
                  }
                }}
              >
                <span
                  ref={swatchRef}
                  aria-hidden="true"
                  className="size-4 rounded-md border border-border/70"
                  style={{ backgroundColor: color ?? `var(${BORDER_TOKENS[state]})` }}
                />
                <span className={color ? 'font-mono text-xs uppercase' : 'text-xs'}>
                  {color ?? t('dashboardPopout.live.borderColors.default', 'Default')}
                </span>
              </Button>
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={!color}
            aria-label={t(
              'dashboardPopout.live.borderColors.resetOne',
              'Reset {{state}} border color',
              { state: label }
            )}
            onClick={() => onChange(undefined)}
          >
            {t('dashboardPopout.live.borderColors.reset', 'Reset')}
          </Button>
        </div>
      }
    />
  )
}

export function LiveViewBorderColorsSetting({
  colors,
  onChange
}: {
  colors?: AgentDashboardLiveBorderColors
  onChange: (colors: AgentDashboardLiveBorderColors | undefined) => void
}): React.JSX.Element {
  const t = useTranslate()
  const labels: Record<AgentDashboardLiveBorderState, string> = {
    attention: t('dashboardPopout.live.borderColors.attention', 'Input needed'),
    working: t('dashboardPopout.live.borderColors.working', 'Working'),
    done: t('dashboardPopout.live.borderColors.done', 'Done'),
    failed: t('dashboardPopout.live.borderColors.failed', 'Errors and failures')
  }
  return (
    <SettingsGroupSubsection
      title={t('dashboardPopout.live.borderColors.title', 'Live view border colors')}
      description={t(
        'dashboardPopout.live.borderColors.description',
        'Choose a color for each state. Defaults follow the theme; working borders stay subtle.'
      )}
      action={
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={!Object.values(colors ?? {}).some(Boolean)}
          onClick={() => onChange(undefined)}
        >
          {t('dashboardPopout.live.borderColors.resetAll', 'Reset colors')}
        </Button>
      }
    >
      {AGENT_DASHBOARD_LIVE_BORDER_STATES.map((state) => (
        <BorderColorRow
          key={state}
          state={state}
          label={labels[state]}
          color={colors?.[state]}
          onChange={(color) => onChange({ ...colors, [state]: color })}
        />
      ))}
    </SettingsGroupSubsection>
  )
}
