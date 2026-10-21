import { useCallback, useEffect, useState } from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import {
  normalizeAgentDashboardLiveLayout,
  type AgentDashboardLiveLayout
} from '../../../../shared/agent-dashboard-live-layout'

export function useAgentLiveGridLayout(): [
  AgentDashboardLiveLayout,
  (update: (current: AgentDashboardLiveLayout) => AgentDashboardLiveLayout) => void
] {
  const [layout, setLayout] = useState<AgentDashboardLiveLayout>(() =>
    normalizeAgentDashboardLiveLayout(null)
  )

  useEffect(() => {
    let disposed = false
    void window.api.settings.get().then((settings) => {
      if (!disposed) {
        setLayout(
          normalizeAgentDashboardLiveLayout(
            (settings as GlobalSettings).experimentalAgentDashboardLiveLayout
          )
        )
      }
    })
    const dispose = window.api.settings.onChanged((updates) => {
      if ('experimentalAgentDashboardLiveLayout' in updates) {
        setLayout(normalizeAgentDashboardLiveLayout(updates.experimentalAgentDashboardLiveLayout))
      }
    })
    return () => {
      disposed = true
      dispose()
    }
  }, [])

  const saveLayout = useCallback(
    (update: (current: AgentDashboardLiveLayout) => AgentDashboardLiveLayout): void => {
      setLayout((current) => {
        const next = normalizeAgentDashboardLiveLayout(update(current))
        void window.api.settings.set({ experimentalAgentDashboardLiveLayout: next })
        return next
      })
    },
    []
  )

  return [layout, saveLayout]
}
