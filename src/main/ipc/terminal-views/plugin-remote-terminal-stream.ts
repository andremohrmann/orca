import {
  creditPluginRemoteTerminalOutput,
  closePluginRemoteTerminalConnection,
  createPluginRemoteTerminalOutput,
  receivePluginRemoteTerminalFrame,
  receivePluginRemoteTerminalResponse,
  type Connection,
  type Geometry,
  type Callbacks
} from './plugin-remote-terminal-frames'
import type { WebContents } from 'electron'
import {
  TerminalStreamOpcode as Op,
  encodeTerminalStreamFrame,
  encodeTerminalStreamJson,
  encodeTerminalStreamText
} from '../../../shared/terminal/stream/terminal-stream-protocol'
import type { RemoteRuntimeTransportSubscription } from '../../../shared/remote-runtime/requests/remote-runtime-subscription-contract'
import type { RuntimeRpcResponse } from '../../../shared/remote-runtime/rpc/runtime-rpc-envelope'
import type { TerminalPluginPreviewTarget } from '../../../shared/terminal/stream/terminal-plugin-preview-contract'
import type { TerminalPreviewConnectResult } from '../../../shared/terminal/replay/terminal-preview'
import { encodePluginRemoteTerminalSubscribe } from './plugin-remote-terminal-subscribe'

const UNAVAILABLE: TerminalPreviewConnectResult = { snapshot: null, replay: [] }

export class PluginRemoteTerminalStream {
  private state: Connection | null = null
  private nextRequest = 0
  private desired: Geometry = null
  private inputClaimed = false
  private inputBytes = 0
  private retiredDisplayBytes = 0
  private inputTail = Promise.resolve(false)
  constructor(
    private readonly deps: {
      id: string
      contents: Pick<WebContents, 'id' | 'send' | 'isDestroyed'>
      runtimeId: string
      target: TerminalPluginPreviewTarget
      current: (interactive?: boolean) => boolean
      open: (
        callbacks: Callbacks,
        signal: AbortSignal
      ) => Promise<RemoteRuntimeTransportSubscription>
      retired: (reason?: 'profile_changed') => void
    }
  ) {}

  private send(
    state: Connection,
    opcode: Op,
    payload: Uint8Array<ArrayBufferLike> = new Uint8Array(),
    seq = 0
  ): boolean {
    return (
      this.state === state &&
      !state.closed &&
      !!state.socket?.sendBinary(
        encodeTerminalStreamFrame({
          opcode,
          streamId: opcode === Op.Subscribe ? 0 : 1,
          seq,
          payload
        })
      )
    )
  }
  private close(state: Connection): void {
    if (this.state === state) {
      this.retiredDisplayBytes += state.output.unacknowledgedBytes
      this.inputClaimed = false
      this.state = null
    }
    closePluginRemoteTerminalConnection(state)
  }
  dispose(): void {
    if (this.state) {
      this.close(this.state)
    }
    this.retiredDisplayBytes = 0
  }
  unsubscribe(): Promise<void> {
    this.dispose()
    return Promise.resolve()
  }
  input(data: string): Promise<boolean> {
    const state = this.state
    const bytes = Buffer.byteLength(data)
    if (!state?.negotiated || this.inputBytes + bytes > 256 * 1024) {
      return Promise.resolve(false)
    }
    this.inputBytes += bytes
    const send = async (): Promise<boolean> => {
      if (this.state !== state || !this.deps.current(true)) {
        return false
      }
      if (!this.inputClaimed) {
        const viewport = this.desired ?? state.grid
        if (!viewport || !(await this.fit(viewport.cols, viewport.rows))) {
          return false
        }
      }
      return (
        this.inputClaimed &&
        this.deps.current(true) &&
        this.send(state, Op.Input, encodeTerminalStreamText(data))
      )
    }
    this.inputTail = this.inputTail
      .catch(() => false)
      .then(send)
      .finally(() => {
        this.inputBytes -= bytes
      })
    return this.inputTail
  }
  ack(bytes: number): void {
    const retired = Math.min(this.retiredDisplayBytes, bytes)
    this.retiredDisplayBytes -= retired
    bytes -= retired
    const state = this.state
    if (!state || bytes === 0 || !this.deps.current()) {
      return
    }
    state.output.acknowledge(bytes)
    const wire = creditPluginRemoteTerminalOutput(state, bytes)
    if (wire) {
      this.send(state, Op.Ack, encodeTerminalStreamJson({ bytes: wire }))
    }
  }
  private geometry(opcode: Op, viewport?: { cols: number; rows: number }): Promise<Geometry> {
    const state = this.state
    if (
      !state?.negotiated ||
      state.geometry.size >= 8 ||
      !this.deps.current(opcode === Op.ClaimViewport)
    ) {
      return Promise.resolve(null)
    }
    const requestId = ++this.nextRequest
    return new Promise((finish) => {
      const timer = setTimeout(() => {
        state.geometry.delete(requestId)
        finish(null)
        this.close(state)
      }, 15000)
      state.geometry.set(requestId, { finish, timer })
      if (!this.send(state, opcode, encodeTerminalStreamJson(viewport ?? {}), requestId)) {
        clearTimeout(timer)
        state.geometry.delete(requestId)
        finish(null)
      }
    })
  }
  fit(cols: number, rows: number): Promise<Geometry> {
    const viewport = { cols, rows }
    this.desired = viewport
    return this.geometry(Op.ClaimViewport, viewport).then((result) => {
      if (this.desired !== viewport) {
        return null
      }
      this.inputClaimed = result !== null
      return result
    })
  }
  async releaseFit(): Promise<void> {
    this.desired = null
    this.inputClaimed = false
    await this.geometry(Op.ReleaseViewport)
  }

  connect(scrollbackRows = 24): Promise<TerminalPreviewConnectResult> {
    if (!this.deps.current()) {
      return Promise.resolve(UNAVAILABLE)
    }
    const existing = this.state
    if (!existing && this.retiredDisplayBytes > 0) {
      return Promise.resolve({ snapshot: null, replay: [], resyncRequired: true })
    }
    if (existing?.pending) {
      return new Promise((resolve) => {
        const finish = existing.pending!.finish
        existing.pending!.finish = (result) => {
          finish(result)
          resolve(result)
        }
      })
    }
    if (existing && existing.output.unacknowledgedBytes > 0) {
      existing.output.requestResync()
      return Promise.resolve({ snapshot: null, replay: [], resyncRequired: true })
    }
    const state: Connection = existing ?? {
      socket: null,
      controller: new AbortController(),
      grid: null,
      credits: [],
      creditBytes: 0,
      heldCreditBytes: 0,
      hasSnapshot: false,
      ready: false,
      negotiated: false,
      closed: false,
      output: createPluginRemoteTerminalOutput({ ...this.deps, closing: () => state.closed }),
      chunks: [],
      chunkBytes: 0,
      meta: null,
      pending: null,
      geometry: new Map()
    }
    if (existing) {
      // Parsed deliveries drained; retire discarded wire debt before starting the next output queue.
      if (state.creditBytes) {
        this.send(state, Op.Ack, encodeTerminalStreamJson({ bytes: state.creditBytes }))
      }
      state.credits = []
      state.creditBytes = 0
      state.output.dispose()
      state.output = createPluginRemoteTerminalOutput({ ...this.deps, closing: () => state.closed })
    }
    this.state = state
    const requestId = existing ? ++this.nextRequest : 0
    const pending = new Promise<TerminalPreviewConnectResult>((finish) => {
      const timer = setTimeout(() => this.close(state), 15000)
      state.pending = { id: requestId, finish, timer }
    })
    if (existing) {
      if (
        !this.send(
          state,
          Op.SnapshotRequest,
          encodeTerminalStreamJson({ requestId, scrollbackRows })
        )
      ) {
        this.close(state)
      }
    } else {
      void this.deps
        .open(
          {
            response: (response) => this.response(state, response),
            binary: (bytes) => this.binary(state, bytes),
            close: () => this.transportClosed(state)
          },
          state.controller.signal
        )
        .then((socket) => {
          if (this.state !== state || state.closed || !this.deps.current()) {
            socket.close()
            this.close(state)
            return
          }
          state.socket = socket
          this.subscribe(state)
        })
        .catch(() => this.close(state))
    }
    return pending.then(async (result) => {
      if (!existing && result.snapshot && this.desired && this.deps.current(true)) {
        await this.fit(this.desired.cols, this.desired.rows)
      }
      return { ...result, terminalInput: this.deps.target.input }
    })
  }
  private transportClosed(state: Connection): void {
    if (state.closed) {
      return
    }
    const reconnect = state.hasSnapshot && this.deps.current()
    this.close(state)
    if (reconnect && !this.deps.contents.isDestroyed()) {
      this.deps.contents.send('pluginTerminalSurface:data', { type: 'resync', ptyId: this.deps.id })
    }
  }
  private subscribe(state: Connection): void {
    if (!state.socket || !state.ready || state.negotiated) {
      return
    }
    this.send(
      state,
      Op.Subscribe,
      encodePluginRemoteTerminalSubscribe(this.deps.id, this.deps.target)
    )
  }
  private response(state: Connection, response: RuntimeRpcResponse<unknown>): void {
    receivePluginRemoteTerminalResponse(state, response, {
      active: () => this.state === state,
      current: () => this.deps.current(),
      runtimeId: this.deps.runtimeId,
      close: () => this.close(state),
      subscribe: () => this.subscribe(state),
      retired: this.deps.retired
    })
  }
  private binary(state: Connection, bytes: Uint8Array): void {
    receivePluginRemoteTerminalFrame(state, bytes, {
      current: () => this.state === state && this.deps.current(),
      close: () => this.transportClosed(state),
      send: (op, payload) => this.send(state, op, payload)
    })
  }
}
