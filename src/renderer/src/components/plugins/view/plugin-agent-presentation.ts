import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { parseExecutionHostId } from '../../../../../shared/execution-host/execution-host'
import { parseWorkspaceKey } from '../../../../../shared/workspace/identity/workspace-scope'
import type { RuntimeStatus } from '../../../../../shared/remote-runtime/session-graph/runtime-session-contracts'
import type {
  PluginViewRequest,
  PluginViewReply
} from '../../../../../shared/plugins/view/plugin-view-protocol'
import { callRuntimeRpcResponse } from '@/runtime/rpc/calls/runtime-rpc-call'
import { getEnvironmentRuntimeContextKey } from '@/runtime/hosts/observations/provider-runtime-context'
import { isAgentStatusStartupSnapshotSuccessful } from '@/hooks/ipc-events/agent-status/agent-status-startup-snapshot'
import { hasLocalStructuredInventorySuccessful } from '@/runtime/local-structured-session-tabs-sync/inventory-generation-fence'
import { refreshLocalStructuredSessionTabs } from '@/runtime/local-structured-session-tabs-sync/inventory-refresh'
import { hasHostSessionMirrorHydrated } from '@/runtime/web-session-tabs-sync/hydration/host-session-mirror-hydration'
import { getRuntimeEnvironmentConnectionGeneration } from '@/store/slices/runtime-status/runtime-status-connection-generation'
import { getRuntimeEnvironmentRevision } from '@/runtime/rpc/environment-revisions/runtime-environment-revision'
import { getWebSessionTabsTrackingGeneration } from '@/runtime/web-session-tabs-sync/tracking/tracking-lifecycle'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForHost
} from '@/runtime/native-chat/session-ownership/structured-agent-session-owner'
import { getStructuredAgentSessionStatusFeed } from '@/runtime/native-chat/status/structured-agent-session-status-feed'
import { getStructuredChatTabNames } from '@/runtime/native-chat/naming/structured-chat-name-observation'
import { settleAgentPresentationInputs } from '@/runtime/agent-presentation-read-boundary'
import { pluginWorkspaceScopeCandidates } from './plugin-workspace-scope'
import {
  createAgentPresentationReader,
  unavailableAgentPresentation
} from './plugin-agent-presentation-reader'
import { agentPresentationDigest } from './plugin-agent-presentation-rows'

const reader = createAgentPresentationReader()
type Request = Extract<PluginViewRequest, { kind: 'read-agent-presentation' }>

function ownerEpoch(
  state: AppState,
  host: NonNullable<ReturnType<typeof parseExecutionHostId>>,
  localRuntime: string
): string | null {
  if (host.kind === 'local') {
    return agentPresentationDigest([host.id, localRuntime, getEnvironmentRuntimeContextKey(null)])
  }
  if (host.kind === 'ssh') {
    const connection = state.sshConnectionStates.get(host.targetId)
    return connection?.status === 'connected' &&
      connection.providerEpoch &&
      connection.connectionGeneration !== undefined
      ? agentPresentationDigest([
          host.id,
          connection.providerEpoch,
          connection.connectionGeneration
        ])
      : null
  }
  const environment = state.runtimeEnvironments.find((entry) => entry.id === host.environmentId)
  const status = state.runtimeStatusByEnvironmentId.get(host.environmentId)
  return environment && status?.status?.runtimeId && status.snapshot?.verification === 'verified'
    ? agentPresentationDigest([
        host.id,
        environment.id,
        status.status.runtimeId,
        getRuntimeEnvironmentRevision(host.environmentId),
        getRuntimeEnvironmentConnectionGeneration(host.environmentId),
        getWebSessionTabsTrackingGeneration(host.environmentId)
      ])
    : null
}

export async function readPluginAgentPresentation(request: Request): Promise<PluginViewReply> {
  const unavailable = (
    reason: Parameters<typeof unavailableAgentPresentation>[1]
  ): PluginViewReply => ({
    requestId: request.requestId,
    ok: true,
    agentPresentation: unavailableAgentPresentation(request.params, reason),
    agentPresentationPage: { consumed: 0, nextReader: null, childReaders: [] }
  })
  const host = parseExecutionHostId(request.executionHostId)
  if (!host || host.id !== request.executionHostId) {
    return unavailable('owner-unsupported')
  }
  let state = useAppStore.getState()
  if (
    !state.hydrationSucceeded ||
    !state.persistedUIReady ||
    !state.workspaceSessionReady ||
    !isAgentStatusStartupSnapshotSuccessful()
  ) {
    return unavailable('producer-not-ready')
  }
  const initialMatches = pluginWorkspaceScopeCandidates(state, request.worktreeId, host.id)
  if (initialMatches.length !== 1) {
    return unavailable(initialMatches.length ? 'scope-ambiguous' : 'scope-not-found')
  }
  let localRuntime = ''
  const localContext = getEnvironmentRuntimeContextKey(null)
  const before = host.kind === 'local' ? null : ownerEpoch(state, host, '')
  if (host.kind !== 'local' && !before) {
    return unavailable('owner-unavailable')
  }
  if (host.kind === 'local') {
    try {
      const response = await callRuntimeRpcResponse<RuntimeStatus>(
        { kind: 'local' },
        'status.get',
        {},
        { timeoutMs: 5000 }
      )
      localRuntime = response._meta.runtimeId
      if (
        !localRuntime ||
        response.result.runtimeId !== localRuntime ||
        getEnvironmentRuntimeContextKey(null) !== localContext
      ) {
        return unavailable('owner-changed')
      }
      if (!hasLocalStructuredInventorySuccessful(localRuntime)) {
        await refreshLocalStructuredSessionTabs()
      }
      if (!hasLocalStructuredInventorySuccessful(localRuntime)) {
        return unavailable('scope-unhydrated')
      }
    } catch {
      return unavailable('owner-unavailable')
    }
  } else if (
    host.kind === 'runtime' &&
    !hasHostSessionMirrorHydrated(host.environmentId, request.worktreeId)
  ) {
    return unavailable('scope-unhydrated')
  }
  state = useAppStore.getState()
  const epoch = ownerEpoch(state, host, localRuntime)
  if (
    !epoch ||
    (before && epoch !== before) ||
    getEnvironmentRuntimeContextKey(null) !== localContext
  ) {
    return unavailable('owner-changed')
  }
  if (
    pluginWorkspaceScopeCandidates(state, request.worktreeId, host.id).length !== 1 ||
    !state.hydrationSucceeded ||
    !isAgentStatusStartupSnapshotSuccessful()
  ) {
    return unavailable('scope-unhydrated')
  }
  const chats = (state.unifiedTabsByWorktree[request.worktreeId] ?? []).filter(
    (tab) =>
      tab.contentType === 'agent-session' &&
      structuredAgentSessionOwnerForTab(state, tab) === host.id
  )
  if (chats.length) {
    const target = structuredAgentSessionTargetForHost(host.id)
    if (!target) {
      return unavailable('owner-unsupported')
    }
    if (!getStructuredAgentSessionStatusFeed(target).getReadiness().successful) {
      return unavailable('producer-not-ready')
    }
  }
  if (!settleAgentPresentationInputs(chats.length > 0)) {
    return unavailable('projection-not-settled')
  }
  const names = getStructuredChatTabNames()
  const page = reader.readPage(
    {
      params: request.params,
      worktreeId: request.worktreeId,
      hostId: host.id,
      ownerEpoch: epoch,
      kind: parseWorkspaceKey(request.worktreeId)?.type === 'folder' ? 'folder' : 'worktree',
      selection: request.selection
    },
    useAppStore,
    names
  )
  if (ownerEpoch(useAppStore.getState(), host, localRuntime) !== epoch) {
    return unavailable('owner-changed')
  }
  return {
    requestId: request.requestId,
    ok: true,
    agentPresentation: page.result,
    agentPresentationPage: {
      consumed: page.consumed,
      nextReader: page.nextReader,
      childReaders: page.childReaders
    }
  }
}
