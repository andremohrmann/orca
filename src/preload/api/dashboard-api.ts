import type {
  DashboardAssignWorkspaceStatusArgs,
  DashboardRenameWorkspaceArgs,
  DashboardRevealAgentArgs,
  DashboardSnapshot
} from '../../shared/dashboard-snapshot'
import type { AgentDashboardView } from '../../shared/agent-dashboard-view'
import type { DashboardPopoutOpacityState } from '../../shared/dashboard-popout-opacity'
import type {
  TerminalPreviewConnectResult,
  TerminalPreviewDataPayload
} from '../../shared/terminal-preview'

export type DashboardApi = {
  openPopout: (view?: AgentDashboardView) => Promise<void>
  publishSnapshot: (snapshot: DashboardSnapshot) => Promise<void>
  getPopoutOpen: () => Promise<boolean>
  onPopoutOpenChanged: (callback: (open: boolean) => void) => () => void
  onSnapshotRequested: (callback: () => void) => () => void
  onRevealAgent: (callback: (args: DashboardRevealAgentArgs) => void) => () => void
  /** `explicit` only for a click on the card; watching an open dialog is a view. */
  onAckAgent: (callback: (paneKey: string, intent: 'view' | 'explicit') => void) => () => void
  onAssignWorkspaceStatus: (
    callback: (args: DashboardAssignWorkspaceStatusArgs) => void
  ) => () => void
  onRenameWorkspace: (callback: (args: DashboardRenameWorkspaceArgs) => void) => () => void
  requestSnapshot: () => Promise<void>
  onSnapshot: (callback: (snapshot: DashboardSnapshot) => void) => () => void
  onViewRequested: (callback: (view: AgentDashboardView) => void) => () => void
  getPopoutOpacity: () => Promise<DashboardPopoutOpacityState | null>
  setPopoutOpacity: (opacity: number) => Promise<DashboardPopoutOpacityState | null>
  revealAgent: (args: DashboardRevealAgentArgs) => Promise<void>
  ackAgent: (paneKey: string, intent: 'view' | 'explicit') => Promise<void>
  assignWorkspaceStatus: (args: DashboardAssignWorkspaceStatusArgs) => Promise<void>
  renameWorkspace: (args: DashboardRenameWorkspaceArgs) => Promise<void>
}

export type TerminalPreviewApi = {
  connect: (
    ptyId: string,
    opts?: { scrollbackRows?: number }
  ) => Promise<TerminalPreviewConnectResult>
  input: (ptyId: string, data: string) => Promise<boolean>
  /** Claims the PTY grid; returns the size actually in effect. */
  fit: (ptyId: string, cols: number, rows: number) => Promise<{ cols: number; rows: number } | null>
  /** Release the preview dialog's PTY grid claim without disconnecting its output stream. */
  releaseFit: (ptyId: string) => Promise<void>
  ack: (ptyId: string, bytes: number) => Promise<void>
  unsubscribe: (ptyId: string) => Promise<void>
  onData: (callback: (payload: TerminalPreviewDataPayload) => void) => () => void
}
