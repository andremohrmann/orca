import { createCanonicalPresentationFixture } from '@/components/plugins/view/plugin-agent-presentation.test-fixture'
import { afterEach, expect, it, vi } from 'vitest'
import { PluginService } from '../../../src/main/plugins/plugin-service'
import {
  createInstalledPlugin,
  cleanupInstalledPluginFixtures
} from '../../../src/main/plugins/testing/plugin-installed.test-fixture'
import { fingerprintPluginConsent } from '../../../src/shared/plugins/approval/plugin-consent-fingerprint'
import { setPluginHostRendererRequest } from '../../../src/main/plugins/view/plugin-host-renderer-actions'
import { pluginAgentPresentationResultSchema } from '../../../src/shared/plugins/workers/plugin-host-api-agent-presentation'
import { createAgentPresentationReader } from '@/components/plugins/view/plugin-agent-presentation-reader'

const services: PluginService[] = []
afterEach(async () => {
  setPluginHostRendererRequest(null)
  for (const service of services.splice(0)) {
    await service.dispose()
  }
  await cleanupInstalledPluginFixtures()
})

it('delivers real canonical pages through worker admission and refuses cursors and pending replies after rapid same-byte grant cycling', async () => {
  const { store, workspaceKey, now } = createCanonicalPresentationFixture()
  const reader = createAgentPresentationReader()
  let corruptPage = false
  let hold: Promise<void> | null = null
  let reached: (() => void) | undefined
  setPluginHostRendererRequest(async (request) => {
    if (request.kind !== 'read-agent-presentation') {
      throw new Error('Unexpected renderer operation')
    }
    const page = reader.readPage(
      {
        params: request.params,
        worktreeId: request.worktreeId,
        hostId: 'local',
        kind: 'worktree',
        ownerEpoch: 'fixture-live-owner',
        selection: request.selection
      },
      store,
      new Map()
    )
    reached?.()
    if (hold) {
      await hold
    }
    return {
      requestId: 'fixture-transport',
      ok: true,
      agentPresentation: page.result,
      agentPresentationPage: {
        consumed: page.consumed,
        nextReader:
          corruptPage && page.nextReader
            ? { ...page.nextReader, offset: page.nextReader.offset + 1 }
            : page.nextReader,
        childReaders: page.childReaders
      }
    }
  })
  const installed = await createInstalledPlugin({ worker: true, summary: true })
  let disabled: string[] = []
  const consent = fingerprintPluginConsent(installed.manifest, installed.contentHash)
  const service = new PluginService({
    userDataPath: installed.userDataPath,
    hostVersion: '1.4.270',
    isPluginSystemEnabled: () => true,
    getDisabledPlugins: () => disabled,
    getPluginConsents: () => ({ [installed.pluginKey]: consent }),
    getDevPluginPaths: () => []
  })
  services.push(service)
  const unexpected = (): never => {
    throw new Error('Unexpected runtime operation')
  }
  service.setRuntimeDelegate({
    resolveActiveWorktreeContext: unexpected,
    listTerminals: unexpected,
    sendTerminal: unexpected,
    dispatchPluginNotification: unexpected,
    callRuntime: async (method) => {
      if (method !== 'worktree.show') {
        throw new Error('Unexpected runtime RPC')
      }
      return { worktree: { id: workspaceKey, hostId: 'local' } }
    }
  })
  await service.initialize()
  const call = async (continuation?: string) => {
    const result = await service.executeHostCall(
      installed.pluginKey,
      'agents.presentation',
      {
        projectionVersion: 1,
        workspaceId: workspaceKey,
        requestKey: 'integration',
        ...(continuation ? { continuation } : {})
      },
      'worker'
    )
    if (!result.ok) {
      throw new Error(`${result.code}: ${result.error}`)
    }
    return pluginAgentPresentationResultSchema.parse(result.value)
  }
  const first = await call()
  expect(first.status).toBe('partial')
  expect(first.totalRows).toBe(101)
  expect(first.rows).toHaveLength(100)
  expect(first.rows[0]?.evidence.freshness).toBe('observed')
  expect(first.rows[0]?.startedAt?.ms).toBe(now)
  const token = first.page?.next
  if (!token) {
    throw new Error('No authenticated continuation')
  }
  expect(await call(`${token}x`)).toMatchObject({
    status: 'unavailable',
    reason: 'continuation-invalidated',
    rows: []
  })
  const last = await call(token)
  expect(last.status).toBe('complete')
  expect(last.rows).toHaveLength(1)
  expect(new Set([...first.rows, ...last.rows].map((row) => row.rowId)).size).toBe(101)
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 120_001)
  try {
    expect(await call(token)).toMatchObject({
      status: 'unavailable',
      reason: 'continuation-invalidated',
      rows: []
    })
  } finally {
    clock.mockRestore()
  }
  corruptPage = true
  expect(await call()).toMatchObject({
    status: 'unavailable',
    reason: 'malformed-projection',
    rows: []
  })
  corruptPage = false
  const live = store.getState().agentStatusByPaneKey.values().next().value
  if (!live) {
    throw new Error('Missing live parent')
  }
  store.setState((state) => ({
    agentStatusByPaneKey: state.agentStatusByPaneKey.replace([
      [
        live.paneKey,
        {
          ...live,
          subagents: Array.from({ length: 21 }, (_, index) => ({
            id: `worker-child-${index}`,
            description: `Worker child ${index}`,
            state: 'working' as const,
            startedAt: now
          }))
        }
      ]
    ])
  }))
  const withChildren = await call()
  const cycleToken = withChildren.page?.next
  if (!cycleToken) {
    throw new Error('Missing current inventory continuation')
  }
  const childrenLastInventory = await call(cycleToken)
  const parent = [...withChildren.rows, ...childrenLastInventory.rows].find(
    (row) => row.totalChildRows === 21
  )
  if (!parent?.childrenContinuation) {
    throw new Error('Missing canonical child entry')
  }
  const childrenFirst = await call(parent.childrenContinuation)
  expect(childrenFirst.page).toMatchObject({ kind: 'children', offset: 0, complete: false })
  expect(childrenFirst.rows[0]?.children).toHaveLength(20)
  if (!childrenFirst.page?.next) {
    throw new Error('Missing child continuation')
  }
  const childrenLast = await call(childrenFirst.page.next)
  expect(childrenLast.status).toBe('complete')
  expect(childrenLast.rows[0]?.children).toHaveLength(1)
  expect(
    new Set(
      [...childrenFirst.rows[0]!.children, ...childrenLast.rows[0]!.children].map(
        (row) => row.rowId
      )
    ).size
  ).toBe(21)
  let release = (): void => {}
  hold = new Promise<void>((resolve) => {
    release = resolve
  })
  const entered = new Promise<void>((resolve) => {
    reached = resolve
  })
  const pending = service.executeHostCall(
    installed.pluginKey,
    'agents.presentation',
    {
      projectionVersion: 1,
      workspaceId: workspaceKey,
      requestKey: 'pending'
    },
    'worker'
  )
  await entered
  disabled = [installed.pluginKey]
  const off = service.refresh()
  disabled = []
  const on = service.refresh()
  hold = null
  release()
  expect(await pending).toMatchObject({ ok: false, code: 'consent_required' })
  await off
  await on
  expect(await call(cycleToken)).toMatchObject({
    status: 'unavailable',
    reason: 'continuation-invalidated',
    rows: []
  })
  expect(await call()).toMatchObject({ status: 'partial', totalRows: 101 })
})
