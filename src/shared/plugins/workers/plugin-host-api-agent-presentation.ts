import { z } from 'zod'
import { spec, WORKER_ONLY } from './plugin-host-method-spec'

export const PLUGIN_AGENT_PRESENTATION_MAX_ROWS = 100
export const PLUGIN_AGENT_PRESENTATION_MAX_CHILDREN = 20
export const PLUGIN_AGENT_PRESENTATION_MAX_BYTES = 512 * 1024
export const PLUGIN_AGENT_PRESENTATION_MAX_FENCES = 2000
export const PLUGIN_AGENT_PRESENTATION_CONTINUATION_TTL_MS = 60_000
export const PLUGIN_AGENT_PRESENTATION_POLL_MS = 5000
export const PLUGIN_AGENT_PRESENTATION_MAX_AGE_MS = 15_000

const id = z.string().min(1).max(4096)
const opaque = z.string().min(1).max(128)
const continuation = z.string().min(1).max(4096)
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const excerpt = z.string().max(2048).nullable()
const label = z.string().max(512).nullable()
const dotState = z.enum(['working', 'blocked', 'waiting', 'done', 'idle'])

export const pluginAgentPresentationClockSchema = z.object({ clockId: opaque, ms: count })
export const pluginAgentPresentationVersionSchema = z.object({
  producerEpoch: opaque,
  ownerEpoch: opaque,
  scopeEpoch: opaque,
  scopeGeneration: count,
  revision: count
})
export const pluginAgentPresentationScopeSchema = z.object({
  hostId: id,
  kind: z.enum(['worktree', 'folder'])
})
export const pluginAgentPresentationObservationSchema = z.object({
  basis: z.literal('trusted-renderer-canonical'),
  evaluatedAt: pluginAgentPresentationClockSchema,
  pollAfterMs: z.literal(PLUGIN_AGENT_PRESENTATION_POLL_MS),
  maxObservationAgeMs: z.literal(PLUGIN_AGENT_PRESENTATION_MAX_AGE_MS),
  nextExpiryAfterMs: count.nullable()
})
export const pluginAgentPresentationChildSchema = z.object({
  rowId: opaque,
  name: label,
  dotState
})
export const pluginAgentPresentationRowSchema = z.object({
  rowId: opaque,
  parentRowId: opaque.nullable(),
  rowSource: z.enum(['status', 'title-derived', 'structured-summary', 'migration']),
  startedAt: pluginAgentPresentationClockSchema.nullable(),
  presentation: z.object({
    rowState: z.enum(['working', 'blocked', 'waiting', 'done', 'idle', 'unverifiable']),
    dotState,
    baseDisplayState: z.enum(['working', 'monitoring', 'blocked', 'waiting', 'done', 'idle']),
    bucket: z.enum(['attention', 'working', 'done', 'idle']),
    workingMode: z.literal('monitoring').nullable(),
    verdict: z.enum(['failed', 'interrupted', 'unconfirmed']).nullable(),
    reason: z.enum([
      'canonical',
      'monitoring',
      'decayed-idle',
      'decayed-unverifiable',
      'restored',
      'synthetic'
    ])
  }),
  attention: z.object({
    unseen: z.boolean(),
    basis: z.enum(['real-turn', 'synthetic-no-turn', 'unknown']),
    turnId: opaque.nullable(),
    turnStartedAt: pluginAgentPresentationClockSchema.nullable(),
    acknowledgedTurnStartedAt: pluginAgentPresentationClockSchema.nullable(),
    acknowledged: z.boolean().nullable()
  }),
  evidence: z.object({
    freshness: z.enum(['observed', 'stale', 'unverifiable', 'unknown']),
    reason: z.enum([
      'live-evidence',
      'structured-owner',
      'age-expired',
      'restored-unconfirmed',
      'synthetic-no-status',
      'owner-uncertain',
      'missing-evidence'
    ]),
    authorityObservedAt: pluginAgentPresentationClockSchema.nullable(),
    replicaFirstReceivedAt: pluginAgentPresentationClockSchema.nullable(),
    restoredUnconfirmed: z.boolean().nullable(),
    structuredHostOwned: z.boolean().nullable(),
    hasLivePty: z.boolean().nullable()
  }),
  agent: z.string().max(128).nullable(),
  title: label,
  task: label,
  prompt: excerpt,
  lastAssistantMessage: excerpt,
  pendingQuestion: excerpt,
  textTruncated: z.boolean(),
  totalChildRows: count,
  childrenTruncated: z.boolean(),
  childrenContinuation: continuation.nullable(),
  children: z.array(pluginAgentPresentationChildSchema).max(PLUGIN_AGENT_PRESENTATION_MAX_CHILDREN),
  destinations: z.object({
    terminal: z.object({ terminalId: id }).nullable(),
    chat: z.object({ orcaSessionId: id }).nullable()
  })
})

const inventoryPage = { kind: z.literal('inventory'), parentRowId: z.null(), offset: count }
const childrenPage = { kind: z.literal('children'), parentRowId: opaque, offset: count }
const openPage = { complete: z.boolean(), next: continuation.nullable() }
const finalPage = { complete: z.literal(true), next: z.null() }
export const pluginAgentPresentationPageSchema = z.discriminatedUnion('kind', [
  z.object({ ...inventoryPage, ...openPage }),
  z.object({ ...childrenPage, ...openPage })
])
const finalPageSchema = z.discriminatedUnion('kind', [
  z.object({ ...inventoryPage, ...finalPage }),
  z.object({ ...childrenPage, ...finalPage })
])
export const pluginAgentPresentationUnavailableReasonSchema = z.enum([
  'renderer-unavailable',
  'producer-not-ready',
  'scope-unhydrated',
  'scope-not-found',
  'scope-ambiguous',
  'continuation-invalidated',
  'owner-unavailable',
  'owner-unsupported',
  'producer-changed',
  'owner-changed',
  'projection-not-settled',
  'capacity-limit',
  'malformed-projection'
])
export const pluginAgentPresentationParamsSchema = z.strictObject({
  projectionVersion: z.literal(1),
  workspaceId: id,
  requestKey: opaque,
  continuation: continuation.optional()
})
const correlation = {
  projectionVersion: z.literal(1),
  workspaceId: id,
  requestKey: opaque
}
const evaluated = {
  ...correlation,
  scope: pluginAgentPresentationScopeSchema,
  version: pluginAgentPresentationVersionSchema,
  observation: pluginAgentPresentationObservationSchema,
  totalRows: count,
  rows: z.array(pluginAgentPresentationRowSchema).max(PLUGIN_AGENT_PRESENTATION_MAX_ROWS)
}
export const pluginAgentPresentationResultSchema = z.discriminatedUnion('status', [
  z.object({
    ...evaluated,
    status: z.literal('complete'),
    reason: z.null(),
    page: finalPageSchema,
    truncated: z.literal(false)
  }),
  z.object({
    ...evaluated,
    status: z.literal('partial'),
    reason: z.enum(['row-limit', 'byte-limit', 'row-validation']),
    page: pluginAgentPresentationPageSchema,
    truncated: z.literal(true)
  }),
  z.object({
    ...correlation,
    status: z.literal('unavailable'),
    reason: pluginAgentPresentationUnavailableReasonSchema,
    scope: pluginAgentPresentationScopeSchema.nullable(),
    version: pluginAgentPresentationVersionSchema.nullable(),
    observation: pluginAgentPresentationObservationSchema.nullable(),
    totalRows: z.null(),
    page: z.null(),
    truncated: z.literal(false),
    rows: z.array(pluginAgentPresentationRowSchema).max(0)
  })
])

export type PluginAgentPresentationRow = z.infer<typeof pluginAgentPresentationRowSchema>
export type PluginAgentPresentationResult = z.infer<typeof pluginAgentPresentationResultSchema>
export type PluginAgentPresentationParams = z.infer<typeof pluginAgentPresentationParamsSchema>
export type PluginAgentPresentationVersion = z.infer<typeof pluginAgentPresentationVersionSchema>

export const PLUGIN_AGENT_PRESENTATION_API = {
  'agents.presentation': spec({
    summary:
      'Versioned canonical agent presentation as of a qualified trusted-renderer read, independent of popout settings. Presentation observation never refreshes underlying activity evidence. Enumerate revision-bound inventory and child pages before replacing retained rows; partial or unavailable replies do not prove absence. Requires the personal host contract and method detection, not an official release floor.',
    since: 11,
    customBuild: 'andre-dashboard-v1',
    scope: 'any-workspace',
    capability: 'agent:summary',
    mutation: false,
    surfaces: WORKER_ONLY,
    params: pluginAgentPresentationParamsSchema,
    result: pluginAgentPresentationResultSchema
  })
}
