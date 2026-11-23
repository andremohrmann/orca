import {
  TerminalStreamOpcode,
  encodeTerminalStreamJson,
  type TerminalStreamFrame
} from '../../../../../shared/terminal/stream/terminal-stream-protocol'
import {
  applyAttachedTerminalViewport,
  decodeTerminalViewportFrame
} from './terminal-stream-viewport-lease'
import { chainPassiveDesktopResize, updateViewportForClient } from './terminal-viewport-update'
import {
  isMultiplexStreamAttached,
  type TerminalMultiplexConnection
} from './terminal-multiplex-connection'
import type { TerminalMultiplexStream, TerminalViewportClient } from './terminal-stream-types'

export async function applyMultiplexStreamViewport(
  state: TerminalMultiplexConnection,
  stream: TerminalMultiplexStream,
  client: TerminalViewportClient,
  viewport: { cols: number; rows: number }
) {
  const { runtime } = state
  const apply = () =>
    updateViewportForClient(
      runtime,
      stream.ptyId,
      stream.remoteDesktopSubscriptionKey,
      client,
      viewport,
      stream.isMobile ? 'mobile' : 'desktop',
      'register',
      !stream.supportsDesktopViewportClaims
    )
  if (stream.isMobile) {
    return apply()
  }
  const applied = await applyAttachedTerminalViewport({
    isAttached: () => isMultiplexStreamAttached(state, stream),
    apply: async () => (await apply()).applied,
    release: () =>
      runtime.unregisterRemoteDesktopViewer(stream.ptyId, stream.remoteDesktopSubscriptionKey)
  })
  return { updated: applied, applied }
}

export function handleMultiplexViewportFrame(
  state: TerminalMultiplexConnection,
  stream: TerminalMultiplexStream,
  frame: TerminalStreamFrame
): boolean {
  if (
    ![
      TerminalStreamOpcode.Resize,
      TerminalStreamOpcode.ClaimViewport,
      TerminalStreamOpcode.ReleaseViewport
    ].includes(frame.opcode)
  ) {
    return false
  }
  const { runtime } = state
  const handle = (): void => {
    if (frame.opcode === TerminalStreamOpcode.Resize && stream.client) {
      const viewport = decodeTerminalViewportFrame(frame.payload)
      if (!viewport) {
        return
      }
      // Register stream geometry for detach cleanup; older clients cannot claim explicitly.
      if (!stream.isMobile && stream.client?.id) {
        stream.registeredRemoteDesktopDriver = true
        if (stream.buffering) {
          stream.pendingRemoteDesktopViewport = viewport
          return
        }
      }
      stream.desktopClaimTail = chainPassiveDesktopResize(
        stream.desktopClaimTail,
        stream.supportsDesktopViewportClaims,
        () => applyMultiplexStreamViewport(state, stream, stream.client!, viewport)
      )
      return
    }
    if (stream.supportsViewportLease && frame.opcode === TerminalStreamOpcode.ReleaseViewport) {
      stream.desktopClaimTail = stream.desktopClaimTail
        .then(async () => {
          if (!isMultiplexStreamAttached(state, stream)) {
            return false
          }
          await runtime.unregisterRemoteDesktopViewer(
            stream.ptyId,
            stream.remoteDesktopSubscriptionKey
          )
          stream.registeredRemoteDesktopDriver = false
          if (isMultiplexStreamAttached(state, stream)) {
            state.sendFrame(
              stream.streamId,
              TerminalStreamOpcode.ViewportAck,
              encodeTerminalStreamJson({ requestId: frame.seq, released: true, applied: false })
            )
          }
          return false
        })
        .catch(() => false)
      return
    }
    if (frame.opcode === TerminalStreamOpcode.ClaimViewport && stream.client && !stream.isMobile) {
      const viewport = decodeTerminalViewportFrame(frame.payload)
      if (!viewport) {
        return
      }
      stream.registeredRemoteDesktopDriver = true
      const claim = () =>
        applyAttachedTerminalViewport({
          isAttached: () => isMultiplexStreamAttached(state, stream),
          release: () =>
            runtime.unregisterRemoteDesktopViewer(
              stream.ptyId,
              stream.remoteDesktopSubscriptionKey
            ),
          apply: () =>
            runtime.updateRemoteDesktopViewer(
              stream.ptyId,
              stream.remoteDesktopSubscriptionKey,
              stream.client!.id,
              viewport.cols,
              viewport.rows,
              true
            )
        })
      const acknowledgedClaim = async (): Promise<boolean> => {
        const applied = await claim()
        if (stream.supportsViewportLease && isMultiplexStreamAttached(state, stream)) {
          state.sendFrame(
            stream.streamId,
            TerminalStreamOpcode.ViewportAck,
            encodeTerminalStreamJson({
              requestId: frame.seq,
              applied,
              ...runtime.getTerminalSize(stream.ptyId)
            })
          )
        }
        return applied
      }
      stream.desktopClaimTail = stream.desktopClaimTail
        .then(acknowledgedClaim, acknowledgedClaim)
        .catch(() => false)
    }
  }
  handle()
  return true
}
