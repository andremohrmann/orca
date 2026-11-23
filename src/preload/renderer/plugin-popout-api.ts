import type { PreloadApi } from '../api-types'

export const PLUGIN_POPOUT_ARGUMENT = '--orca-plugin-popout'

/** The trusted panel container needs presentation reads and session-scoped transports only. */
export function pluginPopoutApi(api: PreloadApi) {
  return {
    platform: api.platform,
    ui: {
      readClipboardText: api.ui.readClipboardText,
      writeTerminalClipboardText: api.ui.writeTerminalClipboardText,
      onAppMenuPaste: api.ui.onAppMenuPaste,
      onAppMenuSelectionAction: api.ui.onAppMenuSelectionAction
    },
    app: { getSystemLanguageDetection: api.app.getSystemLanguageDetection },
    settings: {
      get: api.settings.get,
      getSync: api.settings.getSync,
      onChanged: api.settings.onChanged
    },
    plugins: {
      list: api.plugins.list,
      listThemes: api.plugins.listThemes,
      listTerminalThemes: api.plugins.listTerminalThemes,
      listLanguagePacks: api.plugins.listLanguagePacks,
      readPanelEntry: api.plugins.readPanelEntry,
      panelAction: api.plugins.panelAction,
      panelState: api.plugins.panelState,
      panelImage: api.plugins.panelImage,
      subscribePanelPush: api.plugins.subscribePanelPush,
      onChanged: api.plugins.onChanged
    },
    terminalPreview: { pluginSurface: api.terminalPreview.pluginSurface }
  }
}
