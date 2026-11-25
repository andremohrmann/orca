import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { createHostTwinFixture } from '@/store/workspaces/host-isolation/host-twin.test-fixture'
import { registerAgentStatusIpcBridge } from '@/hooks/ipc-events/agent-status/agent-status-ipc-bridge'
import { awaitAgentStatusStartupSnapshot } from '@/hooks/ipc-events/agent-status/agent-status-startup-snapshot'
import { readPluginAgentPresentation } from './plugin-agent-presentation'
import type { PluginViewRequest } from '../../../../../shared/plugins/view/plugin-view-protocol'

const original = useAppStore.getState()
const releases: (() => void)[] = []
afterEach(() => {
  for (const release of releases.splice(0).toReversed()) {
    release()
  }
  useAppStore.setState(original, true)
  vi.unstubAllGlobals()
})

it('requires a successful bootstrap and can prove an empty canonical scope without any agent or acknowledgement event', async () => {
  const { store, workspaceKey } = createHostTwinFixture('local+ssh')
  const fixture = store.getState()
  useAppStore.setState({
    repos: fixture.repos,
    worktreesByRepo: fixture.worktreesByRepo,
    tabsByWorktree: {},
    unifiedTabsByWorktree: {},
    ptyIdsByTabId: {},
    terminalLayoutsByTabId: {},
    workspaceSessionReady: true,
    persistedUIReady: true,
    hydrationSucceeded: true
  })
  let rejectSnapshot = true
  let statusReply: (() => Promise<unknown>) | null = null
  vi.stubGlobal('window', {
    api: {
      agentStatus: {
        onSet: () => () => {},
        getSnapshot: async () => {
          if (rejectSnapshot) {
            throw new Error('fixture startup snapshot unavailable')
          }
          return []
        }
      },
      runtime: {
        call: async (input: { method: string }) => {
          if (input.method === 'status.get') {
            if (statusReply) {
              return statusReply()
            }
            return {
              id: 'status',
              ok: true,
              result: { runtimeId: 'bootstrap-runtime' },
              _meta: { runtimeId: 'bootstrap-runtime' }
            }
          }
          if (input.method === 'session.tabs.listAll') {
            return {
              id: 'inventory',
              ok: true,
              result: { snapshots: [], authoritative: true },
              _meta: { runtimeId: 'bootstrap-runtime' }
            }
          }
          throw new Error('Unexpected bootstrap RPC')
        }
      }
    }
  })
  const connect = () => {
    const unsubs: (() => void)[] = []
    const bridge = registerAgentStatusIpcBridge(unsubs)
    const release = () => {
      bridge.disposeAsyncState()
      bridge.unsubscribeStore()
      for (const stop of unsubs) {
        stop()
      }
    }
    releases.push(release)
    return release
  }
  let disconnect = connect()
  await awaitAgentStatusStartupSnapshot()
  const request: Extract<PluginViewRequest, { kind: 'read-agent-presentation' }> = {
    kind: 'read-agent-presentation',
    requestId: 'bootstrap',
    worktreeId: workspaceKey,
    executionHostId: 'local',
    params: { projectionVersion: 1, workspaceId: workspaceKey, requestKey: 'empty' },
    selection: null
  }
  expect(await readPluginAgentPresentation(request)).toMatchObject({
    ok: true,
    agentPresentation: { status: 'unavailable', reason: 'producer-not-ready', rows: [] }
  })
  disconnect()
  rejectSnapshot = false
  disconnect = connect()
  await awaitAgentStatusStartupSnapshot()
  expect(await readPluginAgentPresentation(request)).toMatchObject({
    ok: true,
    agentPresentation: {
      status: 'complete',
      totalRows: 0,
      rows: [],
      page: { kind: 'inventory', offset: 0, complete: true, next: null }
    }
  })
  let resume: (value: unknown) => void = () => {}
  let entered: () => void = () => {}
  const waiting = new Promise<void>((resolve) => {
    entered = resolve
  })
  statusReply = () => {
    entered()
    return new Promise((resolve) => {
      resume = resolve
    })
  }
  const pending = readPluginAgentPresentation(request)
  await waiting
  useAppStore.setState({ workspaceSessionReady: false, hydrationSucceeded: false })
  resume({
    id: 'status',
    ok: true,
    result: { runtimeId: 'bootstrap-runtime' },
    _meta: { runtimeId: 'bootstrap-runtime' }
  })
  expect(await pending).toMatchObject({
    ok: true,
    agentPresentation: { status: 'unavailable', reason: 'scope-unhydrated', rows: [] }
  })
  disconnect()
})
