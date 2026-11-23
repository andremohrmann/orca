import type { ValidDiscoveredPlugin } from '../discovery/plugin-discovery'
import type { PluginPanelSessionBinding } from './panel-lifetime/plugin-panel-sessions'

export function findFrameContribution(
  plugin: ValidDiscoveredPlugin,
  surface: PluginPanelSessionBinding['surface'],
  id: string
): { entry: string; ui?: string; frame?: string } | null {
  const list =
    surface === 'panel'
      ? plugin.manifest.contributes.panels
      : plugin.manifest.contributes.customEditors
  return list.find((entry) => entry.id === id) ?? null
}
