import { GripVertical, Maximize2, Minus, Pencil, SquareArrowOutUpRight, X } from 'lucide-react'
import type { DragEvent } from 'react'
import { AgentStateDot } from '@/components/AgentStateDot'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AgentIcon } from '@/lib/agent-catalog'
import { agentTypeToIconAgent } from '@/lib/agent-status'
import { translate } from '@/i18n/i18n'
import {
  dashboardCardDisplayState,
  type DashboardCard,
  type DashboardFilterOption
} from '../../../../shared/dashboard-snapshot'
import type { WorkspaceStatus } from '../../../../shared/types'
import type { AgentRevealArgs } from './AgentTerminalDialog'
import { DashboardWorkspaceStatusButton } from './DashboardWorkspaceStatusButton'

type AgentLiveGridHeaderProps = {
  card: DashboardCard
  title: string
  subtitle: string
  editingPaneKey: string | null
  nameDraft: string
  setNameDraft: (value: string) => void
  beginRename: (card: DashboardCard) => void
  finishRename: () => void
  cancelRenameRef: React.MutableRefObject<boolean>
  onDragStart: (event: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  onOpenTerminal: (card: DashboardCard) => void
  onRevealAgent: (args: AgentRevealArgs) => void
  onAssignWorkspaceStatus: (worktreeId: string, status: WorkspaceStatus) => void
  statusOptions?: readonly DashboardFilterOption[]
  onMinimize: () => void
  onClose: () => void
}

export function AgentLiveGridHeader(props: AgentLiveGridHeaderProps): React.JSX.Element {
  const { card } = props
  return (
    <header
      className="flex h-7 shrink-0 cursor-move items-center gap-1 border-b border-border px-1"
      draggable={props.editingPaneKey !== card.paneKey}
      onDragStart={props.onDragStart}
      onDragEnd={props.onDragEnd}
    >
      <GripVertical className="size-3 shrink-0 text-muted-foreground" />
      <span className="inline-flex shrink-0">
        <AgentIcon agent={agentTypeToIconAgent(card.agentType)} size={13} />
      </span>
      {props.editingPaneKey === card.paneKey ? (
        <Input
          autoFocus
          value={props.nameDraft}
          onChange={(event) => props.setNameDraft(event.target.value)}
          onBlur={props.finishRename}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Enter') {
              props.finishRename()
            }
            if (event.key === 'Escape') {
              props.cancelRenameRef.current = true
              props.finishRename()
            }
          }}
          aria-label={translate('dashboardPopout.live.windowName', 'Window name')}
          className="h-5 min-w-20 flex-1 px-1.5 text-xs"
        />
      ) : (
        <span className="min-w-0 truncate text-xs font-medium">{props.title}</span>
      )}
      <span className="hidden truncate text-[10px] text-muted-foreground sm:inline">
        {props.subtitle}
      </span>
      <AgentStateDot state={dashboardCardDisplayState(card)} className="ml-auto" />
      <DashboardWorkspaceStatusButton
        statuses={props.statusOptions}
        currentStatusId={card.workspaceStatusId}
        onAssign={(status) => props.onAssignWorkspaceStatus(card.worktreeId, status)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => props.beginRename(card)}
        aria-label={translate('dashboardPopout.live.rename', 'Rename window')}
      >
        <Pencil className="size-3.5" />
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() =>
              props.onRevealAgent({
                repoId: card.repoId,
                worktreeId: card.worktreeId,
                executionHostId: card.executionHostId,
                tabId: card.tabId,
                leafId: card.leafId
              })
            }
            aria-label={translate('dashboardPopout.live.openWorkspace', 'Open workspace')}
          >
            <SquareArrowOutUpRight className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {translate('dashboardPopout.live.openWorkspace', 'Open workspace')}
        </TooltipContent>
      </Tooltip>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => props.onOpenTerminal(card)}
        aria-label={translate('dashboardPopout.live.expand', 'Expand terminal')}
      >
        <Maximize2 className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={props.onMinimize}
        aria-label={translate('dashboardPopout.live.minimize', 'Minimize terminal')}
      >
        <Minus className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={props.onClose}
        aria-label={translate('dashboardPopout.live.close', 'Close from Live view')}
      >
        <X className="size-3.5" />
      </Button>
    </header>
  )
}
