import { usePluginFontLoadKey } from '@/store/plugins/appearance/plugin-fonts'
import { useEffect } from 'react'
import type { Terminal } from '@xterm/xterm'
import type { MacOptionAsAlt } from '@/components/terminal-pane/input/keyboard/terminal-option-shortcut-policy'
import type { GlobalSettings } from '../../../../shared/settings/global-settings-types'
import { buildPreviewAppearanceOptions } from '../standalone-terminal/rendering/preview-terminal-options'
import { syncPreviewTerminalLigatures } from '../standalone-terminal/rendering/preview-terminal-ligatures'

export function usePreviewTerminalAppearance({
  terminalRef,
  settings,
  macOptionAsAlt
}: {
  terminalRef: React.MutableRefObject<Terminal | null>
  settings: GlobalSettings | null
  macOptionAsAlt: MacOptionAsAlt
}): void {
  const fontLoadKey = usePluginFontLoadKey(settings?.terminalFontFamily)
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
  }, [terminalRef, settings, macOptionAsAlt, fontLoadKey])
}
