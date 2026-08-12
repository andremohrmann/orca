import { Terminal, type ITheme } from '@xterm/xterm'
import type { DashboardCardTerminalInput } from '../../../../shared/dashboard-snapshot'
import type { GlobalSettings } from '../../../../shared/types'
import { buildPreviewTerminalOptions } from './preview-terminal-options'

export const PREVIEW_SCROLLBACK_BUFFER_ROWS = 1000
export const PREVIEW_SCROLLBACK_ROWS = PREVIEW_SCROLLBACK_BUFFER_ROWS
export const FALLBACK_COLS = 80
export const FALLBACK_ROWS = 24
export type PreviewTerminalTimer = ReturnType<typeof setTimeout> | null

type PreviewSnapshot = {
  cols?: number | null
  rows?: number | null
  scrollbackAnsi?: string | null
  data?: string | null
  pendingEscapeTailAnsi?: string | null
}

export function clampPreviewTerminalGrid(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function clearPreviewTerminalTimer(timer: PreviewTerminalTimer): void {
  if (timer) {
    clearTimeout(timer)
  }
}

export function ensurePreviewTerminal(args: {
  terminal: Terminal | null
  container: HTMLElement
  snap: PreviewSnapshot
  replaceExisting: boolean
  settings: GlobalSettings | null
  terminalInput: DashboardCardTerminalInput | null
  macOptionIsMeta: boolean
  theme: ITheme | null
  themeMode: 'dark' | 'light'
}): { terminal: Terminal | null; created: boolean } {
  if (!args.terminal) {
    const terminal = new Terminal(
      buildPreviewTerminalOptions({
        settings: args.settings,
        terminalInput: args.terminalInput,
        macOptionIsMeta: args.macOptionIsMeta,
        theme: args.theme,
        themeMode: args.themeMode,
        cols: clampPreviewTerminalGrid(args.snap.cols ?? FALLBACK_COLS, 2, 500),
        rows: clampPreviewTerminalGrid(args.snap.rows ?? FALLBACK_ROWS, 2, 200),
        scrollback: PREVIEW_SCROLLBACK_BUFFER_ROWS
      })
    )
    try {
      terminal.open(args.container)
    } catch {
      terminal.dispose()
      return { terminal: null, created: false }
    }
    return { terminal, created: true }
  }
  if (args.replaceExisting) {
    args.terminal.resize(
      clampPreviewTerminalGrid(args.snap.cols ?? FALLBACK_COLS, 2, 500),
      clampPreviewTerminalGrid(args.snap.rows ?? FALLBACK_ROWS, 2, 200)
    )
    args.terminal.reset()
  }
  return { terminal: args.terminal, created: false }
}
