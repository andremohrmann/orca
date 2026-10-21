import { X } from 'lucide-react'
import { AgentIcon } from '@/lib/agent-catalog'
import { agentTypeToIconAgent } from '@/lib/agent-status'
import { translate } from '@/i18n/i18n'
import type { DashboardCard } from '../../../../shared/dashboard-snapshot'

type AgentLiveCompactPaneRowProps = {
  cards: DashboardCard[]
  label: string
  titleForCard: (card: DashboardCard) => string
  onRevealAgent: (card: DashboardCard) => void
  onClose: (card: DashboardCard) => void
}

export function AgentLiveCompactPaneRow(
  props: AgentLiveCompactPaneRowProps
): React.JSX.Element | null {
  if (props.cards.length === 0) {
    return null
  }
  return (
    <div className="flex h-8 shrink-0 items-center gap-1 overflow-x-auto scrollbar-sleek">
      <span className="shrink-0 px-1 text-[11px] text-muted-foreground">{props.label}</span>
      {props.cards.map((card) => (
        <div
          key={card.paneKey}
          className="flex h-7 max-w-56 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs hover:bg-accent"
        >
          <AgentIcon agent={agentTypeToIconAgent(card.agentType)} size={13} />
          <button
            type="button"
            className="min-w-0 truncate text-left"
            onClick={() => props.onRevealAgent(card)}
            aria-label={translate('dashboardPopout.live.openWorkspace', 'Open workspace')}
          >
            {props.titleForCard(card)}
          </button>
          <button
            type="button"
            className="ml-1 rounded-sm text-muted-foreground hover:text-foreground"
            onClick={() => props.onClose(card)}
            aria-label={translate('dashboardPopout.live.close', 'Close from Live view')}
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
