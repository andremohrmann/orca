import {
  DASHBOARD_BUCKET_ORDER,
  type DashboardBucket,
  type DashboardCard,
  type DashboardFilterOption
} from '../../../../shared/dashboard-snapshot'
import type { RepoIcon } from '../../../../shared/repo-icon'
import type { WorkspaceStatus } from '../../../../shared/worktree/types'
import { translate } from '@/i18n/i18n'
import { AgentKanbanCard } from './AgentKanbanCard'

function bucketLabel(bucket: DashboardBucket): string {
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

export function groupByDashboardBucket(
  cards: DashboardCard[]
): Record<DashboardBucket, DashboardCard[]> {
  const grouped: Record<DashboardBucket, DashboardCard[]> = {
    attention: [],
    working: [],
    done: [],
    idle: []
  }
  for (const card of cards) {
    grouped[card.bucket].push(card)
  }
  for (const bucket of DASHBOARD_BUCKET_ORDER) {
    grouped[bucket].sort((a, b) => b.stateChangedAt - a.stateChangedAt)
  }
  return grouped
}

type AgentKanbanColumnProps = {
  bucket: DashboardBucket
  cards: DashboardCard[]
  repoIconsByRepoId: Record<string, RepoIcon | null> | undefined
  now: number
  onOpenTerminal: (card: DashboardCard) => void
  onAssignWorkspaceStatus: (worktreeId: string, status: WorkspaceStatus) => void
  statusOptions: readonly DashboardFilterOption[] | undefined
}

export function AgentKanbanColumn({
  bucket,
  cards,
  repoIconsByRepoId,
  now,
  onOpenTerminal,
  onAssignWorkspaceStatus,
  statusOptions
}: AgentKanbanColumnProps): React.JSX.Element {
  return (
    <section className="flex min-w-[264px] flex-1 flex-col rounded-xl border border-border/60 bg-muted/30">
      <header className="flex items-center gap-2 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          {bucketLabel(bucket)}
        </span>
        <span className="ml-auto rounded-full bg-background px-1.5 text-[11px] tabular-nums text-muted-foreground">
          {cards.length}
        </span>
      </header>
      <div className="scrollbar-sleek flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {cards.length === 0 ? (
          <p className="px-1 py-2 text-[11px] text-muted-foreground">
            {translate('dashboardPopout.bucket.empty', 'None')}
          </p>
        ) : (
          cards.map((card) => (
            <AgentKanbanCard
              key={card.paneKey}
              card={card}
              repoIcon={repoIconsByRepoId?.[card.repoId] ?? null}
              now={now}
              statusOptions={statusOptions}
              onOpenTerminal={onOpenTerminal}
              onAssignWorkspaceStatus={onAssignWorkspaceStatus}
            />
          ))
        )}
      </div>
    </section>
  )
}
