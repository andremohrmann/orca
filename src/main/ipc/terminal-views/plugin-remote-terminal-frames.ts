import { z } from 'zod'
import {
  TerminalStreamOpcode as Op,
  decodeTerminalStreamFrame,
  decodeTerminalStreamJson,
  decodeTerminalStreamText,
  encodeTerminalStreamJson
} from '../../../shared/terminal/stream/terminal-stream-protocol'
import type { RemoteRuntimeTransportSubscription } from '../../../shared/remote-runtime/requests/remote-runtime-subscription-contract'
import type { RuntimeRpcResponse } from '../../../shared/remote-runtime/rpc/runtime-rpc-envelope'
import type {
  TerminalPreviewConnectResult,
  TerminalPreviewSnapshot
} from '../../../shared/terminal/replay/terminal-preview'
import type { WebContents } from 'electron'
import { TerminalPreviewOutputStream } from './terminal-preview-output-stream'

const snapshotMeta = z.object({
  cols: z.number().int().min(2).max(500),
  rows: z.number().int().min(2).max(200),
  seq: z.number().optional(),
  requestId: z.number().optional(),
  pendingEscapeTailAnsi: z.string().optional(),
  kittyKeyboardFlags: z.number().optional(),
  unavailable: z.enum(['no-serializable-buffer', 'pending-output-overflowed']).optional(),
  truncated: z.boolean().optional()
})
const viewportReply = z.object({
  requestId: z.number().int().positive(),
  applied: z.boolean(),
  released: z.boolean().optional(),
  cols: z.number().int().min(2).max(500).optional(),
  rows: z.number().int().min(2).max(200).optional()
})
export type Callbacks = {
  response: (response: RuntimeRpcResponse<unknown>) => void
  binary: (bytes: Uint8Array) => void
  close: () => void
}
export type Geometry = { cols: number; rows: number } | null
type PendingGeometry = { finish: (value: Geometry) => void; timer: ReturnType<typeof setTimeout> }
export type Connection = {
  socket: RemoteRuntimeTransportSubscription | null
  controller: AbortController
  grid: { cols: number; rows: number } | null
  credits: { remaining: number; wire: number }[]
  creditBytes: number
  heldCreditBytes: number
  hasSnapshot: boolean
  ready: boolean
  negotiated: boolean
  closed: boolean
  output: TerminalPreviewOutputStream
  chunks: string[]
  chunkBytes: number
  meta: z.infer<typeof snapshotMeta> | null
  pending: {
    id: number
    finish: (result: TerminalPreviewConnectResult) => void
    timer: ReturnType<typeof setTimeout>
  } | null
  geometry: Map<number, PendingGeometry>
}

export function receivePluginRemoteTerminalFrame(
  state: Connection,
  bytes: Uint8Array,
  ports: {
    current: () => boolean
    close: () => void
    send: (op: Op, payload: Uint8Array) => boolean
  }
): void {
  if (!ports.current()) {
    ports.close()
    return
  }
  const frame = decodeTerminalStreamFrame(bytes)
  if (!frame || frame.streamId !== 1 || !state.negotiated) {
    ports.close()
    return
  }
  if (frame.opcode === Op.SnapshotStart) {
    const parsed = snapshotMeta.safeParse(decodeTerminalStreamJson(frame.payload))
    state.chunks = []
    state.chunkBytes = 0
    state.meta =
      parsed.success && state.pending && (parsed.data.requestId ?? 0) === state.pending.id
        ? parsed.data
        : null
    if (!state.meta && !state.pending) {
      state.output.requestResync()
    }
  } else if (frame.opcode === Op.SnapshotChunk && state.meta) {
    state.chunkBytes += frame.payload.byteLength
    if (state.chunkBytes > 8 * 1024 * 1024) {
      ports.close()
      return
    }
    state.chunks.push(decodeTerminalStreamText(frame.payload))
  } else if (frame.opcode === Op.SnapshotEnd && state.meta && state.pending) {
    const unavailable = state.meta.unavailable !== undefined
    const snapshot: TerminalPreviewSnapshot | null = unavailable
      ? null
      : { ...state.meta, data: state.chunks.join('') }
    if (snapshot) {
      state.hasSnapshot = true
      state.grid = { cols: snapshot.cols, rows: snapshot.rows }
    }
    const resyncRequired =
      state.output.consumeInitialOverflow() || unavailable || state.meta.truncated === true
    const replay = snapshot ? state.output.completeSnapshot(snapshot.seq) : []
    const pending = state.pending
    state.pending = null
    state.meta = null
    state.chunks = []
    clearTimeout(pending.timer)
    if (state.heldCreditBytes) {
      ports.send(Op.Ack, encodeTerminalStreamJson({ bytes: state.heldCreditBytes }))
    }
    state.heldCreditBytes = 0
    pending.finish({
      snapshot,
      replay: resyncRequired ? [] : replay,
      ...(resyncRequired ? { resyncRequired: true } : {})
    })
  } else if (frame.opcode === Op.Output || frame.opcode === Op.OutputSpan) {
    const span =
      frame.opcode === Op.OutputSpan
        ? z
            .object({
              data: z.string(),
              rawLength: z.number().int().nonnegative().safe(),
              transformed: z.literal(true)
            })
            .safeParse(decodeTerminalStreamJson(frame.payload))
        : null
    if (span && !span.success) {
      ports.close()
      return
    }
    const data = span?.success ? span.data.data : decodeTerminalStreamText(frame.payload)
    const wire = frame.payload.byteLength
    const display = Buffer.byteLength(data)
    if (!display) {
      ports.send(Op.Ack, encodeTerminalStreamJson({ bytes: wire }))
      return
    }
    if (state.pending) {
      state.heldCreditBytes += wire
    } else {
      state.credits.push({ remaining: display, wire })
      state.creditBytes += wire
    }
    if (state.creditBytes + state.heldCreditBytes > 1024 * 1024) {
      ports.close()
      return
    }
    state.output.append(data, {
      seq: frame.seq,
      rawLength: span?.success ? span.data.rawLength : data.length,
      ...(span?.success ? { transformed: true } : {})
    })
  } else if (frame.opcode === Op.ViewportAck) {
    const parsed = viewportReply.safeParse(decodeTerminalStreamJson(frame.payload))
    if (!parsed.success) {
      ports.close()
      return
    }
    const reply = parsed.data
    const operation = reply && state.geometry.get(reply.requestId)
    if (operation && reply) {
      clearTimeout(operation.timer)
      state.geometry.delete(reply.requestId)
      operation.finish(
        reply.applied && typeof reply.cols === 'number' && typeof reply.rows === 'number'
          ? { cols: reply.cols, rows: reply.rows }
          : null
      )
    }
  } else if (frame.opcode === Op.Error || frame.opcode === Op.WriteUnavailable) {
    ports.close()
  }
}

export function createPluginRemoteTerminalOutput(deps: {
  contents: Pick<WebContents, 'id' | 'send' | 'isDestroyed'>
  id: string
  current: () => boolean
  closing: () => boolean
  retired: () => void
}): TerminalPreviewOutputStream {
  return new TerminalPreviewOutputStream(
    deps.contents,
    deps.id,
    () => {},
    () => {
      if (!deps.closing() && !deps.current()) {
        deps.retired()
      }
    },
    { channel: 'pluginTerminalSurface:data', allowed: () => deps.current() }
  )
}

export function closePluginRemoteTerminalConnection(state: Connection): void {
  if (state.closed) {
    return
  }
  state.closed = true
  state.controller.abort()
  state.output.dispose()
  state.socket?.close()
  state.chunks = []
  state.meta = null
  state.chunkBytes = 0
  if (state.pending) {
    clearTimeout(state.pending.timer)
    state.pending.finish({ snapshot: null, replay: [] })
    state.pending = null
  }
  for (const operation of state.geometry.values()) {
    clearTimeout(operation.timer)
    operation.finish(null)
  }
  state.geometry.clear()
  state.credits = []
  state.creditBytes = 0
  state.heldCreditBytes = 0
}

export function creditPluginRemoteTerminalOutput(state: Connection, displayBytes: number): number {
  let wire = 0
  while (displayBytes > 0 && state.credits.length) {
    const next = state.credits[0]!
    const used = Math.min(displayBytes, next.remaining)
    displayBytes -= used
    next.remaining -= used
    if (next.remaining === 0) {
      state.credits.shift()
      state.creditBytes -= next.wire
      wire += next.wire
    }
  }
  return wire
}

export function receivePluginRemoteTerminalResponse(
  state: Connection,
  response: RuntimeRpcResponse<unknown>,
  ports: {
    active: () => boolean
    current: () => boolean
    runtimeId: string
    close: () => void
    subscribe: () => void
    retired: (reason?: 'profile_changed') => void
  }
): void {
  if (!ports.active() || state.closed) {
    return
  }
  if (!ports.current() || !response.ok || response._meta.runtimeId !== ports.runtimeId) {
    ports.close()
    return
  }
  if (!response.result || typeof response.result !== 'object' || Array.isArray(response.result)) {
    ports.close()
    return
  }
  const parsed = z
    .object({
      type: z.string(),
      streamId: z.number().optional(),
      capabilities: z.object({ viewportLease: z.number().optional() }).optional()
    })
    .safeParse(response.result)
  if (!parsed.success) {
    ports.close()
    return
  }
  const event = parsed.data
  if (event.type === 'subscribed' && event.streamId === 1) {
    if (event.capabilities?.viewportLease !== 1) {
      ports.close()
      return
    }
    state.negotiated = true
  } else if (event.type === 'ready') {
    state.ready = true
    ports.subscribe()
  } else if (event.type === 'fit-override-changed') {
    if (!state.pending) {
      state.output.requestResync()
    }
  } else if (event.type === 'preview-profile-changed') {
    ports.retired('profile_changed')
  } else if (event.type === 'preview-owner-retired') {
    ports.retired()
  } else if (event.type === 'end' || event.type === 'error') {
    ports.close()
  }
}
