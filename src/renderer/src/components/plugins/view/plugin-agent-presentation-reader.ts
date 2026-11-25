import {
  selectPluginAgentPresentationPage,
  type PluginAgentPresentationPageSelection
} from '../../../../../shared/plugins/view/plugin-agent-presentation-pages'
import type { AppState } from '@/store/types'
import { createWorktreeAgentRowsSelector } from '@/components/sidebar/workspace-card/activity/worktree-agent-rows-projection'
import type { StructuredChatTabNames } from '@/runtime/native-chat/naming/structured-chat-tab-name'
import type { ExecutionHostId } from '../../../../../shared/execution-host/execution-host'
import type {
  PluginAgentPresentationParams,
  PluginAgentPresentationResult,
  PluginAgentPresentationVersion
} from '../../../../../shared/plugins/workers/plugin-host-api-agent-presentation'
import { PLUGIN_AGENT_PRESENTATION_MAX_FENCES } from '../../../../../shared/plugins/workers/plugin-host-api-agent-presentation'
import { createNonSecureContextUuid } from '../../../../../shared/identifiers/non-secure-context-uuid'
import {
  agentPresentationDigest,
  projectAgentPresentationRows
} from './plugin-agent-presentation-rows'

export type AgentPresentationSelection = {
  version: PluginAgentPresentationVersion
  kind: 'inventory' | 'children'
  parentRowId: string | null
  offset: number
  coverageInvalid: boolean
}
export type AgentPresentationReadInput = {
  params: PluginAgentPresentationParams
  worktreeId: string
  hostId: ExecutionHostId
  kind: 'worktree' | 'folder'
  ownerEpoch: string
  selection: AgentPresentationSelection | null
}
export function unavailableAgentPresentation(
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
    rows: [],
    page: null,
    truncated: false
  }
}

export function createAgentPresentationReader() {
  const producerEpoch = createNonSecureContextUuid()
  const receiverClock = `renderer:${producerEpoch}`
  const scopes = new Map<
    string,
    { epoch: string; generation: number; revision: number; digest: string }
  >()
  let generation = 0
  const readPage = (
    input: AgentPresentationReadInput,
    store: { getState: () => AppState },
    chatNames: StructuredChatTabNames
  ): PluginAgentPresentationPageSelection => {
    // The existing owner synchronously refreshes expired canonical rows before any input is captured.
    store.getState().scheduleAgentStatusFreshness()
    const state = store.getState()
    const now = Date.now()
    const rows = createWorktreeAgentRowsSelector(input.worktreeId, input.hostId)(state)
    const scopeKey = JSON.stringify([input.worktreeId, input.hostId, input.ownerEpoch])
    const semantic = projectAgentPresentationRows({
      state,
      rows,
      hostId: input.hostId,
      identityEpoch: `${producerEpoch}:${input.ownerEpoch}:${scopeKey}`,
      receiverClock,
      authorityClock: agentPresentationDigest([producerEpoch, input.ownerEpoch, 'authority-clock']),
      now,
      chatNames
    })
    const digest = agentPresentationDigest({
      rows: semantic.rows,
      sources: rows.map((row) => ({ entry: row.entry, tab: row.tab, lineage: row.lineage })),
      acknowledged: rows.map((row) => state.acknowledgedAgentsByPaneKey[row.paneKey] ?? null),
      topology: state.unifiedTabsByWorktree[input.worktreeId],
      layouts: rows.map((row) => state.terminalLayoutsByTabId[row.tab.id]),
      names: [...chatNames].filter(([tab]) => tab.worktreeId === input.worktreeId)
    })
    let scope = scopes.get(scopeKey)
    if (!scope) {
      if (scopes.size >= PLUGIN_AGENT_PRESENTATION_MAX_FENCES) {
        const oldest = scopes.keys().next().value
        if (oldest !== undefined) {
          scopes.delete(oldest)
        }
      }
      scope = {
        epoch: createNonSecureContextUuid(),
        generation: ++generation,
        revision: 1,
        digest
      }
      scopes.set(scopeKey, scope)
    } else if (scope.digest !== digest) {
      scope.digest = digest
      scope.revision += 1
    }
    const version: PluginAgentPresentationVersion = {
      producerEpoch,
      ownerEpoch: input.ownerEpoch,
      scopeEpoch: scope.epoch,
      scopeGeneration: scope.generation,
      revision: scope.revision
    }
    const selected = input.selection
    if (selected && JSON.stringify(selected.version) !== JSON.stringify(version)) {
      return {
        result: unavailableAgentPresentation(input.params, 'continuation-invalidated'),
        consumed: 0,
        nextReader: null,
        childReaders: []
      }
    }
    return selectPluginAgentPresentationPage({
      context: {
        projectionVersion: 1,
        workspaceId: input.params.workspaceId,
        requestKey: input.params.requestKey,
        scope: { hostId: input.hostId, kind: input.kind },
        version,
        observation: {
          basis: 'trusted-renderer-canonical',
          evaluatedAt: { clockId: receiverClock, ms: now },
          pollAfterMs: 5000,
          maxObservationAgeMs: 15000,
          nextExpiryAfterMs: semantic.nextExpiryAfterMs
        }
      },
      rows: semantic.rows,
      reader: selected ?? {
        kind: 'inventory',
        parentRowId: null,
        offset: 0,
        coverageInvalid: false
      },
      mintContinuation: () => 'x'.repeat(4096)
    })
  }
  return {
    readPage,
    read(
      input: AgentPresentationReadInput,
      store: { getState: () => AppState },
      names: StructuredChatTabNames
    ) {
      return readPage(input, store, names).result
    }
  }
}
