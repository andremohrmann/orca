import type { Terminal } from '@xterm/xterm'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import {
  executeTerminalPastePlan,
  planTerminalPasteWithYield,
  type TerminalPasteTextOptions
} from '@/components/terminal-pane/terminal-paste-coordinator'
import { resolveTerminalPasteRuntime } from '@/components/terminal-pane/terminal-paste-runtime'
import { pasteTerminalText } from '@/components/terminal-pane/terminal-bracketed-paste'
import { pasteTerminalClipboard } from '@/components/terminal-pane/terminal-clipboard-paste'
import { getRemoteRuntimePtyEnvironmentId } from '@/runtime/runtime-terminal-stream'
import { parseAppSshPtyId } from '../../../../shared/ssh-pty-id'
import type {
  DashboardCardTerminalInput,
  DashboardCardTerminalLinks
} from '../../../../shared/dashboard-snapshot'

export type PreviewTerminalPasteSource = 'keyboard' | 'app-menu' | 'right-click'

/**
 * Clipboard paste for the preview terminal, on the pane's coordinator: large
 * pastes stream as bounded IPC payloads, and the plan re-checks that the same
 * terminal still owns focus between chunks.
 */
export function createPreviewClipboardPaster(deps: {
  ptyId: string
  container: HTMLElement
  getTerminal: () => Terminal | null
  getTerminalInput: () => DashboardCardTerminalInput | null
  getTerminalLinks: () => DashboardCardTerminalLinks | null
  writePty: (data: string) => boolean | Promise<boolean>
  isDisposed: () => boolean
}): (activeElementAtDispatch: Element | null, source: PreviewTerminalPasteSource) => Promise<void> {
  return async (activeElementAtDispatch, source) => {
    const pasteTerminal = deps.getTerminal()
    if (!pasteTerminal) {
      return
    }
    const targetIsCurrent = (): boolean =>
      !deps.isDisposed() &&
      deps.getTerminal() === pasteTerminal &&
      activeElementAtDispatch !== null &&
      document.activeElement === activeElementAtDispatch &&
      deps.container.contains(activeElementAtDispatch)
    if (!targetIsCurrent()) {
      return
    }
    const pasteText = async (
      text: string,
      options?: TerminalPasteTextOptions
    ): Promise<boolean> => {
      const terminalInput = deps.getTerminalInput()
      const platform = terminalInput?.hostPlatform ?? getShortcutPlatform()
      const plan = await planTerminalPasteWithYield({
        text,
        source,
        target: {
          kind: 'terminal',
          paneId: 0,
          leafId: deps.ptyId,
          ptyId: deps.ptyId,
          runtime: resolveTerminalPasteRuntime({
            platform,
            ptyId: deps.ptyId,
            connectionId: parseAppSshPtyId(deps.ptyId)?.connectionId ?? null
          })
        },
        forceBracketedPaste: options?.forceBracketedPaste,
        forceBracketedPasteForMultiline:
          options?.forceBracketedPasteForMultiline ??
          terminalInput?.forceBracketedMultilineTextPaste,
        windowsInputRecordNewline:
          options?.windowsInputRecordNewline ?? terminalInput?.windowsInputRecordPasteNewline,
        terminalBracketedPasteMode: pasteTerminal.modes.bracketedPasteMode
      })
      const execution = await executeTerminalPastePlan(plan, {
        // Why: stream large pastes so neither terminal transport receives one huge payload.
        pasteText: (value, pasteOptions) => pasteTerminalText(pasteTerminal, value, pasteOptions),
        writePty: deps.writePty,
        isTargetCurrent: targetIsCurrent,
        // Why: if focus changes mid-bracketed paste, the closing marker must still reach the live PTY.
        canContinue: () => true
      })
      return execution.status === 'pasted'
    }
    const links = deps.getTerminalLinks()
    await pasteTerminalClipboard({
      readClipboardText: window.api.ui.readClipboardText,
      saveClipboardImageAsTempFile: window.api.ui.saveClipboardImageAsTempFile,
      pasteText,
      connectionId: parseAppSshPtyId(deps.ptyId)?.connectionId ?? null,
      runtimeEnvironmentId:
        links?.runtimeEnvironmentId ?? getRemoteRuntimePtyEnvironmentId(deps.ptyId)
    })
  }
}
