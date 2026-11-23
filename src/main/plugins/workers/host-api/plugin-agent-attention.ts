import { z } from 'zod'
import {
  agentAttentionTurnAt,
  isAgentSubjectUnread,
  type AgentAttentionTurn
} from '../../../../shared/agent-status/lifecycle/agent-attention-turn'
import type { PluginRuntimeRpc } from './plugin-host-runtime-call'

export type PluginAgentAttentionSnapshot = {
  acknowledgedTurnStartedAt: Record<string, number>
  observedAt: number
}
const uiAttention = z.object({
  ui: z.object({
    acknowledgedAgentsByPaneKey: z.record(z.string(), z.number().finite().nonnegative()).optional()
  })
})

export async function readPluginAgentAttention(
  call: PluginRuntimeRpc
): Promise<PluginAgentAttentionSnapshot | null> {
  try {
    const { ui } = uiAttention.parse(await call('ui.get', {}))
    return ui.acknowledgedAgentsByPaneKey === undefined
      ? null
      : {
          acknowledgedTurnStartedAt: ui.acknowledgedAgentsByPaneKey,
          observedAt: Date.now()
        }
  } catch {
    return null
  }
}

export function projectPluginAgentAttention(
  subjectKey: string,
  turn: AgentAttentionTurn | undefined,
  snapshot: PluginAgentAttentionSnapshot | null
) {
  if (
    !turn ||
    !snapshot ||
    (turn.state === 'done' && turn.sessionBoundary === true && turn.stateHistory === undefined)
  ) {
    return {
      unread: null,
      unseen: null,
      acknowledged: null,
      basis: 'unknown' as const,
      observedAt: snapshot?.observedAt ?? null,
      turnStartedAt: null,
      acknowledgedTurnStartedAt: null
    }
  }
  const unseen = isAgentSubjectUnread(
    {
      liveTurns: new Map([[subjectKey, turn]]),
      acknowledgedTurnStartedAt: snapshot.acknowledgedTurnStartedAt
    },
    subjectKey
  )
  return {
    unread: unseen,
    unseen,
    acknowledged: !unseen,
    basis: 'host-ui-snapshot' as const,
    observedAt: snapshot.observedAt,
    turnStartedAt: agentAttentionTurnAt(turn),
    acknowledgedTurnStartedAt: snapshot.acknowledgedTurnStartedAt[subjectKey] ?? null
  }
}
