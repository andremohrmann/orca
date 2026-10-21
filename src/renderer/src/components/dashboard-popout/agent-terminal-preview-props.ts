import type {
  DashboardCardTerminalInput,
  DashboardCardTerminalLinks
} from '../../../../shared/dashboard-snapshot'

export type AgentTerminalPreviewProps = {
  ptyId: string
  terminalInput?: DashboardCardTerminalInput | null
  terminalLinks?: DashboardCardTerminalLinks | null
  claimGrid?: boolean
  releaseGridOnWindowBlur?: boolean
  refreshAfterInput?: boolean
  scaleToFit?: boolean
  autoFocus?: boolean
  onClosedActivate?: () => void
  className?: string
}
