import type { AppState } from '@/store/types'
import type { DashboardAgentRow } from '@/components/dashboard/rows/dashboard-agent-row'
import type { PluginAgentPresentationRow } from '../../../../../shared/plugins/workers/plugin-host-api-agent-presentation'
import type { ExecutionHostId } from '../../../../../shared/execution-host/execution-host'
import type { StructuredChatTabNames } from '@/runtime/native-chat/naming/structured-chat-tab-name'
import { sha256 } from '../../../../../shared/hashing/sha256'
import {
  dashboardRowBucketProjection,
  readAgentRowTurnRecords
} from '@/components/dashboard/rows/dashboard-row-bucket'
import { dashboardCardBaseDisplayState } from '../../../../../shared/agent-status/presentation/dashboard-snapshot'
import { dashboardCardParentPaneKey } from '@/components/dashboard/rows/agent-row-lineage'
import { groupSubagentsByParentPaneKey } from '@/components/dashboard/snapshot/dashboard-subagent-cards'
import { rowConversationName, rowTask } from '@/components/dashboard/snapshot/dashboard-card-labels'
import { agentVerdictDisplayMark } from '../../../../../shared/agent-status/lifecycle/agent-main-agent-verdict'
import { agentAttentionTurnAt } from '../../../../../shared/agent-status/lifecycle/agent-attention-turn'
import {
  agentStatusAuthorityObservedAt,
  agentStatusEvidenceObservedAt,
  isAgentStatusFresh,
  AGENT_STATUS_STALE_AFTER_MS
} from '../../../../../shared/agent-status/contracts/agent-status-freshness'
import { parsePaneKey } from '../../../../../shared/workspace-layout/stable-pane-id'
import { isTerminalHandle } from '../../../../../shared/terminal/terminal-handle-prefix'
import { parseOrcaSessionAddress } from '../../../../../shared/agent-session/identity/orca-session-address'
import { readAgentSendersForPane } from '@/runtime/native-chat/agent-senders/agent-sender-index'
import { legacyStructuredChatRenameOwner } from '@/runtime/native-chat/session-ownership/structured-agent-session-owner'

export type AgentPresentationSemanticRow = Omit<PluginAgentPresentationRow, 'childrenContinuation'>
export function agentPresentationDigest(value: unknown): string {
  return Array.from(sha256(new TextEncoder().encode(JSON.stringify(value))), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
}

export function projectAgentPresentationRows(input: {
  state: AppState
  rows: readonly DashboardAgentRow[]
  hostId: ExecutionHostId
  identityEpoch: string
  receiverClock: string
  authorityClock: string
  now: number
  chatNames: StructuredChatTabNames
}): { rows: AgentPresentationSemanticRow[]; nextExpiryAfterMs: number | null } {
  const { state, rows, hostId, identityEpoch, receiverClock, authorityClock, now, chatNames } =
    input
  const opaque = (subject: string) => agentPresentationDigest([identityEpoch, subject])
  const childrenByParent = groupSubagentsByParentPaneKey(rows)
  const turns = readAgentRowTurnRecords(state)
  let nextExpiryAfterMs: number | null = null
  const projected = rows
    .filter((row) => row.rowSource !== 'subagent')
    .map((row): AgentPresentationSemanticRow => {
      const entry = row.entry
      const senders = readAgentSendersForPane(state, hostId, row.tab.worktreeId, row.paneKey)
      const terminalIds = new Set(
        senders?.map((sender) => sender.identity).filter(isTerminalHandle)
      )
      const chatIds = new Set<string>(
        senders?.flatMap((sender) => {
          const id = parseOrcaSessionAddress(sender.identity)
          return id ? [id] : []
        })
      )
      if (senders && entry.terminalHandle && isTerminalHandle(entry.terminalHandle)) {
        terminalIds.add(entry.terminalHandle)
      }
      const terminalId = senders && terminalIds.size === 1 ? [...terminalIds][0] : null
      const live = state.agentStatusByPaneKey.get(row.paneKey)
      const { isTitleDerived, dotState, workingMode, unseen, bucket } =
        dashboardRowBucketProjection(row, turns)
      const structuredTab = state.unifiedTabsByWorktree[row.tab.worktreeId]?.find(
        (tab) =>
          tab.id === row.tab.id &&
          tab.contentType === 'agent-session' &&
          legacyStructuredChatRenameOwner(state, tab) === hostId
      )
      const pane = parsePaneKey(row.activationPaneKey ?? row.paneKey)
      if (senders && structuredTab && entry.orcaSessionId) {
        const id = parseOrcaSessionAddress(entry.orcaSessionId) ?? entry.orcaSessionId
        chatIds.add(id)
      }
      const chatId = senders && chatIds.size === 1 ? [...chatIds][0] : null
      const pty = pane
        ? state.terminalLayoutsByTabId[pane.tabId]?.ptyIdsByLeafId?.[pane.leafId]
        : null
      const hasLivePty = Boolean(pty && (state.ptyIdsByTabId[row.tab.id] ?? []).includes(pty))
      const migration = Boolean(pty && state.migrationUnsupportedByPtyId[pty])
      const synthetic = isTitleDerived && !live && !migration
      const clockId = hostId === 'local' ? receiverClock : authorityClock
      const instant = (ms: number | undefined, clock = clockId) =>
        ms !== undefined && Number.isSafeInteger(ms) && ms > 0 ? { clockId: clock, ms } : null
      const turnAt = live ? agentAttentionTurnAt(live) : 0
      const realTurn = !synthetic && live !== undefined && turnAt > 0
      const ack = state.acknowledgedAgentsByPaneKey[row.paneKey]
      const fresh = live ? isAgentStatusFresh(live, now) : false
      if (live && !live.structuredHostOwned && !live.restoredUnconfirmed) {
        const remaining =
          agentStatusEvidenceObservedAt(live) + AGENT_STATUS_STALE_AFTER_MS + 1 - now
        if (remaining > 0) {
          nextExpiryAfterMs =
            nextExpiryAfterMs === null ? remaining : Math.min(nextExpiryAfterMs, remaining)
        }
      }
      let textTruncated = false
      const text = (value: string | undefined, max: number): string | null => {
        if (!value?.trim()) {
          return null
        }
        textTruncated ||= value.length > max
        return value.slice(0, max)
      }
      const children = (childrenByParent.get(row.paneKey) ?? [])
        .map((child) => ({
          rowId: opaque(child.id),
          name: text(child.name, 512),
          dotState: child.dotState
        }))
        .sort((a, b) => (a.rowId < b.rowId ? -1 : a.rowId > b.rowId ? 1 : 0))
      const parent = dashboardCardParentPaneKey(row)
      const result: AgentPresentationSemanticRow = {
        rowId: opaque(row.paneKey),
        parentRowId: parent ? opaque(parent) : null,
        rowSource: migration
          ? 'migration'
          : synthetic
            ? 'title-derived'
            : structuredTab
              ? 'structured-summary'
              : 'status',
        startedAt: instant(row.startedAt),
        presentation: {
          rowState: row.state,
          dotState,
          baseDisplayState: dashboardCardBaseDisplayState({ dotState, workingMode, unseen }),
          bucket,
          workingMode: workingMode ?? null,
          verdict: agentVerdictDisplayMark(entry),
          reason: synthetic
            ? 'synthetic'
            : entry.restoredUnconfirmed
              ? 'restored'
              : row.state === 'unverifiable'
                ? 'decayed-unverifiable'
                : row.state === 'idle'
                  ? 'decayed-idle'
                  : workingMode
                    ? 'monitoring'
                    : 'canonical'
        },
        attention: {
          unseen,
          basis: realTurn ? 'real-turn' : synthetic ? 'synthetic-no-turn' : 'unknown',
          turnId: realTurn ? opaque(`${row.paneKey}:turn:${turnAt}`) : null,
          turnStartedAt: realTurn ? instant(turnAt) : null,
          acknowledgedTurnStartedAt: realTurn ? instant(ack) : null,
          acknowledged: realTurn && ack !== undefined ? !unseen : null
        },
        evidence: {
          freshness: synthetic
            ? 'unknown'
            : !live || entry.restoredUnconfirmed
              ? 'unverifiable'
              : fresh
                ? 'observed'
                : 'stale',
          reason: synthetic
            ? 'synthetic-no-status'
            : entry.restoredUnconfirmed
              ? 'restored-unconfirmed'
              : !live
                ? 'missing-evidence'
                : entry.structuredHostOwned
                  ? 'structured-owner'
                  : fresh
                    ? 'live-evidence'
                    : 'age-expired',
          authorityObservedAt: live ? instant(agentStatusAuthorityObservedAt(live)) : null,
          replicaFirstReceivedAt: live
            ? instant(live.mirroredEvidenceReceivedAt, receiverClock)
            : null,
          restoredUnconfirmed: live ? live.restoredUnconfirmed === true : null,
          structuredHostOwned: live ? live.structuredHostOwned === true : null,
          hasLivePty: live ? hasLivePty : null
        },
        agent: text(row.agentType, 128),
        title: text(
          rowConversationName(
            row,
            state.settings?.tabAutoGenerateTitle === true,
            state.terminalLayoutsByTabId[row.tab.id],
            state.runtimePaneTitlesByTabId[row.tab.id],
            chatNames,
            state.unifiedTabsByWorktree
          ),
          512
        ),
        task: synthetic ? null : text(rowTask(row), 512),
        prompt: synthetic ? null : text(entry.prompt, 2048),
        lastAssistantMessage: synthetic ? null : text(entry.lastAssistantMessage, 2048),
        pendingQuestion: synthetic ? null : text(entry.interactivePrompt, 2048),
        textTruncated: false,
        totalChildRows: children.length,
        childrenTruncated: false,
        children,
        destinations: {
          terminal: terminalId ? { terminalId } : null,
          chat: structuredTab && chatId ? { orcaSessionId: chatId } : null
        }
      }
      result.textTruncated = textTruncated
      return result
    })
    .sort((a, b) => (a.rowId < b.rowId ? -1 : a.rowId > b.rowId ? 1 : 0))
  return { rows: projected, nextExpiryAfterMs }
}
