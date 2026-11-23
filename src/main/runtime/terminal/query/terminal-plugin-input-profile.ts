import { release as osRelease } from 'node:os'
import {
  TUI_AGENT_CONFIG,
  isTuiAgent
} from '../../../../shared/agent-launch/catalog/tui-agent-config'
import type { TerminalPluginPreviewTarget } from '../../../../shared/terminal/stream/terminal-plugin-preview-contract'
import type { RuntimePtyWorktreeRecord } from '../records/runtime-terminal-state-records'

export function buildPluginTerminalPreviewTarget(
  handle: string,
  pty: Pick<
    RuntimePtyWorktreeRecord,
    | 'connected'
    | 'incarnationId'
    | 'foregroundAgent'
    | 'connectionId'
    | 'isWsl'
    | 'launchAgent'
    | 'worktreeId'
  >,
  metadata: { hostPlatform?: NodeJS.Platform }
): TerminalPluginPreviewTarget | null {
  if (!pty.connected || !pty.incarnationId) {
    return null
  }
  const hostPlatform = metadata.hostPlatform
  if (!hostPlatform) {
    return null
  }
  const agent = isTuiAgent(pty.foregroundAgent) ? pty.foregroundAgent : null
  const config = agent ? TUI_AGENT_CONFIG[agent] : null
  const localWindowsConpty = hostPlatform === 'win32' && !pty.connectionId && !pty.isWsl
  const newline = hostPlatform === 'win32' ? config?.windowsInputRecordPasteNewline : undefined
  const result = {
    contract: 'terminal.plugin-preview.v1' as const,
    terminal: handle,
    worktreeId: pty.worktreeId,
    incarnationId: pty.incarnationId,
    hostPlatform,
    input: {
      hostPlatform,
      localWindowsConpty,
      ...(localWindowsConpty ? { osRelease: osRelease() } : {}),
      windowsShiftEnterEncoding: config?.windowsShiftEnterEncoding ?? ('alt-enter' as const),
      ctrlEnterCsiU: config?.ctrlEnterEncoding === 'csi-u',
      kittyKeyboardAdvertised: !localWindowsConpty || (agent ?? pty.launchAgent) === 'grok',
      ...(newline
        ? { windowsInputRecordPasteNewline: newline }
        : agent || hostPlatform === 'win32'
          ? { forceBracketedMultilineTextPaste: true as const }
          : {})
    }
  }
  return {
    ...result,
    profileKey: JSON.stringify(Object.entries(result.input).sort(([a], [b]) => a.localeCompare(b)))
  }
}
