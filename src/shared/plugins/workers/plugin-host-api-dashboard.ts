import { z } from 'zod'
import { spec, WORKER_ONLY } from './plugin-host-method-spec'
import { AGENT_TURN_OUTCOMES } from '../../agent-status/lifecycle/agent-turn-outcome'

const id = z.string().min(1).max(4096)
const text = z.string().max(2048)
const state = z.enum(['working', 'blocked', 'waiting', 'done'])
const clock = z.number().finite().nonnegative()
export const pluginQuotaWindowSchema = z.object({
  name: z.string().max(256),
  usedPercent: z.number().finite().min(0).max(100),
  windowMinutes: z.number().finite().positive(),
  resetsAt: clock.nullable()
})
export const pluginQuotaReadingSchema = z.object({
  provider: z.string().max(128),
  accountId: id.nullable(),
  status: z.enum(['idle', 'fetching', 'ok', 'error', 'unavailable']),
  updatedAt: clock.nullable(),
  freshness: z.enum(['observed', 'stale', 'unknown']),
  windows: z.array(pluginQuotaWindowSchema).max(64),
  truncated: z.boolean()
})
export const pluginAgentSummarySchema = z.object({
  kind: z.enum(['terminal', 'chat', 'unknown']),
  taskTitle: z.string().max(512).nullable(),
  toolName: z.string().max(128).nullable(),
  terminalId: id.nullable(),
  paneKey: id,
  orcaSessionId: id.nullable(),
  parentPaneKey: id.nullable(),
  state,
  stateStartedAt: clock,
  updatedAt: clock,
  freshness: z.enum(['observed', 'unverifiable', 'unknown']),
  workingMode: z.literal('monitoring').nullable(),
  subagentObservation: z.enum(['live', 'unverifiable']).nullable(),
  restoredUnconfirmed: z.boolean().nullable(),
  hasLivePty: z.boolean().nullable(),
  structuredHostOwned: z.boolean().nullable(),
  agent: z.string().max(128).nullable(),
  title: z.string().max(512).nullable(),
  prompt: text.nullable(),
  lastAssistantMessage: text.nullable(),
  textTruncated: z.boolean(),
  pendingQuestion: text.nullable(),
  turnEndedAt: clock.nullable(),
  turnEndDisposition: z.enum(['identified', 'ambiguous']).nullable(),
  mainAgent: z
    .object({ state, stateStartedAt: clock, outcome: z.enum(AGENT_TURN_OUTCOMES).nullable() })
    .nullable(),
  attention: z.object({
    status: z.string().max(32).nullable(),
    unread: z.boolean().nullable(),
    acknowledged: z.boolean().nullable(),
    unseen: z.boolean().nullable(),
    basis: z.enum(['host-ui-snapshot', 'unknown']),
    observedAt: clock.nullable(),
    turnStartedAt: clock.nullable(),
    acknowledgedTurnStartedAt: clock.nullable()
  }),
  childCount: z.number().int().nonnegative().nullable(),
  childrenTruncated: z.boolean(),
  children: z
    .array(
      z.object({
        id,
        parentId: id.nullable(),
        kind: z.string().max(32),
        state: z.string().max(32),
        name: z.string().max(256).nullable(),
        lastMessage: z.string().max(512).nullable(),
        outcome: z.string().max(32).nullable(),
        observedAt: clock.nullable(),
        textTruncated: z.boolean()
      })
    )
    .max(20)
})
const workspaceParams = z.strictObject({ workspaceId: id })
export const PLUGIN_DASHBOARD_API = {
  'provider.usage': spec({
    summary:
      'Display-only quota windows from this execution host, including saved inactive account readings; refresh requests the host stale-usage refresh; no credentials, account email or raw errors. provider.usageChanged invalidates this snapshot; observed is a reading, not a freshness guarantee.',
    since: 11,
    customBuild: 'andre-dashboard-v1',
    scope: 'desktop',
    capability: 'quota:read',
    mutation: false,
    surfaces: WORKER_ONLY,
    params: z.strictObject({ refresh: z.boolean().optional() }).optional(),
    result: z.object({
      readings: z.array(pluginQuotaReadingSchema).max(128),
      truncated: z.boolean()
    })
  }),
  'workspace.workflow': spec({
    summary:
      'The runtime workflow catalogue, current assignment and cached attached review summaries; missing review state stays unknown. Works with folder workspaces.',
    since: 11,
    customBuild: 'andre-dashboard-v1',
    scope: 'any-workspace',
    capability: 'workspace:read',
    mutation: false,
    surfaces: WORKER_ONLY,
    params: workspaceParams,
    result: z.object({
      workspaceId: id,
      hostId: id.nullable(),
      options: z.array(z.object({ id, label: z.string().max(512) })).max(128),
      assignedId: id.nullable(),
      effectiveAssignedId: id,
      optionsTruncated: z.boolean(),
      hasReview: z.boolean().nullable(),
      review: z
        .object({
          provider: z.enum(['github', 'gitlab', 'bitbucket', 'azure-devops', 'gitea']),
          number: z.number().int().positive(),
          state: z.enum(['open', 'closed', 'merged', 'draft'])
        })
        .nullable(),
      reviewsTruncated: z.boolean(),
      reviews: z
        .array(
          z.object({
            provider: z.enum(['github', 'gitlab', 'bitbucket', 'azure-devops', 'gitea']),
            number: z.number().int().positive(),
            state: z.string().max(128).nullable()
          })
        )
        .max(50)
    })
  }),
  'workspace.setWorkflow': spec({
    summary:
      'Assigns one workflow option from the runtime catalogue; rejects unknown options and returns the host assignment after the write.',
    since: 11,
    customBuild: 'andre-dashboard-v1',
    scope: 'any-workspace',
    capability: 'workspace:write',
    mutation: true,
    surfaces: WORKER_ONLY,
    params: workspaceParams.extend({ statusId: id }),
    result: z.object({ assignedId: id.nullable() })
  }),
  'agents.summaries': spec({
    summary:
      'Bounded host agent lifecycle, conversation excerpts, attention and pane lineage for a workspace; agents.summariesChanged invalidates this snapshot; null means unknown, and workspace/activity unread is never treated as per-agent acknowledgement. Attention uses live turn identity and the host UI acknowledgement snapshot; renderer changes not yet sent to the host are unknown.',
    since: 11,
    customBuild: 'andre-dashboard-v1',
    scope: 'any-workspace',
    capability: 'agent:summary',
    mutation: false,
    surfaces: WORKER_ONLY,
    params: workspaceParams,
    result: z.object({
      workspaceId: id,
      hostId: id.nullable(),
      agents: z.array(pluginAgentSummarySchema).max(100),
      truncated: z.boolean()
    })
  }),
  'agent.reveal': spec({
    summary:
      'Reveals an existing open structured chat by its Orca session identity, through its owning runtime and the desktop. Never creates, launches or resumes a chat; false means no exact existing destination was proven. In-flight cancellation cannot undo an owner selection already accepted.',
    since: 11,
    customBuild: 'andre-dashboard-v1',
    scope: 'any-workspace',
    capability: 'workspace:write',
    mutation: true,
    surfaces: WORKER_ONLY,
    params: workspaceParams.extend({ orcaSessionId: id }),
    result: z.object({ revealed: z.boolean() })
  })
}
