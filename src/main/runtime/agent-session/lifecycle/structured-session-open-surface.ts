import type { StructuredAgentSessionHost } from '../../../native-chat/agent-session-wire/host/structured-agent-session-host'
import type {
  StructuredSessionSurface,
  StructuredSessionSurfaceRuntime
} from './structured-agent-session-close'

export function structuredSessionSurfaceIsOpen(
  host: Pick<StructuredAgentSessionHost, 'getSessionTabId'>,
  sessionId: string,
  surface: StructuredSessionSurface | null,
  runtime: Pick<StructuredSessionSurfaceRuntime, 'currentLocalStructuredSessionPresentation'>
): boolean {
  const captured = surface?.presentation?.raw
  if (!surface?.tableId || !captured) {
    return false
  }
  try {
    const raw = runtime.currentLocalStructuredSessionPresentation(sessionId)
    return (
      raw !== null &&
      raw.worktreeId === captured.worktreeId &&
      raw.tabId === captured.tabId &&
      host.getSessionTabId(sessionId) === surface.tableId
    )
  } catch {
    return false
  }
}
