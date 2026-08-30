import type { DashboardCard } from '../../../../shared/dashboard-snapshot'
import { AgentTerminalPreview } from './AgentTerminalPreview'
import type { AgentRevealArgs } from './AgentTerminalDialog'

type LiveDashboardCard = DashboardCard & { ptyId: string }

export function AgentLiveGridTerminal({
  card,
  onRevealAgent
}: {
  card: LiveDashboardCard
  onRevealAgent: (args: AgentRevealArgs) => void
}): React.JSX.Element {
  return (
    <AgentTerminalPreview
      ptyId={card.ptyId}
      terminalInput={card.terminalInput ?? null}
      terminalLinks={card.terminalLinks ?? null}
      claimGrid={false}
      scaleToFit
      autoFocus={false}
      onClosedActivate={() =>
        onRevealAgent({
          repoId: card.repoId,
          worktreeId: card.worktreeId,
          executionHostId: card.executionHostId,
          tabId: card.tabId,
          leafId: card.leafId
        })
      }
      className="h-full min-h-0 min-w-0 max-w-full flex-1 overflow-hidden [contain:paint]"
    />
  )
}
