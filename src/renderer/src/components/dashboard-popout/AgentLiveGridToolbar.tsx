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
}

function labelForDensity(density: AgentDashboardLiveDensity): string {
  if (density === 'compact') {
    return translate('dashboardPopout.live.densityCompact', 'Compact')
  }
  if (density === 'comfortable') {
    return translate('dashboardPopout.live.densityComfortable', 'Comfortable')
  }
  if (density === 'large') {
    return translate('dashboardPopout.live.densityLarge', 'Large')
  }
  return translate('dashboardPopout.live.densityAuto', 'Auto')
}

function labelForSort(sort: AgentDashboardLiveSort): string {
  if (sort === 'attention') {
    return translate('dashboardPopout.live.sortAttention', 'Needs attention')
  }
  if (sort === 'workspace') {
    return translate('dashboardPopout.live.sortWorkspace', 'Workspace')
  }
  if (sort === 'recent') {
    return translate('dashboardPopout.live.sortRecent', 'Recent activity')
  }
  return translate('dashboardPopout.live.sortManual', 'Manual')
}

export function AgentLiveGridToolbar({
  layout,
  density,
  hiddenCount,
  onReset,
  onShowHidden,
  onApplySort,
  onSetDensity,
  onToggleClosed
}: AgentLiveGridToolbarProps): React.JSX.Element {
  return (
    <div className="flex h-7 shrink-0 items-center gap-1">
      <Button type="button" variant="ghost" size="xs" onClick={onReset}>
        <RotateCcw className="size-3" />
        {translate('dashboardPopout.live.resetLayout', 'Reset layout')}
      </Button>
      {hiddenCount > 0 ? (
        <Button type="button" variant="ghost" size="xs" onClick={onShowHidden}>
          <Eye className="size-3" />
          {translate('dashboardPopout.live.showHidden', 'Show hidden')}
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="xs" className="ml-auto">
            <MoreHorizontal className="size-3" />
            {translate('dashboardPopout.live.options', 'Live options')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>
            {translate('dashboardPopout.live.sortBy', 'Sort by')}
          </DropdownMenuLabel>
          {SORTS.map((sort) => (
            <DropdownMenuCheckboxItem
              key={sort}
              checked={(layout.sort ?? 'manual') === sort}
              onCheckedChange={() => onApplySort(sort)}
            >
              {labelForSort(sort)}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>
            {translate('dashboardPopout.live.density', 'Density')}
          </DropdownMenuLabel>
          {DENSITIES.map((nextDensity) => (
            <DropdownMenuCheckboxItem
              key={nextDensity}
              checked={density === nextDensity}
              onCheckedChange={() => onSetDensity(nextDensity)}
            >
              {labelForDensity(nextDensity)}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onToggleClosed}>
            {layout.hideClosed
              ? translate('dashboardPopout.live.showClosed', 'Show closed panes')
              : translate('dashboardPopout.live.hideClosed', 'Hide closed panes')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
