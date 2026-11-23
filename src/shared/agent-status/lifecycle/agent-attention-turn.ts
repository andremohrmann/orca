export type AgentAttentionTurn = {
  stateStartedAt: number
  state?: string
  sessionBoundary?: boolean
  stateHistory?: readonly { startedAt: number }[]
}

/** Subject-keyed turn bookkeeping the acknowledgement policy reads; no surface shape here. */
export type AgentAttentionTurnRecords = {
  liveTurns: ReadonlyMap<string, AgentAttentionTurn> | Record<string, AgentAttentionTurn>
  acknowledgedTurnStartedAt: Record<string, number>
}

/** A session-boundary idle restates the turn it displaced, so it keeps that turn's identity instead of its arrival time. */
export function agentAttentionTurnAt(entry: AgentAttentionTurn): number {
  if (entry.state !== 'done' || entry.sessionBoundary !== true) {
    return entry.stateStartedAt
  }
  return entry.stateHistory?.at(-1)?.startedAt ?? 0
}

export function readAgentAttentionTurnStartedAt(
  records: Pick<AgentAttentionTurnRecords, 'liveTurns'>,
  subjectKey: string
): number | null {
  const turns = records.liveTurns
  const entry = isTurnMap(turns) ? turns.get(subjectKey) : turns[subjectKey]
  return entry ? agentAttentionTurnAt(entry) : null
}

function isTurnMap(
  turns: AgentAttentionTurnRecords['liveTurns']
): turns is ReadonlyMap<string, AgentAttentionTurn> {
  return typeof turns.get === 'function'
}

/** A turn is unread until acknowledged at or after its start; with no turn there is nothing to read. */
export function isAgentTurnUnacknowledged(
  acknowledgedAt: number,
  turnStartedAt: number | null | undefined
): boolean {
  return turnStartedAt != null && acknowledgedAt < turnStartedAt
}

/** Read the same current-turn records that auto-acknowledgement clears. */
export function isAgentSubjectUnread(
  records: AgentAttentionTurnRecords,
  subjectKey: string
): boolean {
  return isAgentTurnUnacknowledged(
    records.acknowledgedTurnStartedAt[subjectKey] ?? 0,
    readAgentAttentionTurnStartedAt(records, subjectKey)
  )
}
