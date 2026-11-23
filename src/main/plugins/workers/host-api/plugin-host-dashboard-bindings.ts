import { z } from 'zod'
import type { PLUGIN_DASHBOARD_API } from '../../../../shared/plugins/workers/plugin-host-api-dashboard'
import {
  pluginDashboardAgentRowSchema,
  projectPluginAgentSummary
} from './plugin-agent-summary-projection'
import {
  PLUGIN_HOST_API,
  type PluginHostResult
} from '../../../../shared/plugins/workers/plugin-host-api'
import { structuredAgentSessionIdFromTabId } from '../../../../shared/agent-session/view/structured-agent-session-tab-id'
import { parsePaneKey } from '../../../../shared/workspace-layout/stable-pane-id'
import { parseWorkspaceKey } from '../../../../shared/workspace/identity/workspace-scope'
import { pluginWorkspaceId } from '../../../../shared/plugins/workers/plugin-host-api-workspace-methods'
import { bind, type BoundPluginHostMethod } from './plugin-host-method-bind'
import { PluginHostCallError } from './plugin-host-call-scope'
import {
  pluginHostEffect as effect,
  pluginHostRpc as rpc,
  pluginWorkspaceSelector as selector
} from './plugin-host-runtime-call'
import { normalizeWorkspaceAttachments } from '../../../../shared/workspace-attachments/workspace-attachment-normalization'
import {
  normalizeWorkspaceStatuses,
  getWorkspaceStatus
} from '../../../../shared/workspace/status/workspace-statuses'
import { terminalForPane } from './plugin-workspace-projection'
import { isTerminalHandle } from '../../../../shared/terminal/terminal-handle-prefix'
import { readPluginAgentAttention } from './plugin-agent-attention'
import { projectPluginQuotaReadings } from './plugin-quota-projection'

const psAnswer = z.object({
  worktrees: z.array(
    z.object({
      worktreeId: z.string(),
      hostId: z.string().optional(),
      identity: z.object({ key: z.string(), executionHostId: z.string().optional() }).optional(),
      workspaceStatus: z.string().optional(),
      agents: z.array(pluginDashboardAgentRowSchema),
      linkedPR: z
        .object({ number: z.number().int().positive(), state: z.string() })
        .nullable()
        .optional(),
      linkedGitLabMR: z.number().int().positive().nullable().optional(),
      linkedItems: z.array(z.unknown()).optional()
    })
  ),
  truncated: z.boolean(),
  totalCount: z.number().optional()
})
const workflowOptions = z.array(z.object({ id: z.string(), label: z.string() }))
const uiAnswer = z.object({ ui: z.object({ workspaceStatuses: workflowOptions.optional() }) })
const showAnswer = z.object({
  worktree: z.object({
    id: z.string(),
    hostId: z.string().optional(),
    workspaceStatus: z.string().optional()
  })
})
const api = PLUGIN_HOST_API

async function workspaceRow(ctx: Parameters<typeof rpc>[0], workspaceId: string) {
  const resolved = showAnswer.parse(
    await rpc(ctx)('worktree.show', {
      worktree: selector(workspaceId),
      matchFolderWorkspaces: true
    })
  ).worktree
  const answer = psAnswer.parse(
    await rpc(ctx)('worktree.ps', { limit: 500, worktreeId: resolved.id })
  )
  const matches = answer.worktrees.filter(
    (row) =>
      pluginWorkspaceId({ id: row.worktreeId, identityKey: row.identity?.key }) === workspaceId
  )
  if (matches.length !== 1) {
    throw new PluginHostCallError(
      'action_failed',
      matches.length > 1
        ? 'workspace identity is ambiguous'
        : 'workspace is absent from the bounded host snapshot'
    )
  }
  const row = matches[0]!
  return { ...row, hostId: row.hostId ?? row.identity?.executionHostId ?? resolved.hostId }
}
async function optionsFor(services: Parameters<typeof rpc>[0]) {
  const { ui } = uiAnswer.parse(await rpc(services)('ui.get', {}))
  return normalizeWorkspaceStatuses(ui.workspaceStatuses)
}
export const PLUGIN_DASHBOARD_HANDLERS = {
  'provider.usage': bind(api['provider.usage'], async (params, { services }) =>
    projectPluginQuotaReadings(
      await rpc(services)('accounts.list', params?.refresh ? { refreshStaleUsage: true } : {})
    )
  ),
  'workspace.workflow': bind(api['workspace.workflow'], async ({ workspaceId }, { services }) => {
    const [row, options] = await Promise.all([
      workspaceRow(services, workspaceId),
      optionsFor(services)
    ])
    const attachments = normalizeWorkspaceAttachments(row.linkedItems)
    const reviews: PluginHostResult<'workspace.workflow'>['reviews'] = attachments.flatMap((item) =>
      (item.type === 'pr' || item.type === 'mr') &&
      item.provider !== 'linear' &&
      item.provider !== 'jira'
        ? [{ provider: item.provider, number: item.number, state: null }]
        : []
    )
    if (row.linkedPR) {
      const state = row.linkedPR.state === 'unknown' ? null : row.linkedPR.state.slice(0, 128)
      const attached = reviews.find(
        (review) => review.provider === 'github' && review.number === row.linkedPR?.number
      )
      if (attached) {
        attached.state = state
      } else {
        reviews.push({ provider: 'github', number: row.linkedPR.number, state })
      }
    }
    if (
      row.linkedGitLabMR &&
      !reviews.some(
        (review) => review.provider === 'gitlab' && review.number === row.linkedGitLabMR
      )
    ) {
      reviews.push({ provider: 'gitlab', number: row.linkedGitLabMR, state: null })
    }
    const snapshot = row.hostId
      ? await services.renderer
          ?.readWorkspaceReview?.({ worktreeId: row.worktreeId, executionHostId: row.hostId })
          .catch(() => null)
      : null
    const canonical =
      snapshot?.worktreeId === row.worktreeId && snapshot.executionHostId === row.hostId
        ? snapshot
        : null
    if (canonical?.review) {
      const attached = reviews.find(
        (review) =>
          review.provider === canonical.review?.provider &&
          review.number === canonical.review.number
      )
      if (attached) {
        attached.state = canonical.review.state
      } else {
        reviews.push(canonical.review)
      }
    }
    return {
      workspaceId,
      hostId: row.hostId ?? null,
      hasReview: canonical?.hasReview ?? (reviews.length > 0 ? true : null),
      review: canonical?.review ?? null,
      reviewsTruncated: reviews.length > 50,
      options: options
        .slice(0, 128)
        .map((option) => ({ id: option.id, label: option.label.slice(0, 512) })),
      assignedId: row.workspaceStatus ?? null,
      effectiveAssignedId: getWorkspaceStatus({ workspaceStatus: row.workspaceStatus }, options),
      optionsTruncated: options.length > 128,
      reviews: reviews.slice(0, 50)
    }
  }),
  'workspace.setWorkflow': bind(
    api['workspace.setWorkflow'],
    async ({ workspaceId, statusId }, ctx) => {
      await workspaceRow(ctx.services, workspaceId)
      const options = await optionsFor(ctx.services)
      if (!options.some((option) => option.id === statusId)) {
        throw new PluginHostCallError(
          'invalid_params',
          'statusId is not in the host workflow catalogue'
        )
      }
      const folder = parseWorkspaceKey(workspaceId)
      if (folder?.type === 'folder') {
        const result = z
          .object({
            folderWorkspace: z.object({ workspaceStatus: z.string().optional() }).nullable()
          })
          .parse(
            await effect(ctx, 'folderWorkspace.update', {
              folderWorkspaceId: folder.folderWorkspaceId,
              requireUniqueId: true,
              updates: { workspaceStatus: statusId }
            })
          )
        if (!result.folderWorkspace) {
          throw new PluginHostCallError('action_failed', 'workspace is unavailable')
        }
        return { assignedId: result.folderWorkspace.workspaceStatus ?? null }
      }
      const result = showAnswer.parse(
        await effect(ctx, 'worktree.set', {
          worktree: selector(workspaceId),
          workspaceStatus: statusId
        })
      )
      return { assignedId: result.worktree.workspaceStatus ?? null }
    }
  ),
  'agents.summaries': bind(api['agents.summaries'], async ({ workspaceId }, { services }) => {
    const row = await workspaceRow(services, workspaceId)
    const attention = await readPluginAgentAttention(rpc(services))
    const listed = z
      .object({
        terminals: z.array(
          z.object({
            handle: z.string(),
            tabId: z.string().optional(),
            leafId: z.string().optional()
          })
        ),
        truncated: z.boolean().optional(),
        totalCount: z.number().optional()
      })
      .parse(
        await rpc(services)('terminal.list', {
          worktree: selector(workspaceId),
          limit: 50,
          includeVisualLayouts: false,
          includePreview: false
        }).catch(() => ({ terminals: [] }))
      )
    const terminals = listed.terminals
      .filter((terminal) => terminal.handle.length > 0 && terminal.handle.length <= 1024)
      .slice(0, 50)
      .map((terminal) => ({
        id: terminal.handle,
        ...(terminal.tabId && terminal.leafId
          ? { paneKey: `${terminal.tabId}:${terminal.leafId}` }
          : {})
      }))
    return {
      workspaceId,
      hostId: row.hostId ?? null,
      truncated:
        row.agents.length > 100 ||
        listed.truncated === true ||
        (listed.totalCount ?? listed.terminals.length) > 50,
      agents: row.agents.slice(0, 100).map((agent) =>
        projectPluginAgentSummary(
          agent,
          terminalForPane(terminals, {
            paneKey: agent.paneKey,
            ...(agent.address && isTerminalHandle(agent.address)
              ? { terminalHandle: agent.address }
              : {})
          })?.id ?? null,
          attention
        )
      )
    }
  }),
  'agent.reveal': bind(api['agent.reveal'], async ({ workspaceId, orcaSessionId }, ctx) => {
    if (ctx.services.renderer?.revealExistingAgent) {
      return {
        revealed: await ctx.services.renderer.revealExistingAgent(
          { workspaceId, orcaSessionId },
          ctx.scope,
          ctx.pluginId
        )
      }
    }
    const row = await workspaceRow(ctx.services, workspaceId)
    if (row.hostId !== 'local') {
      throw new PluginHostCallError(
        'unavailable',
        'reveal must run on the execution host that owns this chat'
      )
    }
    const agent = row.agents.find((agent) => agent.orcaSessionId === orcaSessionId)
    const tabId = agent && parsePaneKey(agent.paneKey)?.tabId
    const sessionId = tabId ? structuredAgentSessionIdFromTabId(tabId) : null
    if (!sessionId) {
      return { revealed: false }
    }
    const result = z
      .object({ ok: z.boolean(), refusal: z.object({ code: z.string() }).optional() })
      .parse(
        await effect(ctx, 'agentSession.reveal', {
          expectedOpen: true,
          sessionId,
          expectedWorkspace: {
            workspaceId: row.worktreeId,
            ...(row.hostId ? { hostId: row.hostId } : {})
          }
        })
      )
    if (!result.ok && result.refusal?.code === 'agent_session_identity_required') {
      return { revealed: false }
    }
    if (!result.ok) {
      throw new PluginHostCallError('action_failed', 'existing chat could not be revealed')
    }
    return { revealed: true }
  })
} satisfies Record<keyof typeof PLUGIN_DASHBOARD_API, BoundPluginHostMethod>
