import { describe, expect, it } from 'vitest'
import { handleMultiplexViewportFrame } from './terminal-multiplex-viewport-frames'
import {
  TerminalStreamOpcode as Op,
  encodeTerminalStreamJson,
  decodeTerminalStreamJson
} from '../../../../../shared/terminal/stream/terminal-stream-protocol'
import type { TerminalMultiplexConnection } from './terminal-multiplex-connection'
import type { TerminalMultiplexStream } from './terminal-stream-types'

it('acknowledges only owner-applied geometry and releases the exact stream claim', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const viewers = new Map<string, { cols: number; rows: number }>()
  const acknowledgements: unknown[] = []
  const target = { worktreeId: 'workspace', incarnationId: 'incarnation', profileKey: 'profile-v1' }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the fixture implements every stream member exercised by viewport claims and release.
  const stream = {
    streamId: 1,
    terminal: 'stable',
    ptyId: 'pty',
    isMobile: false,
    client: { id: 'client', type: 'desktop' },
    supportsViewportLease: true,
    previewTarget: target,
    supportsDesktopViewportClaims: true,
    remoteDesktopSubscriptionKey: 'connection:1',
    desktopClaimTail: Promise.resolve(true)
  } as TerminalMultiplexStream
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the fixture supplies the real handler's registry, viewport runtime and frame sink.
  const state = {
    closed: false,
    streams: new Map([[1, stream]]),
    runtime: {
      describePluginTerminalSurface: () => target,
      updateRemoteDesktopViewer: async (
        _pty: string,
        key: string,
        _client: string,
        cols: number,
        rows: number
      ) => {
        await gate
        viewers.set(key, { cols, rows })
        return true
      },
      unregisterRemoteDesktopViewer: async (_pty: string, key: string) => {
        viewers.delete(key)
      },
      getTerminalSize: () => viewers.get('connection:1')
    },
    sendFrame: (_id: number, opcode: Op, payload: Uint8Array) => {
      if (opcode === Op.ViewportAck) {
        acknowledgements.push(decodeTerminalStreamJson(payload))
      }
      return true
    }
  } as unknown as TerminalMultiplexConnection
  expect(
    handleMultiplexViewportFrame(state, stream, {
      opcode: Op.ClaimViewport,
      streamId: 1,
      seq: 7,
      payload: encodeTerminalStreamJson({ cols: 100, rows: 30 })
    })
  ).toBe(true)
  expect(acknowledgements).toEqual([])
  release()
  await stream.desktopClaimTail
  expect(acknowledgements).toEqual([{ requestId: 7, applied: true, cols: 100, rows: 30 }])
  expect(viewers.size).toBe(1)
  handleMultiplexViewportFrame(state, stream, {
    opcode: Op.ReleaseViewport,
    streamId: 1,
    seq: 8,
    payload: encodeTerminalStreamJson({})
  })
  await stream.desktopClaimTail
  expect(viewers.size).toBe(0)
  expect(acknowledgements.at(-1)).toEqual({ requestId: 8, released: true, applied: false })
  expect(await stream.desktopClaimTail).toBe(false)
})

describe('owner binding before viewport effects', () => {
  it('does not acquire a claim after workspace identity no longer matches', async () => {
    const viewers = new Set<string>()
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: stale-owner admission reads only these stream identity and viewport fields.
    const stream = {
      streamId: 1,
      terminal: 'stable',
      ptyId: 'pty',
      isMobile: false,
      client: { id: 'client', type: 'desktop' },
      supportsViewportLease: true,
      previewTarget: {
        worktreeId: 'expected',
        incarnationId: 'incarnation',
        profileKey: 'profile-v1'
      },
      desktopClaimTail: Promise.resolve(true),
      remoteDesktopSubscriptionKey: 'old'
    } as TerminalMultiplexStream
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the fixture supplies the registry and owner descriptor used before any viewport effect.
    const state = {
      closed: false,
      streams: new Map([[1, stream]]),
      runtime: {
        describePluginTerminalSurface: () => ({
          worktreeId: 'different',
          incarnationId: 'incarnation',
          profileKey: 'profile-v1'
        }),
        updateRemoteDesktopViewer: async () => {
          viewers.add('old')
          return true
        },
        unregisterRemoteDesktopViewer: async () => {
          viewers.delete('old')
        }
      },
      sendFrame: () => {
        throw new Error('stale owner must not acknowledge a claim')
      }
    } as unknown as TerminalMultiplexConnection
    handleMultiplexViewportFrame(state, stream, {
      opcode: Op.ClaimViewport,
      streamId: 1,
      seq: 9,
      payload: encodeTerminalStreamJson({ cols: 80, rows: 24 })
    })
    expect(await stream.desktopClaimTail).toBe(false)
    expect([...viewers]).toEqual([])
  })
})
