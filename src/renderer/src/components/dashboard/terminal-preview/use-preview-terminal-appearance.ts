import { useEffect, type RefObject } from 'react'
import type { Terminal } from '@xterm/xterm'
import type { GlobalSettings } from '../../../../../shared/settings/global-settings-types'
import { buildPreviewAppearanceOptions } from '../../standalone-terminal/rendering/preview-terminal-options'
import { syncPreviewTerminalLigatures } from '../../standalone-terminal/rendering/preview-terminal-ligatures'

export function usePreviewTerminalAppearance(
  terminalRef: RefObject<Terminal | null>,
  settings: GlobalSettings | null,
  terminalFontLoadKey: string,
  macOptionIsMeta: boolean
): void {
  useEffect(() => {
    const terminal = terminalRef.current
    if (terminal) {
      Object.assign(terminal.options, buildPreviewAppearanceOptions(settings, macOptionIsMeta))
      syncPreviewTerminalLigatures(terminal, settings)
    }
  }, [terminalRef, settings, terminalFontLoadKey, macOptionIsMeta])
}
