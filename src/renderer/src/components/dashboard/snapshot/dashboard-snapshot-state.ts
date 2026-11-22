import type { StructuredChatTabNames } from '@/runtime/native-chat/naming/structured-chat-tab-name'
import type { AppState } from '@/store/types'
import type { DashboardCardTerminalInputState } from './dashboard-card-terminal-input'
import type { DashboardCardContextState } from './dashboard-card-context'
import type { DashboardUsageSnapshotState } from '../dashboard-usage-snapshot'

/** Keep builder inputs as a Pick so tests need only construct the store slices read here. */
export type DashboardSnapshotState = Pick<
  AppState,
  | 'repos'
  | 'worktreesByRepo'
  | 'tabsByWorktree'
  | 'agentStatusByPaneKey'
  | 'migrationUnsupportedByPtyId'
  | 'runtimeAgentOrchestrationByPaneKey'
  | 'terminalLayoutsByTabId'
  | 'ptyIdsByTabId'
  | 'runtimePaneTitlesByTabId'
  | 'acknowledgedAgentsByPaneKey'
  | 'settings'
> &
  DashboardCardContextState &
  Partial<
    DashboardCardTerminalInputState &
      DashboardUsageSnapshotState &
      Pick<
        AppState,
        | 'runtimeEnvironments'
        | 'sshTargetLabels'
        | 'unifiedTabsByWorktree'
        | 'activeWorktreeId'
        | 'activeWorkspaceExecutionHostId'
      >
  >

export type DashboardSnapshotInput = DashboardSnapshotState & { chatNames: StructuredChatTabNames }
