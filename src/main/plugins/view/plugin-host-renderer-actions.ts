import type {
  PluginAgentPresentationRead,
  PluginAgentPresentationReply,
  PluginAgentPresentationRelayPage
} from '../../../shared/plugins/view/plugin-agent-presentation-relay'
import {
  PLUGIN_VIEW_NO_WORKSPACE_CODE,
  type PluginViewReply,
  type PluginViewRequestBody,
  type PluginWorkspaceReview
} from '../../../shared/plugins/view/plugin-view-protocol'
import type { PluginCommandAliasActionId } from '../../../shared/plugins/contributions/plugin-command-actions'
import { PluginHostCallError } from '../workers/host-api/plugin-host-call-scope'
import type { PluginHostCallScope } from '../workers/host-api/plugin-host-call-scope'

/** What a worker's `editor.open` and `commands.run` ask of Orca's window. */
export type PluginHostRendererActions = {
  readAgentPresentation?(
    input: PluginAgentPresentationRead,
    scope: PluginHostCallScope,
    timeoutMs: number
  ): Promise<{
    result: PluginAgentPresentationReply
    page: PluginAgentPresentationRelayPage
  } | null>
  openFile(worktreeId: string, relativePath: string): Promise<void>
  runAction(action: PluginCommandAliasActionId): Promise<void>
  openFolderWorkspace(folderWorkspaceId: string): Promise<void>
  readWorkspaceReview?(input: {
    worktreeId: string
    executionHostId: string
  }): Promise<PluginWorkspaceReview | null>
  revealExistingAgent?(
    input: { workspaceId: string; orcaSessionId: string },
    scope: PluginHostCallScope,
    pluginId: string
  ): Promise<boolean>
}

type ExistingAgentReveal = NonNullable<PluginHostRendererActions['revealExistingAgent']>
let existingAgentReveal: ExistingAgentReveal | null = null
export function setPluginExistingAgentReveal(next: ExistingAgentReveal | null): void {
  existingAgentReveal = next
}

/** Sends one request to the main window's renderer; null when there is no window to ask. */
export type PluginHostRendererRequest = (
  body: PluginViewRequestBody,
  options?: { signal?: AbortSignal; timeoutMs?: number }
) => Promise<PluginViewReply> | null

// Set by the desktop app's view binding (Electron stays out of this module); null in headless serve.
let request: PluginHostRendererRequest | null = null

export function setPluginHostRendererRequest(next: PluginHostRendererRequest | null): void {
  request = next
}

async function readAgentPresentation(
  input: PluginAgentPresentationRead,
  scope: PluginHostCallScope,
  timeoutMs: number
) {
  scope.assertActive()
  const pending = request?.(
    { kind: 'read-agent-presentation', ...input },
    { signal: scope.signal, timeoutMs }
  )
  if (!pending) {
    return null
  }
  const reply = await pending
  scope.assertActive()
  if (!reply.ok || !reply.agentPresentation || !reply.agentPresentationPage) {
    return null
  }
  return { result: reply.agentPresentation, page: reply.agentPresentationPage }
}

async function readWorkspaceReview(input: {
  worktreeId: string
  executionHostId: string
}): Promise<PluginWorkspaceReview | null> {
  const pending = request?.({ kind: 'read-workspace-review', ...input })
  if (!pending) {
    return null
  }
  const reply = await pending
  if (!reply.ok) {
    throw new PluginHostCallError('unavailable', reply.message)
  }
  const value = reply.workspaceReview
  return value?.worktreeId === input.worktreeId && value.executionHostId === input.executionHostId
    ? value
    : null
}

async function ask(body: PluginViewRequestBody): Promise<void> {
  const pending = request?.(body) ?? null
  if (!pending) {
    throw new PluginHostCallError('unavailable', 'Orca has no window open to do this in')
  }
  const reply = await pending.catch((error: unknown) => {
    throw new PluginHostCallError(
      'unavailable',
      error instanceof Error ? error.message : String(error)
    )
  })
  if (!reply.ok) {
    const unavailable =
      reply.code === PLUGIN_VIEW_NO_WORKSPACE_CODE || reply.code === 'action_unavailable'
    throw new PluginHostCallError(unavailable ? 'unavailable' : 'action_failed', reply.message)
  }
}

export function getPluginHostRendererActions(): PluginHostRendererActions | null {
  return request
    ? {
        readWorkspaceReview,
        readAgentPresentation,
        ...(existingAgentReveal ? { revealExistingAgent: existingAgentReveal } : {}),
        openFile: (worktreeId, relativePath) =>
          ask({ kind: 'open-file', worktreeId, relativePath }),
        runAction: (action) => ask({ kind: 'run-action', action }),
        openFolderWorkspace: (folderWorkspaceId) =>
          ask({ kind: 'open-folder-workspace', folderWorkspaceId })
      }
    : null
}
