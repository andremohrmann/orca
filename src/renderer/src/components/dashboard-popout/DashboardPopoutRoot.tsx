import { useEffect, useState } from 'react'
import { useAppMenuPaste } from '@/hooks/useAppMenuPaste'
import { useAppMenuSelectionActions } from '@/hooks/useAppMenuSelectionActions'
import { AgentKanbanBoard } from './AgentKanbanBoard'
import { useDashboardSnapshot } from './useDashboardSnapshot'
import {
  normalizeAgentDashboardView,
  type AgentDashboardView
} from '../../../../shared/agent-dashboard-view'

type DashboardPopoutRootProps = {
  /** The layout requested via popout.html?view=<name>. */
  view?: string | null
}

/**
 * Root of the pop-out dashboard window. Subscribes to the live snapshot relayed
 * from the main window and renders the requested layout.
 */
export function DashboardPopoutRoot(_props: DashboardPopoutRootProps): React.JSX.Element {
  // Why: this window has no App shell, so nothing else would translate the
  // Edit-menu IPC into the ownership events the terminal preview claims.
  useAppMenuPaste()
  useAppMenuSelectionActions()
  const snapshot = useDashboardSnapshot()
  const [view, setView] = useState<AgentDashboardView>(() =>
    _props.view === 'rings' ? 'map' : normalizeAgentDashboardView(_props.view)
  )
  useEffect(() => window.api.dashboard?.onViewRequested?.(setView), [])
  return <AgentKanbanBoard key={view} snapshot={snapshot} initialView={view} />
}
