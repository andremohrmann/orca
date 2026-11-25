import { pluginAgentPresentationPageProven } from './plugin-agent-presentation-page-proof'
import { z } from 'zod'
import {
  PLUGIN_AGENT_PRESENTATION_API,
  PLUGIN_AGENT_PRESENTATION_MAX_BYTES,
  pluginAgentPresentationResultSchema,
  type PluginAgentPresentationParams,
  type PluginAgentPresentationResult
} from '../../../../shared/plugins/workers/plugin-host-api-agent-presentation'
import { bind } from './plugin-host-method-bind'
import type { PluginHostMethodContext } from './plugin-host-method-bind'
import { pluginHostRpc, pluginWorkspaceSelector } from './plugin-host-runtime-call'
import { PluginHostCallError } from './plugin-host-call-scope'
import {
  PluginAgentPresentationFences,
  type PluginPresentationFence
} from './plugin-agent-presentation-fences'

const fences = new PluginAgentPresentationFences()
const scopeAnswer = z.object({
  worktree: z.object({ id: z.string().min(1), hostId: z.string().min(1) })
})
function unavailable(
  params: PluginAgentPresentationParams,
  reason: Extract<PluginAgentPresentationResult, { status: 'unavailable' }>['reason']
): PluginAgentPresentationResult {
  return {
    projectionVersion: 1,
    workspaceId: params.workspaceId,
    requestKey: params.requestKey,
    status: 'unavailable',
    reason,
    scope: null,
    version: null,
    observation: null,
    totalRows: null,
    page: null,
    rows: [],
    truncated: false
  }
}

async function readPresentation(
  params: PluginAgentPresentationParams,
  ctx: PluginHostMethodContext
): Promise<PluginAgentPresentationResult> {
  ctx.scope.assertActive()
  const authorization = ctx.scope.authorizationEpoch
  if (!authorization || !ctx.services.renderer?.readAgentPresentation) {
    return unavailable(params, 'renderer-unavailable')
  }
  let fence: PluginPresentationFence = fences.begin(ctx.pluginId, params.workspaceId, authorization)
  const selected = params.continuation ? fences.decode(fence, params.continuation) : null
  if (params.continuation && !selected) {
    return unavailable(params, 'continuation-invalidated')
  }
  const deadline = performance.now() + 10_000
  const active = (): void => {
    ctx.scope.assertActive()
    if (!fences.isCurrent(fence)) {
      throw new PluginHostCallError('unavailable', 'Presentation version retired')
    }
    if (performance.now() >= deadline) {
      throw new PluginHostCallError('timeout', 'Presentation read timed out')
    }
  }
  const resolve = async () => {
    active()
    const value = scopeAnswer.parse(
      await pluginHostRpc(ctx.services)(
        'worktree.show',
        {
          worktree: pluginWorkspaceSelector(params.workspaceId),
          matchFolderWorkspaces: true
        },
        { signal: ctx.scope.signal }
      )
    )
    active()
    return value.worktree
  }
  const workspace = await resolve()
  const selection = selected && fence.version ? { ...selected, version: fence.version } : null
  active()
  const reply = await ctx.services.renderer.readAgentPresentation(
    { params, worktreeId: workspace.id, executionHostId: workspace.hostId, selection },
    ctx.scope,
    Math.max(1, deadline - performance.now())
  )
  active()
  if (!reply) {
    return unavailable(params, 'renderer-unavailable')
  }
  let result = reply.result
  if (result.workspaceId !== params.workspaceId || result.requestKey !== params.requestKey) {
    return unavailable(params, 'malformed-projection')
  }
  if (result.status === 'unavailable') {
    fences.retire(fence)
    return result
  }
  if (result.scope.hostId !== workspace.hostId) {
    return unavailable(params, 'owner-changed')
  }
  const accepted = fences.accept(fence, result.version, Boolean(params.continuation))
  if (!accepted) {
    return unavailable(params, 'continuation-invalidated')
  }
  fence = accepted
  active()
  const currentWorkspace = await resolve()
  if (workspace.id !== currentWorkspace.id || workspace.hostId !== currentWorkspace.hostId) {
    fences.retire(fence)
    return unavailable(params, 'owner-changed')
  }
  // Recheck the document/owner/semantic generation after the final awaited runtime resolution.
  const confirmed = await ctx.services.renderer.readAgentPresentation(
    {
      params,
      worktreeId: workspace.id,
      executionHostId: workspace.hostId,
      selection: {
        ...(selected ?? {
          kind: 'inventory',
          parentRowId: null,
          offset: 0,
          coverageInvalid: false
        }),
        version: result.version
      }
    },
    ctx.scope,
    Math.max(1, deadline - performance.now())
  )
  active()
  if (
    !confirmed ||
    confirmed.result.status === 'unavailable' ||
    JSON.stringify(confirmed.result.version) !== JSON.stringify(result.version)
  ) {
    fences.retire(fence)
    return unavailable(params, 'producer-changed')
  }
  const metadata = reply.page
  if (
    !pluginAgentPresentationPageProven(
      result,
      metadata,
      selected ?? { kind: 'inventory', parentRowId: null, offset: 0, coverageInvalid: false }
    )
  ) {
    fences.retire(fence)
    return unavailable(params, 'malformed-projection')
  }
  const pageKind = result.page.kind
  const rows = result.rows.map((row) => {
    const child = metadata.childReaders.find((entry) => entry.rowId === row.rowId)
    const next =
      pageKind === 'children' && metadata.nextReader ? metadata.nextReader : child?.reader
    return { ...row, childrenContinuation: next ? fences.mint(fence, next) : null }
  })
  result =
    result.status === 'partial'
      ? {
          ...result,
          rows,
          page: {
            ...result.page,
            next: metadata.nextReader ? fences.mint(fence, metadata.nextReader) : null
          }
        }
      : { ...result, rows }

  active()
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > PLUGIN_AGENT_PRESENTATION_MAX_BYTES) {
    return unavailable(params, 'malformed-projection')
  }
  return pluginAgentPresentationResultSchema.parse(result)
}

export async function readPluginAgentPresentation(
  params: PluginAgentPresentationParams,
  ctx: PluginHostMethodContext
): Promise<PluginAgentPresentationResult> {
  const deadline = AbortSignal.timeout(10_000)
  const signal = ctx.scope.signal ? AbortSignal.any([ctx.scope.signal, deadline]) : deadline
  const original = ctx.scope
  try {
    return await readPresentation(params, {
      ...ctx,
      scope: {
        ...original,
        signal,
        assertActive() {
          original.assertActive()
          signal.throwIfAborted()
        }
      }
    })
  } catch (error) {
    if (deadline.aborted && !original.signal?.aborted) {
      throw new PluginHostCallError('timeout', 'Presentation read timed out')
    }
    throw error
  }
}

export const PLUGIN_AGENT_PRESENTATION_HANDLERS = {
  'agents.presentation': bind(
    PLUGIN_AGENT_PRESENTATION_API['agents.presentation'],
    readPluginAgentPresentation
  )
}
