import { Eye, MoreHorizontal, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { useTranslate, type Translate } from '@/i18n/use-translate'
import type {
  AgentDashboardLiveDensity,
  AgentDashboardLiveLayout,
  AgentDashboardLiveSort
} from '../../../../shared/agent-dashboard-live-layout'

const DENSITIES: AgentDashboardLiveDensity[] = ['auto', 'compact', 'comfortable', 'large']
const SORTS: AgentDashboardLiveSort[] = ['manual', 'attention', 'workspace', 'recent']

type AgentLiveGridToolbarProps = {
  layout: AgentDashboardLiveLayout
  density: AgentDashboardLiveDensity
  hiddenCount: number
  onReset: () => void
  onShowHidden: () => void
  onApplySort: (sort: AgentDashboardLiveSort) => void
  onSetDensity: (density: AgentDashboardLiveDensity) => void
  onToggleClosed: () => void
  onToggleChildAgents: () => void
}

function labelForDensity(density: AgentDashboardLiveDensity, t: Translate = translate): string {
  if (density === 'compact') {
    return t('dashboardPopout.live.densityCompact', 'Compact')
  }
  if (density === 'comfortable') {
    return t('dashboardPopout.live.densityComfortable', 'Comfortable')
  }
  if (density === 'large') {
    return t('dashboardPopout.live.densityLarge', 'Large')
  }
  return t('dashboardPopout.live.densityAuto', 'Auto')
}

function labelForSort(sort: AgentDashboardLiveSort, t: Translate = translate): string {
  if (sort === 'attention') {
    return t('dashboardPopout.live.sortAttention', 'Needs attention')
  }
  if (sort === 'workspace') {
    return t('dashboardPopout.live.sortWorkspace', 'Workspace')
  }
  if (sort === 'recent') {
    return t('dashboardPopout.live.sortRecent', 'Recent activity')
  }
  return t('dashboardPopout.live.sortManual', 'Manual')
}

export function AgentLiveGridToolbar({
  layout,
  density,
  hiddenCount,
  onReset,
  onShowHidden,
  onApplySort,
  onSetDensity,
  onToggleClosed,
  onToggleChildAgents
}: AgentLiveGridToolbarProps): React.JSX.Element {
  const t = useTranslate()
  return (
    <div className="flex h-7 shrink-0 items-center gap-1">
      <Button type="button" variant="ghost" size="xs" onClick={onReset}>
        <RotateCcw className="size-3" />
        {t('dashboardPopout.live.resetLayout', 'Reset layout')}
      </Button>
      {hiddenCount > 0 ? (
        <Button type="button" variant="ghost" size="xs" onClick={onShowHidden}>
          <Eye className="size-3" />
          {t('dashboardPopout.live.showHidden', 'Show hidden')}
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="xs" className="ml-auto">
            <MoreHorizontal className="size-3" />
            {t('dashboardPopout.live.options', 'Live options')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{t('dashboardPopout.live.sortBy', 'Sort by')}</DropdownMenuLabel>
          {SORTS.map((sort) => (
            <DropdownMenuCheckboxItem
              key={sort}
              checked={(layout.sort ?? 'manual') === sort}
              onCheckedChange={() => onApplySort(sort)}
            >
              {labelForSort(sort, t)}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t('dashboardPopout.live.density', 'Density')}</DropdownMenuLabel>
          {DENSITIES.map((nextDensity) => (
            <DropdownMenuCheckboxItem
              key={nextDensity}
              checked={density === nextDensity}
              onCheckedChange={() => onSetDensity(nextDensity)}
            >
              {labelForDensity(nextDensity, t)}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={layout.hideChildAgents === true}
            onCheckedChange={onToggleChildAgents}
          >
            {t('dashboardPopout.live.hideChildAgents', 'Hide child-agent terminals')}
          </DropdownMenuCheckboxItem>
          <DropdownMenuItem onClick={onToggleClosed}>
            {layout.hideClosed
              ? t('dashboardPopout.live.showClosed', 'Show closed panes')
              : t('dashboardPopout.live.hideClosed', 'Hide closed panes')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
