import type { DashboardLane } from '../dashboard/board/agent-board-projection'
import type {
  DashboardBucket,
  DashboardCard,
  DashboardFilterOption
} from '../../../../shared/agent-status/presentation/dashboard-snapshot'
import type { RepoIcon } from '../../../../shared/repository/appearance/repo-icon'
import type { WorkspaceStatus } from '../../../../shared/worktree/types'
import { useState } from 'react'
import { useTranslate, type Translate } from '@/i18n/use-translate'
import { AgentKanbanLaneCardList } from '../dashboard/board/AgentKanbanLaneCardList'

function bucketLabel(bucket: DashboardBucket, translate: Translate): string {
  switch (bucket) {
    case 'attention':
      return translate('dashboardPopout.bucket.attention', 'Needs You')
    case 'working':
      return translate('dashboardPopout.bucket.working', 'Working')
    case 'done':
      return translate('dashboardPopout.bucket.done', 'Done')
    case 'idle':
      return translate('dashboardPopout.bucket.idle', 'Idle')
  }
}

type AgentKanbanColumnProps = {
  bucket: DashboardBucket
  cards: DashboardCard[]
  lane: DashboardLane
  repoIconsByRepoId: Record<string, RepoIcon | null> | undefined
  now: number
  dialogPaneKey: string | null
  onOpenTerminal: (card: DashboardCard) => void
  onAssignWorkspaceStatus: (worktreeId: string, status: WorkspaceStatus) => void
  statusOptions: readonly DashboardFilterOption[] | undefined
}

export function AgentKanbanColumn({
  bucket,
  cards,
  lane,
  repoIconsByRepoId,
  now,
  dialogPaneKey,
  onOpenTerminal,
  onAssignWorkspaceStatus,
  statusOptions
}: AgentKanbanColumnProps): React.JSX.Element {
  const translate = useTranslate()
  const label = bucketLabel(bucket, translate)
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)

  return (
    <section
      aria-label={label}
      className="flex min-w-[264px] flex-1 flex-col rounded-xl border border-border/60 bg-muted/30"
    >
      <header className="flex items-center gap-2 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          {label}
        </span>
        <span className="ml-auto rounded-full bg-background px-1.5 text-[11px] tabular-nums text-muted-foreground">
          {lane.indexes.length}
        </span>
      </header>
      <div
        ref={setScrollElement}
        className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto px-2 pb-2"
      >
        {lane.indexes.length === 0 ? (
          <p className="px-1 py-2 text-[11px] text-muted-foreground">
            {translate('dashboardPopout.bucket.empty', 'None')}
          </p>
        ) : (
          <AgentKanbanLaneCardList
            cards={cards}
            lane={lane}
            scrollElement={scrollElement}
            repoIconsByRepoId={repoIconsByRepoId}
            now={now}
            dialogPaneKey={dialogPaneKey}
            statusOptions={statusOptions}
            onOpenTerminal={onOpenTerminal}
            onAssignWorkspaceStatus={onAssignWorkspaceStatus}
          />
        )}
      </div>
    </section>
  )
}
