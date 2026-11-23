import './assets/main.css'
import { useEffect } from 'react'
import PluginPanel from './components/right-sidebar/plugin-panels/PluginPanel'
import { I18nProvider } from './i18n/I18nProvider'
import { getOrCreateRendererRoot } from './app-shell/startup/react-renderer-root'
import { applyStartupAppTheme, useAppThemePaint } from './app-shell/appearance/use-app-theme-paint'
import { useAppStore } from './store'
import { usePluginPanelsStore } from './store/plugins/catalog/plugin-contribution-catalog'
import { pluginPanelTabKey } from '../../shared/plugins/frames/plugin-tab-key'
import { buildAppFontFamily } from './app-shell/appearance/app-font-family'
import { applyCodeFontSmoothing } from './lib/editor/appearance/code-font-smoothing'
import { handleAppMenuPasteRequest } from './lib/clipboard/menu/app-menu-paste'
import { dispatchAppMenuSelectionAction } from './lib/app-commands/app-menu-selection-actions'

const params = new URLSearchParams(window.location.search)
const tabKey = pluginPanelTabKey(params.get('pluginKey') ?? '', params.get('panelId') ?? '')
const settings = window.api.settings.getSync()
useAppStore.setState({ settings })
applyStartupAppTheme(settings)

function PluginPopout(): React.JSX.Element {
  useAppThemePaint()
  useEffect(() => {
    const offPaste = window.api.ui.onAppMenuPaste(() => {
      void handleAppMenuPasteRequest({
        readClipboardText: window.api.ui.readClipboardText,
        performNativePaste: () => undefined
      }).catch(() => undefined)
    })
    const offSelection = window.api.ui.onAppMenuSelectionAction((action) => {
      dispatchAppMenuSelectionAction(action)
    })
    return () => {
      offPaste()
      offSelection()
    }
  }, [])
  const currentSettings = useAppStore((state) => state.settings)
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--app-font-family',
      buildAppFontFamily(currentSettings?.appFontFamily)
    )
    applyCodeFontSmoothing(currentSettings?.codeFontSmoothing)
  }, [currentSettings?.appFontFamily, currentSettings?.codeFontSmoothing])
  useEffect(() => {
    const refresh = (): void => {
      void usePluginPanelsStore.getState().fetchPlugins()
    }
    refresh()
    const offPlugins = window.api.plugins.onChanged(refresh)
    const offSettings = window.api.settings.onChanged((updates) => {
      const current = useAppStore.getState().settings
      if (current) {
        useAppStore.setState({ settings: { ...current, ...updates } })
      }
    })
    return () => {
      offPlugins()
      offSettings()
    }
  }, [])
  return (
    <main className="flex h-screen min-h-0 flex-col bg-background text-foreground">
      <PluginPanel tabKey={tabKey} />
    </main>
  )
}

const root = document.getElementById('root')
if (!root) {
  throw new Error('Plugin popout root missing')
}
getOrCreateRendererRoot(root, import.meta.hot?.data).render(
  <I18nProvider>
    <PluginPopout />
  </I18nProvider>
)
