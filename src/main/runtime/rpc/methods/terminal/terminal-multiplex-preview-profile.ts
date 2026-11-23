import type { TerminalMultiplexConnection } from './terminal-multiplex-connection'
import type { TerminalMultiplexStream } from './terminal-stream-types'

export function retireChangedTerminalPreviewProfile(
  state: TerminalMultiplexConnection,
  stream: TerminalMultiplexStream
): boolean {
  if (state.closed || state.streams.get(stream.streamId) !== stream) {
    return true
  }
  if (!stream.supportsViewportLease) {
    return false
  }
  const target = state.runtime.describePluginTerminalSurface(stream.terminal)
  const sameOwner =
    !!target &&
    target.worktreeId === stream.previewTarget?.worktreeId &&
    target.incarnationId === stream.previewTarget?.incarnationId
  if (sameOwner && target.profileKey === stream.previewTarget?.profileKey) {
    return false
  }
  state.detachStream(stream.streamId, null)
  state.emit({
    type: sameOwner ? 'preview-profile-changed' : 'preview-owner-retired',
    streamId: stream.streamId
  })
  return true
}
