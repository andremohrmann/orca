import { describe, expect, it } from 'vitest'
import { iterateTerminalOutputFrameChunks } from '../../runtime/rpc/terminal/terminal-output-frame-chunks'
import {
  TerminalStreamOpcode as Op,
  encodeTerminalStreamJson,
  decodeTerminalStreamJson,
  encodeTerminalStreamText
} from '../../../shared/terminal/stream/terminal-stream-protocol'
import { createPluginTerminalPeer } from './plugin-remote-terminal-peer.test-support'

describe('paired plugin terminal protocol boundary', () => {
  it('drains a closed connection’s delivered bytes before admitting a new output generation', async () => {
    const p = createPluginTerminalPeer()
    const initial = p.stream.connect()
    p.open()
    await initial
    p.binary(Op.Output, encodeTerminalStreamText('x'.repeat(65536)), 65536)
    p.binary(Op.Output, encodeTerminalStreamText('y'.repeat(65536)), 131072)
    p.transportClose()
    const blocked = p.stream.connect()
    p.open()
    expect(await blocked).toMatchObject({ snapshot: null, resyncRequired: true })
    p.stream.ack(65536)
    const partial = p.stream.connect()
    p.open()
    expect(await partial).toMatchObject({ snapshot: null, resyncRequired: true })
    p.stream.ack(65536)
    expect(p.sent.filter((frame) => frame.opcode === Op.Ack)).toEqual([])
    const recovered = p.stream.connect()
    p.open()
    expect((await recovered).snapshot?.data).toBe('ready')
    p.binary(Op.Output, encodeTerminalStreamText('z'.repeat(65536)), 65536)
    p.stream.ack(65536)
    expect(decodeTerminalStreamJson(p.sent.at(-1)!.payload)).toEqual({ bytes: 65536 })
    p.stream.dispose()
  })

  it('drains old renderer credit before snapshot replacement and preserves unavailable state', async () => {
    const p = createPluginTerminalPeer()
    const initial = p.stream.connect()
    p.open()
    await initial
    for (let i = 0; i < 9; i++) {
      p.binary(Op.Output, encodeTerminalStreamText('x'.repeat(65536)), (i + 1) * 65536)
    }
    expect(await p.stream.connect()).toMatchObject({ snapshot: null, resyncRequired: true })
    expect(p.sent.filter((frame) => frame.opcode === Op.SnapshotRequest)).toEqual([])
    p.stream.ack(524288)
    const refresh = p.stream.connect()
    const request = decodeTerminalStreamJson<{ requestId: number }>(p.sent.at(-1)!.payload)!
    expect(
      p.sent
        .filter((frame) => frame.opcode === Op.Ack)
        .map((frame) => decodeTerminalStreamJson(frame.payload))
    ).toEqual([{ bytes: 524288 }, { bytes: 65536 }])
    p.binary(
      Op.SnapshotStart,
      encodeTerminalStreamJson({
        cols: 120,
        rows: 40,
        requestId: request.requestId,
        unavailable: 'no-serializable-buffer'
      })
    )
    p.binary(Op.SnapshotEnd)
    expect(await refresh).toMatchObject({ snapshot: null, replay: [], resyncRequired: true })
    const recovered = p.stream.connect()
    const retry = decodeTerminalStreamJson<{ requestId: number }>(p.sent.at(-1)!.payload)!
    p.snapshot(retry.requestId)
    await recovered
    p.binary(Op.Output, encodeTerminalStreamText('y'.repeat(65536)), 65536)
    p.stream.ack(65536)
    expect(decodeTerminalStreamJson(p.sent.at(-1)!.payload)).toEqual({ bytes: 65536 })
    p.stream.dispose()
  })

  it('retires a changed owner profile instead of sending through the old keyboard contract', async () => {
    const p = createPluginTerminalPeer()
    const connected = p.stream.connect()
    p.open()
    await connected
    p.reply({ type: 'preview-profile-changed', streamId: 1 })
    expect(p.retiredReason()).toBe('profile_changed')
    expect(p.closed()).toBe(1)
    expect(await p.stream.input('stale')).toBe(false)
  })

  it('renders real transformed spans and returns their full wire credit only after displayed bytes parse', async () => {
    const p = createPluginTerminalPeer()
    const connected = p.stream.connect()
    p.open()
    await connected
    const data = `\x1b[0m${'x'.repeat(65532)}`
    const chunk = [
      ...iterateTerminalOutputFrameChunks(
        data,
        { seq: 70000, rawLength: 70000, transformed: true },
        'span'
      )
    ][0]!
    expect(chunk.opcode).toBe(Op.OutputSpan)
    p.binary(chunk.opcode!, chunk.bytes, 70000)
    expect(p.delivered.at(-1)).toMatchObject({ data })
    p.stream.ack(32768)
    expect(p.sent.filter((frame) => frame.opcode === Op.Ack)).toEqual([])
    p.stream.ack(32768)
    expect(decodeTerminalStreamJson(p.sent.at(-1)!.payload)).toEqual({
      bytes: chunk.bytes.byteLength
    })
    p.stream.dispose()
  })

  it('credits snapshot-covered buffered wire spans and explicitly resyncs initial overflow', async () => {
    const p = createPluginTerminalPeer()
    const first = p.stream.connect()
    p.open()
    await first
    const refreshing = p.stream.connect()
    const request = decodeTerminalStreamJson<{ requestId: number }>(p.sent.at(-1)!.payload)!
    const chunk = [
      ...iterateTerminalOutputFrameChunks(
        'hidden',
        { seq: 100, rawLength: 100, transformed: true },
        'span'
      )
    ][0]!
    p.binary(chunk.opcode!, chunk.bytes, 100)
    p.binary(
      Op.SnapshotStart,
      encodeTerminalStreamJson({ cols: 80, rows: 24, seq: 100, requestId: request.requestId })
    )
    p.binary(Op.SnapshotChunk, encodeTerminalStreamText('authoritative'))
    p.binary(Op.SnapshotEnd)
    expect((await refreshing).replay).toEqual([])
    expect(decodeTerminalStreamJson(p.sent.at(-1)!.payload)).toEqual({
      bytes: chunk.bytes.byteLength
    })
    const overflowing = p.stream.connect()
    const second = decodeTerminalStreamJson<{ requestId: number }>(p.sent.at(-1)!.payload)!
    for (let i = 0; i < 5; i++) {
      p.binary(Op.Output, encodeTerminalStreamText('x'.repeat(65536)), (i + 1) * 65536)
    }
    p.binary(
      Op.SnapshotStart,
      encodeTerminalStreamJson({ cols: 80, rows: 24, seq: 327680, requestId: second.requestId })
    )
    p.binary(Op.SnapshotChunk, encodeTerminalStreamText('latest'))
    p.binary(Op.SnapshotEnd)
    expect(await overflowing).toMatchObject({
      snapshot: { data: 'latest' },
      replay: [],
      resyncRequired: true
    })
    expect(decodeTerminalStreamJson(p.sent.at(-1)!.payload)).toEqual({ bytes: 327680 })
    p.stream.dispose()
  })

  it('reconnects the pinned owner and reacquires its last viewport before resuming input', async () => {
    const p = createPluginTerminalPeer()
    const initial = p.stream.connect()
    p.open()
    await initial
    const fit = p.stream.fit(100, 30)
    p.binary(
      Op.ViewportAck,
      encodeTerminalStreamJson({
        requestId: p.sent.at(-1)!.seq,
        applied: true,
        cols: 100,
        rows: 30
      })
    )
    await fit
    p.transportClose()
    expect(p.delivered.at(-1)).toEqual({ type: 'resync', ptyId: 'lease' })
    const reconnect = p.stream.connect()
    p.open()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    const claim = p.sent.at(-1)!
    expect(claim.opcode).toBe(Op.ClaimViewport)
    p.binary(
      Op.ViewportAck,
      encodeTerminalStreamJson({ requestId: claim.seq, applied: true, cols: 100, rows: 30 })
    )
    expect((await reconnect).snapshot?.data).toBe('ready')
    expect(await p.stream.input('after-reconnect')).toBe(true)
    expect(p.sent.at(-1)!.opcode).toBe(Op.Input)
    p.stream.dispose()
    expect(p.closed()).toBe(2)
  })

  it('holds typed input behind owner claim acknowledgement and drops it on revocation', async () => {
    const p = createPluginTerminalPeer()
    const connected = p.stream.connect()
    p.open()
    await connected
    const write = p.stream.input('must-not-write')
    await Promise.resolve()
    await Promise.resolve()
    expect(p.sent.at(-1)!.opcode).toBe(Op.ClaimViewport)
    expect(p.sent.filter((frame) => frame.opcode === Op.Input)).toEqual([])
    p.retire()
    p.stream.dispose()
    expect(await write).toBe(false)
    expect(p.sent.filter((frame) => frame.opcode === Op.Input)).toEqual([])
  })

  it('requires owner viewport ACK and distinguishes release from local socket send success', async () => {
    const p = createPluginTerminalPeer()
    const connected = p.stream.connect()
    p.open()
    expect((await connected).snapshot?.data).toBe('ready')
    let settled = false
    const fit = p.stream.fit(100, 30).then((value) => {
      settled = true
      return value
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    const claim = p.sent.at(-1)!
    expect(claim.opcode).toBe(Op.ClaimViewport)
    p.binary(
      Op.ViewportAck,
      encodeTerminalStreamJson({ requestId: claim.seq, applied: true, cols: 100, rows: 30 })
    )
    expect(await fit).toEqual({ cols: 100, rows: 30 })
    const released = p.stream.releaseFit()
    const release = p.sent.at(-1)!
    expect(release.opcode).toBe(Op.ReleaseViewport)
    p.binary(
      Op.ViewportAck,
      encodeTerminalStreamJson({ requestId: release.seq, released: true, applied: false })
    )
    await released
    p.stream.dispose()
    expect(p.closed()).toBe(1)
  })

  it('refuses old negotiation and closes late connections without retaining the socket', async () => {
    const old = createPluginTerminalPeer(false)
    const refused = old.stream.connect()
    old.open()
    expect((await refused).snapshot).toBeNull()
    expect(await old.stream.input('blocked')).toBe(false)
    expect(old.closed()).toBe(1)
    const late = createPluginTerminalPeer()
    const opening = late.stream.connect()
    late.stream.dispose()
    expect((await opening).snapshot).toBeNull()
    late.open()
    await Promise.resolve()
    await Promise.resolve()
    expect(late.closed()).toBe(1)
    expect(late.sent).toEqual([])
  })

  it('fences owner identity and bounds output until parse credit returns', async () => {
    const p = createPluginTerminalPeer()
    const connected = p.stream.connect()
    p.open()
    await connected
    for (let i = 0; i < 40; i++) {
      p.binary(Op.Output, encodeTerminalStreamText('x'.repeat(65536)), (i + 1) * 65536)
    }
    const output = p.delivered
    expect(
      output
        .filter((item) => item.type === 'data')
        .reduce((total, item) => total + (item.bytes ?? 0), 0)
    ).toBe(524288)
    p.reply({ type: 'ready' }, 'different-owner')
    expect(p.closed()).toBe(1)
    expect(await p.stream.input('blocked')).toBe(false)
  })
})
