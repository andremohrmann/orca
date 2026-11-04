import type {
  DashboardCardTerminalInput,
  DashboardCardTerminalLinks
} from '../../../../shared/dashboard-snapshot'
import type { DashboardPreviewLinkSource } from './dashboard-preview-http-actions'

export type AgentTerminalPreviewProps = {
  ptyId: string
  terminalInput?: DashboardCardTerminalInput | null
  /** File-path/worktree link resolution; our own addition, independent of linkSource below. */
  terminalLinks?: DashboardCardTerminalLinks | null
  claimGrid?: boolean
  releaseGridOnWindowBlur?: boolean
  refreshAfterInput?: boolean
  scaleToFit?: boolean
  autoFocus?: boolean
  onClosedActivate?: () => void
  onRequestClose?: () => void
  /** Identifies the card for smart HTTP-link routing (foreground an existing browser tab). */
  linkSource?: DashboardPreviewLinkSource
  onBrowserForeground?: () => void
  className?: string
}
