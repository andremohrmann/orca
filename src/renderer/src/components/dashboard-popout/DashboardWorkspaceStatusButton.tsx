import { Kanban } from 'lucide-react'
import type React from 'react'
import type { DashboardFilterOption } from '../../../../shared/dashboard-snapshot'
import type { WorkspaceStatus } from '../../../../shared/worktree/types'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { getWorkspaceStatusVisualMeta } from '@/components/sidebar/workspace-status'

export function DashboardWorkspaceStatusButton({
  statuses,
  currentStatusId,
  onAssign,
  variant = 'icon'
}: {
  statuses: readonly DashboardFilterOption[] | undefined
  currentStatusId: string | undefined
  onAssign: (status: WorkspaceStatus) => void
  variant?: 'icon' | 'pill'
}): React.JSX.Element | null {
  if (!statuses || statuses.length === 0) {
    return null
  }
  const current = statuses.find((status) => status.id === currentStatusId) ?? statuses[0]
  const meta = getWorkspaceStatusVisualMeta({
    id: current.id,
    label: current.label,
    color: current.color
  })
  const label = translate('dashboardPopout.status.set', 'Set workspace status')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={variant === 'pill' ? 'xs' : 'icon-xs'}
          className={cn(
            variant === 'pill'
              ? 'h-5 max-w-full gap-1 rounded-full border border-border/70 px-1.5 text-[10px] text-muted-foreground hover:text-foreground'
              : undefined
          )}
          aria-label={label}
          title={label}
        >
          {variant === 'pill' ? (
            <meta.icon className={cn('size-3', meta.tone)} />
          ) : (
            <Kanban className="size-3.5" />
          )}
          {variant === 'pill' ? <span className="truncate">{current.label}</span> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {statuses.map((status) => {
          const statusMeta = getWorkspaceStatusVisualMeta({
            id: status.id,
            label: status.label,
            color: status.color
          })
          return (
            <DropdownMenuCheckboxItem
              key={status.id}
              checked={status.id === currentStatusId}
              onCheckedChange={() => onAssign(status.id)}
            >
              <statusMeta.icon className={cn('size-3.5', statusMeta.tone)} />
              {status.label}
            </DropdownMenuCheckboxItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
