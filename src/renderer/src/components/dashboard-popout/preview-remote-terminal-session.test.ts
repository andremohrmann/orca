import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  TerminalStreamOpcode as Opcode,
  decodeTerminalStreamFrame,
  decodeTerminalStreamJson,
  encodeTerminalStreamFrame,
  encodeTerminalStreamJson,
  encodeTerminalStreamText
} from '../../../../shared/terminal-stream-protocol'
import { resetRemoteRuntimeTerminalMultiplexersForTests } from '@/runtime/remote-runtime-terminal-multiplexer'
import { replaceRuntimeEnvironmentRevisions } from '@/runtime/runtime-environment-revision'
import { createPreviewRemoteTerminalSession } from './preview-remote-terminal-session'

type Callbacks = {
  onResponse: (response: unknown) => void
  onBinary: (bytes: Uint8Array) => void
  onClose: () => void
}

describe('remote preview through the terminal wire', () => {
  const subscribe = vi.fn()
  const sendBinary = vi.fn()
  const unsubscribe = vi.fn()
  const onSnapshot = vi.fn(),
    onData = vi.fn(),
    onResize = vi.fn(),
    onUnavailable = vi.fn()
  let callbacks: Callbacks
  const sessions: NonNullable<ReturnType<typeof createPreviewRemoteTerminalSession>>[] = []

  const frames = () => sendBinary.mock.calls.map(([bytes]) => decodeTerminalStreamFrame(bytes)!)
  const subscribePayload = () => {
    const frame = frames().findLast((frame) => frame.opcode === Opcode.Subscribe)!
    return decodeTerminalStreamJson<{ streamId: number; terminal: string; viewport?: unknown }>(
      frame.payload
    )!
  }
  const emit = (
    opcode: Opcode,
    streamId: number,
    payload: Uint8Array = new Uint8Array(),
    seq = 0
  ) => callbacks.onBinary(encodeTerminalStreamFrame({ opcode, streamId, payload, seq }))
  const snapshot = (streamId: number, grid?: { cols: number; rows: number }) => {
    emit(
      Opcode.SnapshotStart,
      streamId,
      encodeTerminalStreamJson({ ...grid, seq: 10, kittyKeyboardFlags: 1 })
    )
    emit(Opcode.SnapshotChunk, streamId, encodeTerminalStreamText('server screen'))
    emit(Opcode.SnapshotEnd, streamId)
  }
  const session = (environmentId: string | null = 'owning-server') => {
    const next = createPreviewRemoteTerminalSession({
      ptyId: environmentId ? `remote:${environmentId}@@terminal-1` : 'remote:terminal-1',
      onSnapshot,
      onData,
      onResize,
      onUnavailable
    })!
    sessions.push(next)
    return next
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    replaceRuntimeEnvironmentRevisions([])
    subscribe.mockImplementation(async (_args, nextCallbacks) => {
      callbacks = nextCallbacks
      queueMicrotask(() => callbacks.onResponse({ ok: true, result: { type: 'ready' } }))
      return { sendBinary, unsubscribe }
    })
    vi.stubGlobal('window', { api: { runtimeEnvironments: { subscribe } } })
  })
  afterEach(() => {
    sessions.splice(0).forEach((entry) => entry.dispose())
    resetRemoteRuntimeTerminalMultiplexersForTests()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('routes initial snapshots, input and claims to the owning server with the legacy Resize fallback', async () => {
    const preview = session()
    await preview.fit('remote:owning-server@@terminal-1', 91, 32)
    await preview.start()
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ selector: 'owning-server' }),
      expect.any(Object)
    )
    const { streamId, terminal, viewport } = subscribePayload()
    expect(terminal).toBe('terminal-1')
    expect(viewport).toEqual({ cols: 91, rows: 32 })
    snapshot(streamId, { cols: 120, rows: 40 })
    expect(onSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        data: 'server screen',
        cols: 120,
        rows: 40,
        seq: 10,
        kittyKeyboardFlags: 1
      })
    )
    const controls = frames().filter((frame) =>
      [Opcode.ClaimViewport, Opcode.Resize].includes(frame.opcode)
    )
    expect(controls.map((frame) => frame.opcode)).toEqual([Opcode.ClaimViewport, Opcode.Resize])
    for (const frame of controls) {
      expect(frame.streamId).toBe(streamId)
      expect(decodeTerminalStreamJson(frame.payload)).toEqual({ cols: 91, rows: 32 })
    }
    expect(preview.input('hello')).toBe(true)
    expect(frames().at(-1)?.opcode).toBe(Opcode.Input)
    emit(Opcode.Output, streamId, encodeTerminalStreamText('live'), 14)
    expect(onData).toHaveBeenCalledExactlyOnceWith('live')
  })

  it('uses host resize dimensions when an older host omits snapshot dimensions', async () => {
    const preview = session()
    await preview.start()
    const { streamId } = subscribePayload()
    snapshot(streamId)
    expect(onSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ cols: 80, rows: 24 }))
    callbacks.onResponse({
      ok: true,
      result: { type: 'fit-override-changed', streamId, mode: 'desktop-fit', cols: 93, rows: 31 }
    })
    expect(onResize).toHaveBeenCalledWith({ cols: 93, rows: 31 })
    snapshot(streamId)
    expect(onSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ cols: 93, rows: 31 }))
  })

  it('releases its viewer by unsubscribing and resumes output without a viewport claim', async () => {
    const preview = session()
    await preview.start()
    const original = subscribePayload().streamId
    snapshot(original)
    await preview.fit('', 80, 30)
    sendBinary.mockClear()
    await preview.releaseFit()
    expect(frames()[0]).toMatchObject({ opcode: Opcode.Unsubscribe, streamId: original })
    expect(subscribePayload().viewport).toBeUndefined()
    snapshot(subscribePayload().streamId)
    expect(frames().some((frame) => frame.opcode === Opcode.ClaimViewport)).toBe(false)
    await preview.fit('', 80, 30)
    expect(frames().some((frame) => frame.opcode === Opcode.ClaimViewport)).toBe(true)
  })

  it('reclaims the desired grid after transport loss and stops retrying on disposal', async () => {
    const preview = session()
    await preview.start()
    snapshot(subscribePayload().streamId)
    await preview.fit('', 98, 35)
    callbacks.onClose()
    expect(preview.input('lost')).toBe(false)
    expect(onUnavailable).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(subscribe).toHaveBeenCalledTimes(2)
    expect(subscribePayload().viewport).toEqual({ cols: 98, rows: 35 })
    snapshot(subscribePayload().streamId)
    callbacks.onClose()
    preview.dispose()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(subscribe).toHaveBeenCalledTimes(2)
  })

  it('fails closed when the remote owner is unknown', async () => {
    await session(null).start()
    expect(subscribe).not.toHaveBeenCalled()
    expect(onUnavailable).toHaveBeenCalledOnce()
  })

  it('closes an attachment that finishes after unmount without delivering its snapshot', async () => {
    const preview = session()
    const starting = preview.start()
    preview.dispose()
    await starting
    expect(frames().at(-1)).toMatchObject({
      opcode: Opcode.Unsubscribe,
      streamId: subscribePayload().streamId
    })
    snapshot(subscribePayload().streamId)
    expect(onSnapshot).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['exited', 'unverifiable'] as const)(
    'handles the host end verdict %s',
    async (verdict) => {
      const preview = session()
      await preview.start()
      const { streamId } = subscribePayload()
      snapshot(streamId)
      callbacks.onResponse({ ok: true, result: { type: 'end', streamId, verdict } })
      expect(preview.input('after end')).toBe(false)
      await vi.advanceTimersByTimeAsync(1_000)
      expect(subscribe).toHaveBeenCalledTimes(verdict === 'exited' ? 1 : 2)
    }
  )

  it('never reconnects an existing preview to a replacement pairing with the same environment id', async () => {
    replaceRuntimeEnvironmentRevisions([{ id: 'owning-server', createdAt: 1 }])
    const preview = session()
    await preview.start()
    snapshot(subscribePayload().streamId)
    callbacks.onClose()
    replaceRuntimeEnvironmentRevisions([{ id: 'owning-server', createdAt: 2 }])
    await vi.advanceTimersByTimeAsync(1_000)
    expect(subscribe).toHaveBeenCalledTimes(1)
    await preview.start()
    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(preview.input('wrong host')).toBe(false)
  })
})
