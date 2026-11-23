import {
  readAgentAttentionUnreadReason,
  type ReadableAgentAttentionUnread
} from './agent-attention-contract'

import {
  readAgentAttentionTurnStartedAt,
  isAgentTurnUnacknowledged,
  type AgentAttentionTurnRecords
} from '../../../shared/agent-status/lifecycle/agent-attention-turn'
export {
  agentAttentionTurnAt,
  readAgentAttentionTurnStartedAt,
  isAgentTurnUnacknowledged,
  isAgentSubjectUnread
} from '../../../shared/agent-status/lifecycle/agent-attention-turn'
export type {
  AgentAttentionTurn,
  AgentAttentionTurnRecords
} from '../../../shared/agent-status/lifecycle/agent-attention-turn'

/** Acknowledge viewed subjects by stateStartedAt, not updatedAt, so same-state pings cannot retrigger acknowledgement. */
export function computeAgentAcknowledgementTargets(
  records: AgentAttentionTurnRecords,
  subjectKey: string | null
): string[] {
  if (subjectKey === null) {
    return []
  }
  const targets: string[] = []
  const acknowledgedAt = records.acknowledgedTurnStartedAt[subjectKey] ?? 0
  if (
    isAgentTurnUnacknowledged(acknowledgedAt, readAgentAttentionTurnStartedAt(records, subjectKey))
  ) {
    targets.push(subjectKey)
  }
  return targets
}

/** The viewed subject when it currently holds an unread attention marker. */
export function resolveViewedUnreadSubjectKey(
  unreadBySubjectKey: Record<string, ReadableAgentAttentionUnread>,
  subjectKey: string | null
): string | null {
  if (subjectKey === null) {
    return null
  }
  return readAgentAttentionUnreadReason(unreadBySubjectKey[subjectKey]) === null ? null : subjectKey
}

/** Expire manual-unread protection after a subject switch or new turn. Keep it on missing rows: UI hydrates before turn snapshots, so absence does not prove a switch. */
export function computeLapsedManualUnreadProtections(
  records: Pick<AgentAttentionTurnRecords, 'liveTurns'> & {
    manuallyUnreadTurnStartedAt: Record<string, number>
  },
  activeSubjectKeys: ReadonlySet<string>
): string[] {
  const lapsed: string[] = []
  for (const [subjectKey, turnStartedAt] of Object.entries(records.manuallyUnreadTurnStartedAt)) {
    if (!activeSubjectKeys.has(subjectKey)) {
      lapsed.push(subjectKey)
      continue
    }
    const currentTurn = readAgentAttentionTurnStartedAt(records, subjectKey)
    if (currentTurn !== null && currentTurn !== turnStartedAt) {
      lapsed.push(subjectKey)
    }
  }
  return lapsed
}
