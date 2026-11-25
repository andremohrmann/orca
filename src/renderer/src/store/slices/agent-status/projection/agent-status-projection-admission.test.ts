import { createAgentPresentationReader } from '@/components/plugins/view/plugin-agent-presentation-reader'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHostTwinFixture } from '@/store/workspaces/host-isolation/host-twin.test-fixture'
import { makeStructuredChatTab } from '@/store/slices/tabs/tab-group.test-fixture'
import { createWorktreeAgentRowsSelector } from '@/components/sidebar/workspace-card/activity/worktree-agent-rows-projection'
import { projectStatus } from '@/components/native-chat/session/status/structured-agent-session-status-projection'
import { isStructuredTab } from '../../../../../../shared/agent-session/view/structured-agent-session-tab'
import { acceptedAgentStatuses } from '../status-ownership/accepted-agent-statuses'
import { createFreshnessScheduler } from '../status-ownership/agent-status-freshness-scheduler'
import type { AgentStatusEntry } from '../../../../../../shared/agent-status/contracts/agent-status-types'

const NOW = 2_000_000

afterEach(() => vi.useRealTimers())

function admittedTwin(kind: Parameters<typeof createHostTwinFixture>[0]) {
  const fixture = createHostTwinFixture(kind)
  const leaf = '11111111-1111-4111-8111-111111111111'
  for (const side of [fixture.local, fixture.remote]) {
    side.paneKey = `${side.terminalTabId}:${leaf}`
  }
  fixture.store.setState({
    terminalLayoutsByTabId: Object.fromEntries(
      [fixture.local, fixture.remote].map((side) => [
        side.terminalTabId,
        {
          root: { type: 'leaf' as const, leafId: leaf },
          activeLeafId: leaf,
          expandedLeafId: null,
          ptyIdsByLeafId: { [leaf]: side.ptyId }
        }
      ])
    )
  })
  return fixture
}

function working(
  paneKey: string,
  worktreeId: string,
  connectionId: string | null
): AgentStatusEntry {
  return {
    paneKey,
    worktreeId,
    connectionId,
    state: 'working',
    agentType: 'claude',
    prompt: 'Inspect the workspace',
    updatedAt: NOW,
    stateStartedAt: NOW,
    stateHistory: []
  }
}

describe('canonical admission before qualified selection', () => {
  it.each(['local+ssh', 'local+runtime', 'folder local+ssh'] as const)(
    'retains both raw-ID twins and selects only their actual owner: %s',
    (kind) => {
      vi.useFakeTimers()
      vi.setSystemTime(NOW)
      const { store, workspaceKey, local, remote } = admittedTwin(kind)
      store.setState((state) => ({
        agentStatusByPaneKey: state.agentStatusByPaneKey.replace([
          [local.paneKey, working(local.paneKey, workspaceKey, null)],
          [
            remote.paneKey,
            working(remote.paneKey, workspaceKey, kind === 'local+runtime' ? null : 'conn-b')
          ]
        ])
      }))
      expect(
        store
          .getState()
          .agentStatusByPaneKey.projection.list(workspaceKey)
          .map((row) => row.tab.id)
          .sort()
      ).toEqual(['tab-local', 'tab-remote'])
      expect(
        createWorktreeAgentRowsSelector(
          workspaceKey,
          'local'
        )(store.getState()).map((row) => row.tab.id)
      ).toEqual(['tab-local'])
      expect(
        createWorktreeAgentRowsSelector(
          workspaceKey,
          remote.hostId
        )(store.getState()).map((row) => row.tab.id)
      ).toEqual(['tab-remote'])
    }
  )

  it('admits a real projected structured summary without a terminal tab or PTY', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const { store, workspaceKey } = admittedTwin('local+ssh')
    const tab = makeStructuredChatTab({
      id: 'summary-chat',
      entityId: 'summary-session',
      worktreeId: workspaceKey,
      executionHostId: 'local',
      agentSessionAgent: 'codex'
    })
    if (!isStructuredTab(tab)) {
      throw new Error('Invalid structured fixture')
    }
    store.setState({
      tabsByWorktree: {},
      ptyIdsByTabId: {},
      terminalLayoutsByTabId: {},
      unifiedTabsByWorktree: { [workspaceKey]: [tab] }
    })
    store.getState().transactAgentStatuses((transaction) =>
      projectStatus(
        transaction,
        tab,
        {
          sessionId: 'summary-session',
          workspaceId: workspaceKey,
          agent: 'codex',
          status: 'working',
          latestPrompt: 'Inspect without a shell',
          updatedAt: NOW,
          hostExecutionOwned: true
        },
        'live',
        null
      )
    )
    expect(
      store
        .getState()
        .agentStatusByPaneKey.projection.list(workspaceKey)
        .map((row) => [row.tab.id, row.state])
    ).toEqual([['summary-chat', 'working']])
    expect(
      createWorktreeAgentRowsSelector(
        workspaceKey,
        'local'
      )(store.getState()).map((row) => row.tab.id)
    ).toEqual(['summary-chat'])
    expect(createWorktreeAgentRowsSelector(workspaceKey, 'ssh:conn-b')(store.getState())).toEqual(
      []
    )
  })
})

it.each(['initial', 'armed', 'rebuilt'] as const)(
  'settles a cached live row after expiry before read: %s',
  (mode) => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const { store, workspaceKey, local } = admittedTwin('local+ssh')
    store.setState((state) => ({
      agentStatusByPaneKey: state.agentStatusByPaneKey.replace([
        [local.paneKey, working(local.paneKey, workspaceKey, null)]
      ])
    }))
    const select = createWorktreeAgentRowsSelector(workspaceKey, 'local')
    expect(select(store.getState()).map((row) => row.state)).toEqual(['working'])
    let source =
      mode === 'rebuilt' ? acceptedAgentStatuses() : store.getState().agentStatusByPaneKey
    const scheduler = createFreshnessScheduler({
      getStatusEntries: () => source,
      bumpEpochs: (keys) =>
        store.setState((state) => ({
          agentStatusByPaneKey: state.agentStatusByPaneKey.refresh(
            keys ?? [...state.agentStatusByPaneKey.keys()]
          ),
          agentStatusEpoch: state.agentStatusEpoch + 1,
          sortEpoch: state.sortEpoch + 1
        }))
    })
    try {
      if (mode !== 'initial') {
        scheduler.schedule()
      }
      // A suspended event loop advances the clock without running the queued expiry callback.
      vi.setSystemTime(3_800_001)
      source = store.getState().agentStatusByPaneKey
      scheduler.schedule()
      expect(select(store.getState()).map((row) => row.state)).toEqual(['unverifiable'])
    } finally {
      scheduler.dispose()
    }
  }
)

it('enumerates 101 actual structured summaries under one canonical revision and rejects a changed continuation', () => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  const { store, workspaceKey } = admittedTwin('local+ssh')
  const tabs = Array.from({ length: 101 }, (_, index) =>
    makeStructuredChatTab({
      id: `chat-${index}`,
      entityId: `session-${index}`,
      worktreeId: workspaceKey,
      executionHostId: 'local',
      agentSessionAgent: 'codex'
    })
  )
  store.setState({
    tabsByWorktree: {},
    ptyIdsByTabId: {},
    terminalLayoutsByTabId: {},
    unifiedTabsByWorktree: { [workspaceKey]: tabs }
  })
  store.getState().transactAgentStatuses((transaction) => {
    for (const tab of tabs) {
      if (!isStructuredTab(tab)) {
        throw new Error('Invalid structured fixture')
      }
      projectStatus(
        transaction,
        tab,
        {
          sessionId: tab.entityId,
          workspaceId: workspaceKey,
          agent: 'codex',
          status: 'working',
          latestPrompt: `Task ${tab.id}`,
          updatedAt: NOW,
          hostExecutionOwned: true
        },
        'live',
        null
      )
    }
  })
  const reader = createAgentPresentationReader()
  const input = {
    params: { projectionVersion: 1 as const, workspaceId: workspaceKey, requestKey: 'first' },
    worktreeId: workspaceKey,
    hostId: 'local' as const,
    kind: 'worktree' as const,
    ownerEpoch: 'owner-1',
    selection: null
  }
  const first = reader.read(input, store, new Map())
  expect(first.status).toBe('partial')
  expect(first.totalRows).toBe(101)
  expect(first.rows).toHaveLength(100)
  if (!first.version) {
    throw new Error('Missing proven version')
  }
  const selection = {
    version: first.version,
    kind: 'inventory' as const,
    parentRowId: null,
    offset: 100,
    coverageInvalid: false
  }
  const last = reader.read({ ...input, selection }, store, new Map())
  expect(last.status).toBe('complete')
  expect(last.rows).toHaveLength(1)
  expect(last.page?.next).toBeNull()
  expect(new Set([...first.rows, ...last.rows].map((row) => row.rowId)).size).toBe(101)
  expect([...first.rows, ...last.rows].some((row) => row.prompt === 'Task chat-100')).toBe(true)
  store.setState((state) => ({
    acknowledgedAgentsByPaneKey: Object.fromEntries(
      [...state.agentStatusByPaneKey.keys()].map((key) => [key, NOW])
    )
  }))
  expect(reader.read({ ...input, selection }, store, new Map())).toMatchObject({
    status: 'unavailable',
    reason: 'continuation-invalidated',
    rows: []
  })
  expect(reader.read(input, store, new Map())).toMatchObject({ status: 'partial', totalRows: 101 })
})

it('enumerates all 21 attached canonical children independently of the parent inventory', () => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  const { store, workspaceKey, local } = admittedTwin('local+ssh')
  store.setState((state) => ({
    agentStatusByPaneKey: state.agentStatusByPaneKey.replace([
      [
        local.paneKey,
        {
          ...working(local.paneKey, workspaceKey, null),
          subagents: Array.from({ length: 21 }, (_, index) => ({
            id: `child-${index}`,
            description: `Child ${index}`,
            state: 'working' as const,
            startedAt: NOW
          }))
        }
      ]
    ])
  }))
  const reader = createAgentPresentationReader()
  const input = {
    params: { projectionVersion: 1 as const, workspaceId: workspaceKey, requestKey: 'parent' },
    worktreeId: workspaceKey,
    hostId: 'local' as const,
    kind: 'worktree' as const,
    ownerEpoch: 'owner-1',
    selection: null
  }
  const parent = reader.read(input, store, new Map())
  expect(parent.status).toBe('complete')
  expect(parent.totalRows).toBe(1)
  expect(parent.rows[0]?.totalChildRows).toBe(21)
  expect(parent.rows[0]?.childrenTruncated).toBe(true)
  expect(parent.rows[0]?.children).toHaveLength(20)
  if (!parent.version || !parent.rows[0]) {
    throw new Error('Missing canonical parent')
  }
  const childPage = reader.read(
    {
      ...input,
      selection: {
        version: parent.version,
        kind: 'children',
        parentRowId: parent.rows[0].rowId,
        offset: 20,
        coverageInvalid: false
      }
    },
    store,
    new Map()
  )
  expect(childPage.status).toBe('complete')
  expect(childPage.rows[0]?.children).toHaveLength(1)
  expect(childPage.rows[0]?.childrenTruncated).toBe(false)
  expect(
    new Set(
      [...parent.rows[0].children, ...(childPage.rows[0]?.children ?? [])].map((row) => row.rowId)
    ).size
  ).toBe(21)
})
