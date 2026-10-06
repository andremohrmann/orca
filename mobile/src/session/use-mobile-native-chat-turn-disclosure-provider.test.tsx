import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  AgentJournalItemBody,
  AgentJournalRenderItem,
  AgentJournalTurnScope
} from '../../../src/shared/agent-session-journal-types'
import type { NativeChatMessage } from '../../../src/shared/native-chat-types'
import type { NativeChatTurnJournal } from '../../../src/shared/native-chat-turn-membership'
import type { NativeChatSettledTurns } from '../../../src/shared/native-chat-turn-status'
import { useMobileNativeChatTurnDisclosure } from './use-mobile-native-chat-turn-disclosure'

function userMessage(id: string): NativeChatMessage {
  return {
    id,
    role: 'user',
    blocks: [{ type: 'text', text: id }],
    timestamp: null,
    source: 'transcript'
  }
}

function Harness({
  messages,
  settledTurns,
  turnJournal,
  workingStartedAt
}: {
  messages: readonly NativeChatMessage[]
  settledTurns?: NativeChatSettledTurns
  turnJournal?: NativeChatTurnJournal
  workingStartedAt?: number | null
}): React.JSX.Element {
  const disclosure = useMobileNativeChatTurnDisclosure({
    messages,
    enabled: true,
    isWorking: true,
    settledTurns,
    turnJournal,
    workingStartedAt,
    scopeKey: 'host\0worktree\0tab-a'
  })
  return createElement('result', { disclosure })
}

describe('provider-opened mobile native-chat turn disclosure', () => {
  let renderer: ReactTestRenderer | null = null

  afterEach(() => {
    act(() => renderer?.unmount())
    renderer = null
  })

  it('keeps a turn the provider opened live while it runs, and the turn before it settled', () => {
    let sequence = 0
    const entry = (
      itemId: string,
      body: AgentJournalItemBody,
      turnScope: AgentJournalTurnScope = { kind: 'thread' }
    ): AgentJournalRenderItem => {
      sequence += 1
      return { itemId, revision: 0, sequence, observedAt: sequence, body, turnScope }
    }
    const said = (itemId: string, turnItemId: string) =>
      entry(
        itemId,
        { kind: 'message', role: 'assistant', blocks: [{ type: 'text', text: itemId }] },
        { kind: 'turn', turnItemId }
      )
    const items = [
      entry('u1', { kind: 'message', role: 'user', blocks: [{ type: 'text', text: 'go' }] }),
      entry('t1', { kind: 'turn', turnId: 't1', state: 'completed', userItemId: 'u1' }),
      said('a1', 't1'),
      entry('wake', { kind: 'turn', turnId: 'wake', state: 'running', userItemId: 'claude:wake' }),
      said('wake-note', 'wake')
    ]
    const messages: NativeChatMessage[] = ['u1', 'a1', 'wake-note'].map((id, index) => ({
      ...userMessage(id),
      role: index === 0 ? 'user' : 'assistant'
    }))
    act(() => {
      renderer = create(
        createElement(Harness, {
          messages,
          settledTurns: new Map([['u1', { startedAt: 500, workedSeconds: 4 }]]),
          turnJournal: { items, submissions: [] }
        })
      )
    })
    const disclosure = renderer!.root.findByType('result').props.disclosure
    const rows = messages.map((message, index) => disclosure.resolveRow(index, message))
    expect(rows.map((row) => row.activeTurnIsWorking)).toEqual([false, false, true])
    expect(rows[0].turnStatus?.workedSeconds).toBe(4)
  })

  it('draws the live bar on a turn whose record and opening message are not loaded', () => {
    const items: AgentJournalRenderItem[] = ['a300', 'a301'].map((itemId, index) => ({
      itemId,
      revision: 0,
      sequence: 300 + index,
      observedAt: 300 + index,
      body: { kind: 'message', role: 'assistant', blocks: [{ type: 'text', text: itemId }] },
      turnScope: { kind: 'turn', turnItemId: 'turn-record' }
    }))
    const messages: NativeChatMessage[] = items.map((item) => ({
      ...userMessage(item.itemId),
      role: 'assistant'
    }))
    const rowsWith = (latestTurn: NativeChatTurnJournal['latestTurn']) => {
      act(() => {
        renderer = create(
          createElement(Harness, {
            messages,
            workingStartedAt: 1_000,
            turnJournal: { items, submissions: [], latestTurn }
          })
        )
      })
      const disclosure = renderer!.root.findByType('result').props.disclosure
      const rows = messages.map((message, index) => disclosure.resolveRow(index, message))
      act(() => renderer?.unmount())
      return rows
    }

    const hosted = rowsWith({
      itemId: 'turn-record',
      observedAt: 1,
      turn: { turnId: 'turn-1', state: 'running', startedAt: 1_000, userItemId: 'user-1' }
    })
    expect(hosted[0]?.turnStatus).toMatchObject({ startedAt: 1_000 })
    expect(hosted.map((row) => row.activeTurnIsWorking)).toEqual([true, true])
    expect(rowsWith(undefined).map((row) => row.turnStatus)).toEqual([null, null])
  })
})
