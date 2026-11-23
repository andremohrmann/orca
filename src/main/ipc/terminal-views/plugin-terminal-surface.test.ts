import { resolveTerminalSurfaceWhenAvailable } from '../../../shared/plugins/frames/plugin-terminal-surface-admission'
import type {
  PluginTerminalSurfaceApi,
  PluginTerminalSurfaceTarget
} from '../../../shared/plugins/frames/plugin-terminal-surface'
import { EventEmitter } from 'node:events'
import type {
  TerminalPreviewConnectResult,
  TerminalPreviewSnapshot
} from '../../../shared/terminal/replay/terminal-preview'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../runtime/orca-runtime'
import type { PluginService } from '../../plugins/plugin-service'
import { PluginPanelSessions } from '../../plugins/panels/panel-lifetime/plugin-panel-sessions'
import {
  bindTerminalSurfacePlugins,
  registerPluginTerminalSurfaceHandlers
} from './plugin-terminal-surface'

const handlers = vi.hoisted(() => new Map<string, (event: unknown, args: unknown) => unknown>())
vi.mock('./plugin-terminal-surface-remote-owner', () => ({
  resolvePluginRemoteTerminalOwner: async () => null
}))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, handler: (event: unknown, args: unknown) => unknown) =>
      handlers.set(name, handler),
    removeHandler: (name: string) => handlers.delete(name)
  }
}))
vi.mock('../ui', () => ({ isTrustedUIRenderer: (sender: { id: number }) => sender.id < 100 }))
vi.mock('../../plugins/windows/plugin-window-service', () => ({
  isPluginPopoutRenderer: () => false
}))
vi.mock('../plugins/plugin-frame-entry-ipc', () => ({
  rendererPanelOwner: (id: number) => `renderer:${id}`
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

class Contents extends EventEmitter {
  failSend = false
  readonly messages: {
    channel: string
    payload: Partial<{ type: string; bytes: number; id: string }>
  }[] = []
  constructor(readonly id: number) {
    super()
  }
  isDestroyed(): boolean {
    return false
  }
  send(channel: string, payload: unknown): void {
    if (this.failSend) {
      throw new Error('renderer gone')
    }
    this.emit(channel, payload)
    this.messages.push({
      channel,
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only real terminal-surface payloads reach this fixture; tests inspect these optional fields.
      payload: payload as Partial<{ type: string; bytes: number; id: string }>
    })
  }
}

function fixture() {
  const contents = new Contents(1)
  const changed = new Set<() => void>()
  const closed = new Set<() => void>()
  const sessions = new PluginPanelSessions(() => {
    for (const listener of closed) {
      listener()
    }
  })
  const token = sessions.issue('renderer:1', {
    pluginKey: 'local:terminal',
    surface: 'panel',
    contributionId: 'view',
    rootDir: '/plugin',
    manifestRevision: 'approved-v1'
  })
  let capabilities = ['terminal:read', 'terminal:send']
  let approved = true
  let ptyId = 'pty-a'
  let hostPlatform: NodeJS.Platform | undefined = 'linux'
  let rawViews = 0
  let profileKey = 'profile-v1'
  const profileListeners = new Set<() => void>()
  let input = ''
  const data = new Set<(chunk: string) => void>()
  const resize = new Set<() => void>()
  const geometry = new Set<string>()
  const snapshots: ReturnType<typeof deferred<TerminalPreviewSnapshot | null>>[] = []
  const fits: ReturnType<typeof deferred<boolean>>[] = []
  const runtime = {
    describePluginTerminalSurface: () => ({
      profileKey,
      input: {
        hostPlatform: 'linux',
        localWindowsConpty: false,
        windowsShiftEnterEncoding: 'alt-enter',
        ctrlEnterCsiU: false,
        kittyKeyboardAdvertised: true
      }
    }),
    onAgentListChanged: (listener: () => void) => {
      profileListeners.add(listener)
      return () => {
        profileListeners.delete(listener)
      }
    },
    resolvePluginTerminalSurface: (handle: string) =>
      handle === 'stable-handle'
        ? { ptyId, worktreeId: 'workspace', paneKey: 'tab:leaf', launchAgent: null }
        : null,
    getPtyExecutionHostMetadata: () => ({ hostPlatform }),
    registerRawTerminalViewSubscriber: () => {
      rawViews++
      return () => {
        rawViews--
      }
    },
    subscribeToTerminalData: (_pty: string, listener: (chunk: string) => void) => {
      data.add(listener)
      return () => {
        data.delete(listener)
      }
    },
    subscribeToTerminalResize: (_pty: string, listener: () => void) => {
      resize.add(listener)
      return () => {
        resize.delete(listener)
      }
    },
    serializeTerminalBuffer: () => {
      const pending = deferred<TerminalPreviewSnapshot | null>()
      snapshots.push(pending)
      return pending.promise
    },
    writeTerminalPreviewInput: async (_pty: string, value: string) => {
      input += value
      return true
    },
    updateRemoteDesktopViewer: async (_pty: string, key: string) => {
      const pending = deferred<boolean>()
      fits.push(pending)
      const applied = await pending.promise
      if (applied) {
        geometry.add(key)
      }
      return applied
    },
    unregisterRemoteDesktopViewer: async (_pty: string, key: string) => {
      geometry.delete(key)
    },
    getTerminalSize: () => ({ cols: 80, rows: 24 })
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the fixture implements every approval and panel-session member used by lease admission.
  bindTerminalSurfacePlugins({
    panels: {
      onSessionClosed: (listener: () => void) => {
        closed.add(listener)
        return () => {
          closed.delete(listener)
        }
      },
      sessionCaller: (owner: string, value: string) => approved && sessions.resolve(owner, value)
    },
    getGrantedCapabilities: () => (approved ? capabilities : null),
    onChanged: (listener: () => void) => {
      changed.add(listener)
      return () => {
        changed.delete(listener)
      }
    }
  } as unknown as PluginService)
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the fixture implements the real handlers' terminal, lifecycle, stream and geometry operations.
  registerPluginTerminalSurfaceHandlers(runtime as unknown as OrcaRuntimeService)
  const call = <T = Promise<TerminalPreviewConnectResult>>(
    operation: string,
    args: unknown,
    sender = contents
  ) => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: callers pair the registered real IPC operation with its corresponding contract result type.
    return handlers.get(`pluginTerminalSurface:${operation}`)!({ sender }, args) as T
  }
  const resolve = () =>
    call<PluginTerminalSurfaceTarget>('resolve', {
      sessionToken: token,
      terminalId: 'stable-handle'
    })
  const notify = () => {
    for (const listener of changed) {
      listener()
    }
  }
  return {
    changeProfile: () => {
      profileKey = 'profile-v2'
      for (const listener of profileListeners) {
        listener()
      }
    },
    profileListeners: () => profileListeners.size,
    contents,
    sessions,
    token,
    snapshots,
    fits,
    geometry,
    data,
    resize,
    call,
    resolve,
    resources: () => [
      rawViews,
      data.size,
      resize.size,
      geometry.size,
      contents.eventNames().length
    ],
    input: () => input,
    revoke: () => {
      sessions.revoke('renderer:1', token)
    },
    setCapabilities: (next: string[]) => {
      capabilities = next
      notify()
    },
    loseApproval: () => {
      approved = false
      notify()
    },
    setHostPlatform: (platform: NodeJS.Platform | undefined) => {
      hostPlatform = platform
    },
    replacePty: () => {
      ptyId = 'pty-b'
    }
  }
}

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup()
  }
})
function setup() {
  const context = fixture()
  cleanups.push(() => context.contents.emit('destroyed'))
  return context
}
const snapshot = { data: 'ready', cols: 80, rows: 24, seq: 0 }

describe('plugin terminal lease resource invariants', () => {
  it('retires the old keyboard contract on a host profile event and admits a fresh bounded lease', async () => {
    const f = setup()
    const old = f.resolve()
    const connected = f.call('connect', { id: old.id })
    f.snapshots[0]!.resolve(snapshot)
    await connected
    expect(f.profileListeners()).toBe(1)
    f.changeProfile()
    expect(f.profileListeners()).toBe(0)
    expect(f.resources()).toEqual([0, 0, 0, 0, 0])
    expect(f.contents.messages.at(-1)?.payload).toEqual({ id: old.id, reason: 'profile_changed' })
    expect(await f.call('input', { id: old.id, data: 'stale' })).toBe(false)
    const fresh = f.resolve()
    expect(fresh.id).not.toBe(old.id)
    expect(f.profileListeners()).toBe(1)
    f.call('dispose', { id: fresh.id })
    expect(f.profileListeners()).toBe(0)
  })

  it('admits a new twelve-card page after delayed old leases release, with cancellation cleanup', async () => {
    const f = setup()
    f.contents.setMaxListeners(0)
    const old = Array.from({ length: 12 }, () => f.resolve())
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: capacity admission calls only resolve, dispose and onAvailable, all implemented below.
    const transport = {
      resolve: async () => f.resolve(),
      dispose: async (id: string) => {
        f.call('dispose', { id })
      },
      onAvailable: (callback: () => void) => {
        f.contents.on('pluginTerminalSurface:available', callback)
        return () => {
          f.contents.removeListener('pluginTerminalSurface:available', callback)
        }
      }
    } as unknown as PluginTerminalSurfaceApi
    const page = Array.from({ length: 12 }, () =>
      resolveTerminalSurfaceWhenAvailable(
        transport,
        f.token,
        'stable-handle',
        new AbortController().signal
      )
    )
    await Promise.resolve()
    await Promise.resolve()
    for (const lease of old) {
      f.call('dispose', { id: lease.id })
    }
    const ready = await Promise.all(page)
    expect(ready.filter(Boolean)).toHaveLength(12)
    expect(f.contents.listenerCount('pluginTerminalSurface:available')).toBe(0)
    const spares = Array.from({ length: 4 }, () => f.resolve())
    const canceled = new AbortController()
    const waiting = resolveTerminalSurfaceWhenAvailable(
      transport,
      f.token,
      'stable-handle',
      canceled.signal
    )
    await Promise.resolve()
    await Promise.resolve()
    canceled.abort()
    expect(await waiting).toBeNull()
    expect(f.contents.listenerCount('pluginTerminalSurface:available')).toBe(0)
    for (const lease of spares) {
      f.call('dispose', { id: lease.id })
    }
    for (const lease of ready) {
      f.call('dispose', { id: lease!.id })
    }
    expect(f.resources()).toEqual([0, 0, 0, 0, 0])
  })

  it.each(['revoke', 'loseApproval'] as const)(
    'revokes a pending connection on %s without resurrecting resources or accepting another owner',
    async (retire) => {
      const f = setup()
      const target = f.resolve()
      const pending = f.call('connect', { id: target.id })
      expect(f.resources()).toEqual([1, 1, 1, 0, 3])
      expect(await f.call('input', { id: target.id, data: 'foreign' }, new Contents(2))).toBe(false)
      expect(f.input()).toBe('')
      for (let i = 0; i < 5; i++) {
        for (const output of f.data) {
          output('x'.repeat(65536))
        }
      }
      f[retire]()
      expect(f.resources()).toEqual([0, 0, 0, 0, 0])
      f.snapshots[0]!.resolve(snapshot)
      expect(await pending).toEqual({ snapshot: null, replay: [] })
      expect(f.snapshots).toHaveLength(1)
      expect(await f.call('input', { id: target.id, data: 'late' })).toBe(false)
      expect(f.resolve()).toBeNull()
      expect(f.resources()).toEqual([0, 0, 0, 0, 0])
    }
  )

  it('isolates leases of one PTY and releases geometry after permission loss and late fits', async () => {
    const f = setup()
    const a = f.resolve()
    const b = f.resolve()
    const ca = f.call('connect', { id: a.id })
    const cb = f.call('connect', { id: b.id })
    f.call('dispose', { id: a.id })
    f.snapshots[0]!.resolve(snapshot)
    f.snapshots[1]!.resolve(snapshot)
    expect((await ca).snapshot).toBeNull()
    expect((await cb).snapshot).toEqual(snapshot)
    expect(f.resources()).toEqual([1, 1, 1, 0, 3])
    const oldFit = f.call('fit', { id: b.id, cols: 80, rows: 24 })
    f.call('releaseFit', { id: b.id })
    const currentFit = f.call('fit', { id: b.id, cols: 100, rows: 30 })
    f.fits[1]!.resolve(true)
    expect(await currentFit).toEqual({ cols: 80, rows: 24 })
    f.fits[0]!.resolve(true)
    expect(await oldFit).toBeNull()
    expect(f.geometry.size).toBe(1)
    const refusedFit = f.call('fit', { id: b.id, cols: 80, rows: 24 })
    f.fits[2]!.resolve(false)
    expect(await refusedFit).toBeNull()
    expect(f.geometry.size).toBe(0)
    const admittedFit = f.call('fit', { id: b.id, cols: 80, rows: 24 })
    f.fits[3]!.resolve(true)
    await admittedFit
    f.setHostPlatform(undefined)
    expect(await f.call('input', { id: b.id, data: 'unknown-host' })).toBe(false)
    f.setHostPlatform('linux')
    f.setCapabilities(['terminal:read'])
    expect(f.geometry.size).toBe(0)
    expect(await f.call('input', { id: b.id, data: 'denied' })).toBe(false)
    expect(await f.call('fit', { id: b.id, cols: 80, rows: 24 })).toBeNull()
    expect(f.input()).toBe('')
    f.loseApproval()
    expect(f.resources()).toEqual([0, 0, 0, 0, 0])
  })

  it('bounds unacknowledged output and retires the entire lease before stale queued delivery', async () => {
    const f = setup()
    const target = f.resolve()
    const connected = f.call('connect', { id: target.id })
    f.snapshots[0]!.resolve(snapshot)
    await connected
    for (let i = 0; i < 40; i++) {
      for (const output of f.data) {
        output('x'.repeat(65536))
      }
    }
    const bytes = () =>
      f.contents.messages
        .filter(({ payload }) => payload.type === 'data')
        .reduce((sum, { payload }) => sum + (payload.bytes ?? 0), 0)
    expect(bytes()).toBe(524288)
    for (let i = 0; i < 8; i++) {
      f.call('ack', { id: target.id, bytes: 65536 })
    }
    expect(f.contents.messages.filter(({ payload }) => payload.type === 'resync')).toHaveLength(1)
    expect(bytes()).toBe(524288)
    const reconnect = f.call('connect', { id: target.id })
    f.snapshots[1]!.resolve(snapshot)
    await reconnect
    for (let i = 0; i < 9; i++) {
      for (const output of f.data) {
        output('y'.repeat(65536))
      }
    }
    const before = bytes()
    f.replacePty()
    f.call('ack', { id: target.id, bytes: 65536 })
    expect(bytes()).toBe(before)
    expect(f.resources()).toEqual([0, 0, 0, 0, 0])
  })

  it('drops queued data and all resources if the terminal retires before delivery', async () => {
    vi.useFakeTimers()
    try {
      const f = setup()
      const target = f.resolve()
      const connected = f.call('connect', { id: target.id })
      f.snapshots[0]!.resolve(snapshot)
      await connected
      for (const output of f.data) {
        output('pending')
      }
      f.replacePty()
      vi.runOnlyPendingTimers()
      expect(f.contents.messages.filter(({ payload }) => payload.type === 'data')).toEqual([])
      expect(f.resources()).toEqual([0, 0, 0, 0, 0])
    } finally {
      vi.useRealTimers()
    }
  })

  it('caps leases, keeps foreign owners from closing them, and frees capacity on renderer retirement', () => {
    const f = setup()
    const targets = Array.from({ length: 16 }, () => f.resolve())
    expect(targets.every(Boolean)).toBe(true)
    expect(f.resolve()).toEqual({ unavailable: 'capacity' })
    f.call('dispose', { id: targets[0].id }, new Contents(2))
    expect(f.resolve()).toEqual({ unavailable: 'capacity' })
    f.call('dispose', { id: targets[0].id })
    expect(f.resolve()).not.toBeNull()
    f.contents.failSend = true
    f.contents.emit('did-navigate')
    expect(f.resources()).toEqual([0, 0, 0, 0, 0])
  })
})
