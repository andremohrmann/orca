import type {
  PluginExistingAgentTarget,
  PluginViewReply,
  PluginViewRequest
} from '../../../../../shared/plugins/view/plugin-view-protocol'
import { collectActiveDashboardWorkspaces } from '@/components/dashboard/snapshot/dashboard-snapshot-workspaces'
import { getWorktreeExecutionHostId } from '../../../../../shared/execution-host/execution-host'
import { structuredAgentSessionPaneKey } from '../../../../../shared/agent-session/view/structured-agent-session-projection'
import { resolveStructuredSessionOrcaSessionId } from '@/runtime/native-chat/orchestration/structured-session-orca-session-id'
import { parseOrcaSessionAddress } from '../../../../../shared/agent-session/identity/orca-session-address'
import { useAppStore } from '@/store'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForTab
} from '@/runtime/native-chat/session-ownership/structured-agent-session-owner'
import { activateStructuredAgentSessionTab } from '@/lib/agent-session/structured-agent-session-tab-activation'
import { activateAndRevealWorkspace } from '@/lib/workspace/activation/worktree-activation'

function existingAgentCandidates(
  workspaceId: string,
  orcaSessionId: string
): PluginExistingAgentTarget[] {
  const state = useAppStore.getState()
  const rows = collectActiveDashboardWorkspaces(state, false).filter(({ worktree }) =>
    workspaceId.startsWith('identity:')
      ? worktree.identity?.key === workspaceId.slice(9)
      : worktree.id === workspaceId
  )
  if (rows.length !== 1) {
    return []
  }
  const workspace = rows[0]!
  const worktreeId = workspace.worktree.id
  const expectedHost = getWorktreeExecutionHostId(workspace.worktree, workspace.repo ?? undefined)
  const candidates = (state.unifiedTabsByWorktree[worktreeId] ?? []).flatMap((tab) => {
    if (tab.contentType !== 'agent-session' || tab.worktreeId !== worktreeId) {
      return []
    }
    const status = state.agentStatusByPaneKey.get(
      structuredAgentSessionPaneKey(tab.id, tab.entityId)
    )
    if (
      status?.orcaSessionId &&
      (parseOrcaSessionAddress(status.orcaSessionId) ?? status.orcaSessionId) !== orcaSessionId
    ) {
      return []
    }
    const hostId = structuredAgentSessionOwnerForTab(state, tab)
    if (!hostId || expectedHost !== hostId || !structuredAgentSessionTargetForTab(state, tab)) {
      return []
    }
    return [
      {
        publicWorkspaceId: workspaceId,
        worktreeId,
        hostId,
        orcaSessionId,
        sessionId: tab.entityId,
        tabId: tab.id
      }
    ]
  })
  return candidates
}

export async function resolvePluginExistingAgent(
  request: Extract<PluginViewRequest, { kind: 'resolve-existing-agent' }>
): Promise<PluginViewReply> {
  const candidates = existingAgentCandidates(request.workspaceId, request.orcaSessionId)
  const matches = await Promise.all(
    candidates.map(async (candidate) => {
      const state = useAppStore.getState()
      const tab = state.unifiedTabsByWorktree[candidate.worktreeId]?.find(
        (tab) => tab.id === candidate.tabId
      )
      const target = tab && structuredAgentSessionTargetForTab(state, tab)
      if (!target) {
        return null
      }
      const address = await resolveStructuredSessionOrcaSessionId(target, candidate.sessionId)
      const root = parseOrcaSessionAddress(address) ?? address
      return root === request.orcaSessionId ? candidate : null
    })
  )
  const matched = matches.filter((candidate) => candidate !== null)
  return {
    requestId: request.requestId,
    ok: true,
    agentTarget: matched.length === 1 ? matched[0]! : null
  }
}

export function focusPluginExistingAgent(
  request: Extract<PluginViewRequest, { kind: 'focus-existing-agent' }>
): PluginViewReply {
  const target = request.target
  const current = existingAgentCandidates(target.publicWorkspaceId, target.orcaSessionId).find(
    (candidate) =>
      candidate.worktreeId === target.worktreeId &&
      candidate.hostId === target.hostId &&
      candidate.sessionId === target.sessionId &&
      candidate.tabId === target.tabId
  )
  if (
    !current ||
    current.worktreeId !== target.worktreeId ||
    current.hostId !== target.hostId ||
    current.sessionId !== target.sessionId ||
    current.tabId !== target.tabId
  ) {
    return { requestId: request.requestId, ok: true, revealed: false }
  }
  const state = useAppStore.getState()
  const tab = state.unifiedTabsByWorktree[target.worktreeId]?.find((row) => row.id === target.tabId)
  const owner = tab && structuredAgentSessionOwnerForTab(state, tab)
  const runtimeTarget = tab && structuredAgentSessionTargetForTab(state, tab)
  const revealed = Boolean(
    owner &&
    runtimeTarget &&
    activateAndRevealWorkspace(target.worktreeId, { executionHostId: owner }) !== false &&
    activateStructuredAgentSessionTab({
      worktreeId: target.worktreeId,
      tabId: target.tabId,
      target: runtimeTarget,
      ownerAlreadyActivated: true
    })
  )
  return { requestId: request.requestId, ok: true, revealed }
}
