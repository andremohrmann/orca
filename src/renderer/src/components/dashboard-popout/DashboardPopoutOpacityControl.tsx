import { useEffect, useState } from 'react'
import { Blend } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { translate } from '@/i18n/i18n'
import type { DashboardPopoutOpacityState } from '../../../../shared/dashboard-popout-opacity'

export function DashboardPopoutOpacityControl(): React.JSX.Element {
  const [state, setState] = useState<DashboardPopoutOpacityState | null>(null)

  useEffect(() => {
    let mounted = true
    const request = window.api.dashboard.getPopoutOpacity?.()
    void request
      ?.then((nextState) => {
        if (mounted && nextState) {
          setState(nextState)
        }
      })
      .catch(console.error)
    return () => {
      mounted = false
    }
  }, [])

  const opacityPercent = Math.round((state?.opacity ?? 1) * 100)
  const supported = state?.supported === true
  const label = translate('dashboardPopout.opacity.label', 'Window opacity')

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="gap-1.5 px-2 tabular-nums text-muted-foreground"
          disabled={!supported}
          title={
            state && !supported
              ? translate(
                  'dashboardPopout.opacity.unsupported',
                  'Window opacity is unavailable on Linux'
                )
              : undefined
          }
          aria-label={
            supported
              ? translate('dashboardPopout.opacity.current', '{{label}}: {{value}}%', {
                  label,
                  value: opacityPercent
                })
              : translate(
                  'dashboardPopout.opacity.unsupported',
                  'Window opacity is unavailable on Linux'
                )
          }
        >
          <Blend className="size-3.5" />
          {opacityPercent}%
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} collisionPadding={8} className="w-64 p-3">
        <div className="flex items-baseline gap-3">
          <span className="text-xs font-medium">{label}</span>
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            {opacityPercent}%
          </span>
        </div>
        <Slider
          className="mt-3"
          min={20}
          max={100}
          step={5}
          value={[opacityPercent]}
          thumbLabels={[label]}
          thumbValueLabels={[`${opacityPercent}%`]}
          onValueChange={([value]) => {
            setState({ opacity: value / 100, supported: true })
            const update = window.api.dashboard.setPopoutOpacity?.(value / 100)
            void update?.catch(console.error)
          }}
        />
        <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
          {translate(
            'dashboardPopout.opacity.description',
            'Lower this to see windows behind the dashboard.'
          )}
        </p>
      </PopoverContent>
    </Popover>
  )
}
