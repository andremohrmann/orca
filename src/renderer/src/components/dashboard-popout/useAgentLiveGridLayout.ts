import { useCallback, useMemo } from 'react'
import { useAppStore } from '@/store'
import {
  normalizeAgentDashboardLiveLayout,
  type AgentDashboardLiveLayout
} from '../../../../shared/agent-dashboard-live-layout'

export function useAgentLiveGridLayout(): [
  AgentDashboardLiveLayout,
  (update: (current: AgentDashboardLiveLayout) => AgentDashboardLiveLayout) => void
] {
  const storedLayout = useAppStore((state) => state.settings?.experimentalAgentDashboardLiveLayout)
  const layout = useMemo(() => normalizeAgentDashboardLiveLayout(storedLayout), [storedLayout])

  const saveLayout = useCallback(
    (update: (current: AgentDashboardLiveLayout) => AgentDashboardLiveLayout): void => {
      const { settings, updateSettings } = useAppStore.getState()
      const next = normalizeAgentDashboardLiveLayout(
        update(normalizeAgentDashboardLiveLayout(settings?.experimentalAgentDashboardLiveLayout))
      )
      if (settings) {
        useAppStore.setState({
          settings: { ...settings, experimentalAgentDashboardLiveLayout: next }
        })
      }
      void updateSettings({ experimentalAgentDashboardLiveLayout: next })
    },
    []
  )

  return [layout, saveLayout]
}
