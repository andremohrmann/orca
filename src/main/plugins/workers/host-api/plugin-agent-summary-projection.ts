import { z } from 'zod'
import {
  projectPluginAgentAttention,
  type PluginAgentAttentionSnapshot
} from './plugin-agent-attention'
import { AGENT_TURN_OUTCOMES } from '../../../../shared/agent-status/lifecycle/agent-turn-outcome'
import { decodeAgentChildWorkViews } from '../../../../shared/agent-status/child-work/agent-status-child-work-view-wire'
import { decodeAgentSubagentsField } from '../../../../shared/agent-status/contracts/agent-status-subagent-snapshot'
import { structuredAgentSessionIdFromTabId } from '../../../../shared/agent-session/view/structured-agent-session-tab-id'
import { parsePaneKey } from '../../../../shared/workspace-layout/stable-pane-id'
import type { PluginHostResult } from '../../../../shared/plugins/workers/plugin-host-api'

const state = z.enum(['working', 'blocked', 'waiting', 'done'])
export const pluginDashboardAgentRowSchema = z.object({
  paneKey: z.string(),
  address: z.string().optional(),
  orcaSessionId: z.string().optional(),
  parentPaneKey: z.string().nullable(),
  state,
  stateStartedAt: z.number(),
  attentionTurn: z
    .object({
      state,
      stateStartedAt: z.number().finite().nonnegative(),
      sessionBoundary: z.boolean(),
      stateHistory: z
        .array(z.object({ startedAt: z.number().finite().nonnegative() }))
        .max(20)
        .optional()
    })
    .optional(),
  updatedAt: z.number(),
  taskTitle: z.string().nullable().optional(),
  toolName: z.string().nullable().optional(),
  agentType: z.string().nullable(),
  displayName: z.string().nullable(),
  conversationName: z.string().optional(),
  pendingQuestion: z.string().optional(),
  turnEndedAt: z.number().optional(),
  turnEndDisposition: z.enum(['identified', 'ambiguous']).optional(),
  prompt: z.string(),
  lastAssistantMessage: z.string().nullable(),
  restoredUnconfirmed: z.boolean().optional(),
  workingMode: z.literal('monitoring').optional(),
  subagentObservation: z.enum(['live', 'unverifiable']).optional(),
  hasLivePty: z.literal(true).optional(),
  structuredHostOwned: z.literal(true).optional(),
  mainAgent: z
    .object({ state, stateStartedAt: z.number(), outcome: z.enum(AGENT_TURN_OUTCOMES).optional() })
    .optional(),
  activity: z
    .union([
      z.object({ listed: z.literal(false), unread: z.literal(true).optional() }),
      z.object({ listed: z.literal(true), status: z.string(), unread: z.boolean() })
    ])
    .optional(),
  children: z.array(z.unknown()).optional(),
  subagents: z.array(z.unknown()).optional()
})

function excerpt(value: string | null | undefined, limit = 2048) {
  return value ? value.slice(0, limit) : null
}
export function projectPluginAgentSummary(
  agent: z.infer<typeof pluginDashboardAgentRowSchema>,
  terminalId: string | null = null,
  attentionSnapshot: PluginAgentAttentionSnapshot | null = null
): PluginHostResult<'agents.summaries'>['agents'][number] {
  const tabId = parsePaneKey(agent.paneKey)?.tabId
  const activity = agent.activity
  const canonical = decodeAgentChildWorkViews(agent.children)
  const legacy = canonical === undefined ? decodeAgentSubagentsField(agent.subagents) : undefined
  const children =
    canonical?.map((child) => ({
      id: child.id,
      parentId: child.parentChildWorkId ?? null,
      kind: child.kind,
      state: child.state,
      name: excerpt(child.name ?? child.description, 256),
      lastMessage: excerpt(child.lastMessage, 512),
      outcome: child.outcome ?? null,
      observedAt: child.observedAt,
      textTruncated:
        (child.name ?? child.description ?? '').length > 256 ||
        (child.lastMessage?.length ?? 0) > 512
    })) ??
    (legacy ?? []).map((child) => ({
      id: child.id,
      parentId: null,
      kind: 'agent',
      state: child.state,
      name: excerpt(child.description, 256),
      lastMessage: null,
      outcome: null,
      observedAt: null,
      textTruncated: (child.description?.length ?? 0) > 256
    }))
  const count = agent.children?.length ?? agent.subagents?.length ?? null
  return {
    kind: tabId ? (structuredAgentSessionIdFromTabId(tabId) ? 'chat' : 'terminal') : 'unknown',
    taskTitle: excerpt(agent.taskTitle, 512),
    toolName: excerpt(agent.toolName, 128),
    terminalId,
    paneKey: agent.paneKey,
    orcaSessionId: agent.orcaSessionId ?? null,
    parentPaneKey: agent.parentPaneKey,
    workingMode: agent.workingMode ?? null,
    subagentObservation: agent.subagentObservation ?? null,
    restoredUnconfirmed: agent.restoredUnconfirmed ?? null,
    hasLivePty: agent.hasLivePty ?? null,
    structuredHostOwned: agent.structuredHostOwned ?? null,
    state: agent.state,
    stateStartedAt: agent.stateStartedAt,
    updatedAt: agent.updatedAt,
    freshness:
      agent.restoredUnconfirmed || (activity?.listed && activity.status === 'unverifiable')
        ? 'unverifiable'
        : 'unknown',
    agent: excerpt(agent.agentType, 128),
    title: excerpt(agent.conversationName ?? agent.displayName, 512),
    prompt: excerpt(agent.prompt),
    lastAssistantMessage: excerpt(agent.lastAssistantMessage),
    textTruncated:
      agent.prompt.length > 2048 ||
      (agent.lastAssistantMessage?.length ?? 0) > 2048 ||
      (agent.pendingQuestion?.length ?? 0) > 2048,
    pendingQuestion: excerpt(agent.pendingQuestion),
    turnEndedAt: agent.turnEndedAt ?? null,
    turnEndDisposition: agent.turnEndDisposition ?? null,
    mainAgent: agent.mainAgent
      ? {
          state: agent.mainAgent.state,
          stateStartedAt: agent.mainAgent.stateStartedAt,
          outcome: agent.mainAgent.outcome ?? null
        }
      : null,
    attention: {
      status: activity?.listed ? activity.status : null,
      ...projectPluginAgentAttention(agent.paneKey, agent.attentionTurn, attentionSnapshot)
    },
    childCount: count,
    children: children.slice(0, 20),
    childrenTruncated: children.length > 20 || (count !== null && count > children.length)
  }
}
