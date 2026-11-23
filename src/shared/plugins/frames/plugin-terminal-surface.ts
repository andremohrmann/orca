import type { DashboardCardTerminalInput } from '../../agent-status/presentation/dashboard-snapshot'
import type { TuiAgent } from '../../agent-launch/catalog/tui-agent'
import type {
  TerminalPreviewConnectResult,
  TerminalPreviewDataPayload
} from '../../terminal/replay/terminal-preview'

export type PluginTerminalSurfaceTarget = {
  id: string
  ptyId: string
  worktreeId: string
  paneKey: string
  input?: DashboardCardTerminalInput
  hostPlatform?: NodeJS.Platform
  launchAgent: TuiAgent | null
}
export type PluginTerminalSurfaceApi = {
  resolve: (
    sessionToken: string,
    terminalId: string,
    hostId?: string
  ) => Promise<PluginTerminalSurfaceTarget | { unavailable: 'capacity' } | null>
  onAvailable: (callback: () => void) => () => void
  connect: (id: string, scrollbackRows?: number) => Promise<TerminalPreviewConnectResult>
  input: (id: string, data: string) => Promise<boolean>
  fit: (id: string, cols: number, rows: number) => Promise<{ cols: number; rows: number } | null>
  ack: (id: string, bytes: number) => Promise<void>
  unsubscribe: (id: string) => Promise<void>
  releaseFit: (id: string) => Promise<void>
  dispose: (id: string) => Promise<void>
  onData: (callback: (payload: TerminalPreviewDataPayload) => void) => () => void
  onRevoked: (callback: (payload: { id: string; reason?: 'profile_changed' }) => void) => () => void
}
