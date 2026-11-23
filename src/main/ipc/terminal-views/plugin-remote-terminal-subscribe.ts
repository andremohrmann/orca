import { encodeTerminalStreamJson } from '../../../shared/terminal/stream/terminal-stream-protocol'
import type { TerminalPluginPreviewTarget } from '../../../shared/terminal/stream/terminal-plugin-preview-contract'

export function encodePluginRemoteTerminalSubscribe(
  id: string,
  target: TerminalPluginPreviewTarget
): Uint8Array {
  return encodeTerminalStreamJson({
    streamId: 1,
    terminal: target.terminal,
    previewTarget: {
      worktreeId: target.worktreeId,
      incarnationId: target.incarnationId,
      profileKey: target.profileKey
    },
    client: { id: `plugin-preview:${id}`, type: 'desktop' },
    capabilities: { ackOutput: 1, desktopViewportClaims: 1, viewportLease: 1 }
  })
}
