import { useEffect } from 'react'
import type { Terminal } from '@xterm/xterm'
import type { MacOptionAsAlt } from '@/components/terminal-pane/terminal-shortcut-policy'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { buildPreviewAppearanceOptions } from './preview-terminal-options'
import { syncPreviewTerminalLigatures } from './preview-terminal-ligatures'

export function usePreviewTerminalAppearance({
  terminalRef,
  settings,
  macOptionAsAlt
}: {
  terminalRef: React.MutableRefObject<Terminal | null>
  settings: GlobalSettings | null
  macOptionAsAlt: MacOptionAsAlt
}): void {
  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) {
      return
    }
    Object.assign(
      terminal.options,
      buildPreviewAppearanceOptions(settings, macOptionAsAlt === 'true')
    )
    syncPreviewTerminalLigatures(terminal, settings)
  }, [terminalRef, settings, macOptionAsAlt])
}
