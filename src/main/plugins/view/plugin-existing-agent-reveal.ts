import { z } from 'zod'
import { SESSION_TABS_ACTIVATE_EXISTING_AGENT_RUNTIME_CAPABILITY } from '../../../shared/remote-runtime/protocol/session-tabs-runtime-capabilities'
import type {
  PluginExistingAgentTarget,
  PluginViewReply,
  PluginViewRequestBody
} from '../../../shared/plugins/view/plugin-view-protocol'
import { parseExecutionHostId } from '../../../shared/execution-host/execution-host'
import { callRuntimeEnvironment } from '../../ipc/runtime-environments/requests/runtime-environment-transport-routing'
import { getRuntimeEnvironmentRegistryRoot } from '../../ipc/runtime-environments/catalog/runtime-environment-registry-root'
import {
  PluginHostCallError,
  type PluginHostCallScope
} from '../workers/host-api/plugin-host-call-scope'
import type { PluginRuntimeRpc } from '../workers/host-api/plugin-host-runtime-call'
import { pluginWorkspaceSelector } from '../workers/host-api/plugin-host-runtime-call'

type Request = (body: PluginViewRequestBody) => Promise<PluginViewReply>
const activationAnswer = z.object({
  worktree: z.string(),
  activeTabId: z.string().nullable(),
  tabs: z.array(z.object({ id: z.string(), type: z.string(), sessionId: z.string().optional() }))
})

async function remoteResult(
  environmentId: string,
  method: string,
  params: unknown,
  scope: PluginHostCallScope,
  runtimeId?: string
): Promise<unknown> {
  const reply = await callRuntimeEnvironment(
    getRuntimeEnvironmentRegistryRoot(),
    environmentId,
    method,
    params,
    10_000,
    undefined,
    undefined,
    {
      ...(scope.signal ? { signal: scope.signal } : {}),
      ...(runtimeId ? { expectedEnvironmentRuntimeId: runtimeId } : {}),
      prepareGuard: async () => () => {
        scope.assertActive()
        return true
      }
    }
  )
  if (!reply.ok) {
    throw new PluginHostCallError('unavailable', 'the owning host refused existing chat activation')
  }
  return reply.result
}

async function activateOwner(
  target: PluginExistingAgentTarget,
  scope: PluginHostCallScope,
  local: PluginRuntimeRpc | undefined,
  pluginId: string
): Promise<boolean> {
  const host = parseExecutionHostId(target.hostId)
  const params = {
    worktree: pluginWorkspaceSelector(target.worktreeId),
    tabId: target.tabId,
    notifyClients: false,
    navigation: 'caller',
    expectedAgentSessionId: target.sessionId,
    expectedWorktreeId: target.worktreeId
  }
  scope.assertActive()
  let answer: unknown
  if (host?.kind === 'local' && local) {
    answer = await local('session.tabs.activate', params, {
      beforeEffect: () => scope.assertActive(),
      plugin: { key: pluginId, name: scope.pluginName ?? pluginId },
      ...(scope.signal ? { signal: scope.signal } : {})
    })
  } else if (host?.kind === 'runtime') {
    const status = z
      .object({ runtimeId: z.string().min(1), capabilities: z.array(z.string()).optional() })
      .parse(await remoteResult(host.environmentId, 'status.get', {}, scope))
    if (!status.capabilities?.includes(SESSION_TABS_ACTIVATE_EXISTING_AGENT_RUNTIME_CAPABILITY)) {
      throw new PluginHostCallError(
        'unavailable',
        'the owning host does not support guarded existing chat activation'
      )
    }
    answer = await remoteResult(
      host.environmentId,
      'session.tabs.activate',
      params,
      scope,
      status.runtimeId
    )
  } else {
    throw new PluginHostCallError('unavailable', 'the owning host has no structured chat runtime')
  }
  const result = activationAnswer.parse(answer)
  return (
    result.worktree === target.worktreeId &&
    result.activeTabId === target.tabId &&
    result.tabs.some(
      (tab) =>
        tab.id === target.tabId &&
        tab.type === 'agent-session' &&
        tab.sessionId === target.sessionId
    )
  )
}

export async function revealPluginExistingAgent(
  input: { workspaceId: string; orcaSessionId: string },
  scope: PluginHostCallScope,
  request: Request,
  local: PluginRuntimeRpc | undefined,
  pluginId: string
): Promise<boolean> {
  scope.assertActive()
  const resolved = await request({ kind: 'resolve-existing-agent', ...input })
  if (!resolved.ok) {
    throw new PluginHostCallError(
      'unavailable',
      'the existing chat destination could not be resolved'
    )
  }
  const target = resolved.agentTarget
  if (!target) {
    return false
  }
  if (
    target.publicWorkspaceId !== input.workspaceId ||
    target.orcaSessionId !== input.orcaSessionId
  ) {
    throw new PluginHostCallError('action_failed', 'the existing chat destination changed')
  }
  try {
    if (!(await activateOwner(target, scope, local, pluginId))) {
      return false
    }
  } catch (error) {
    if (
      error instanceof PluginHostCallError ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      throw error
    }
    throw new PluginHostCallError(
      'unavailable',
      'the owning host could not activate the existing chat'
    )
  }
  scope.assertActive()
  const focused = await request({ kind: 'focus-existing-agent', target })
  if (!focused.ok) {
    throw new PluginHostCallError(
      'action_failed',
      'the existing chat destination could not be focused'
    )
  }
  return focused.revealed === true
}
