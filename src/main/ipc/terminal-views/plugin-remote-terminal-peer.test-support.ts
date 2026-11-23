import type { TerminalPreviewDataPayload } from '../../../shared/terminal/replay/terminal-preview'
import {
  TerminalStreamOpcode as Op,
  encodeTerminalStreamFrame,
  decodeTerminalStreamFrame,
  encodeTerminalStreamJson,
  encodeTerminalStreamText
} from '../../../shared/terminal/stream/terminal-stream-protocol'
import { PluginRemoteTerminalStream } from './plugin-remote-terminal-stream'
import type { TerminalPluginPreviewTarget } from '../../../shared/terminal/stream/terminal-plugin-preview-contract'
import type { RemoteRuntimeTransportSubscription } from '../../../shared/remote-runtime/requests/remote-runtime-subscription-contract'
import type { Callbacks } from './plugin-remote-terminal-frames'
const target: TerminalPluginPreviewTarget = {
  contract: 'terminal.plugin-preview.v1',
  profileKey: 'profile-v1',
  terminal: 'stable',
  worktreeId: 'workspace',
  incarnationId: 'incarnation',
  hostPlatform: 'linux',
  input: {
    hostPlatform: 'linux',
    localWindowsConpty: false,
    windowsShiftEnterEncoding: 'alt-enter',
    ctrlEnterCsiU: false,
    kittyKeyboardAdvertised: true
  }
}
export function createPluginTerminalPeer(negotiated = true) {
  let callbacks!: Callbacks
  let current = true
  let retiredReason: 'profile_changed' | undefined
  let closed = 0
  let socketReady!: (socket: RemoteRuntimeTransportSubscription) => void
  const delivered: TerminalPreviewDataPayload[] = []
  const sent: NonNullable<ReturnType<typeof decodeTerminalStreamFrame>>[] = []
  const binary = (opcode: Op, payload: Uint8Array = new Uint8Array(), seq = 0) =>
    callbacks.binary(encodeTerminalStreamFrame({ opcode, payload, seq, streamId: 1 }))
  const reply = (result: unknown, runtimeId = 'owner') =>
    callbacks.response({ id: 'stream', ok: true, result, _meta: { runtimeId } })
  const snapshot = (requestId?: number) => {
    binary(Op.SnapshotStart, encodeTerminalStreamJson({ cols: 80, rows: 24, seq: 0, requestId }))
    binary(Op.SnapshotChunk, encodeTerminalStreamText('ready'))
    binary(Op.SnapshotEnd)
  }
  const socket = {
    requestId: 'connection',
    close: () => {
      closed++
    },
    sendBinary: (bytes: Uint8Array) => {
      const frame = decodeTerminalStreamFrame(bytes)!
      sent.push(frame)
      if (frame.opcode === Op.Subscribe) {
        reply({
          type: 'subscribed',
          streamId: 1,
          capabilities: { viewportLease: negotiated ? 1 : undefined }
        })
        if (negotiated) {
          snapshot()
        }
      }
      return true
    }
  }
  const stream = new PluginRemoteTerminalStream({
    id: 'lease',
    contents: {
      id: 1,
      isDestroyed: () => false,
      send: (_channel: string, payload: TerminalPreviewDataPayload) => delivered.push(payload)
    },
    target,
    runtimeId: 'owner',
    current: () => current,
    retired: (reason) => {
      retiredReason = reason
      current = false
      stream.dispose()
    },
    open: (next) => {
      callbacks = next
      reply({ type: 'ready' })
      return new Promise((resolve) => {
        socketReady = resolve
      })
    }
  })
  return {
    stream,
    binary,
    reply,
    snapshot,
    sent,
    delivered,
    closed: () => closed,
    retiredReason: () => retiredReason,
    transportClose: () => callbacks.close(),
    open: () => socketReady(socket),
    retire: () => {
      current = false
    }
  }
}
