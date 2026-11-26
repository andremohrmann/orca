import type { Terminal } from '@xterm/xterm'
import type { GlobalSettings } from '../../../../shared/settings/global-settings-types'
import { installPreviewTerminalCompatibility } from '../standalone-terminal/rendering/preview-terminal-compatibility'
import { installPreviewTerminalLinks } from './live-view-terminal-links'

export function installLiveViewTerminalCompatibility(
  terminal: Terminal,
  deps: Parameters<typeof installPreviewTerminalLinks>[1] & {
    getSettings: () => GlobalSettings | null
  }
): () => void {
  return installPreviewTerminalCompatibility(terminal, {
    getSettings: deps.getSettings,
    installLinks: (target) => installPreviewTerminalLinks(target, deps)
  })
}
