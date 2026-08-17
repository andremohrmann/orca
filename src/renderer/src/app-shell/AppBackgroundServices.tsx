import { Suspense, useEffect, useRef } from 'react'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import { AgentHibernationGate } from '../components/AgentHibernationGate'
import { AiVaultTabTitleSyncGate } from '../components/AiVaultTabTitleSyncGate'
import RetainedAgentsSyncGate from '../components/dashboard/RetainedAgentsSyncGate'
import { WorkspacePortScanner } from '../components/ports/WorkspacePortScanner'
import { MacosTccPromptNoticeHost } from '../hooks/MacosTccPromptNoticeHost'
import { useAppStore } from '../store'

const DashboardPopoutBridge = lazy(() => import('../components/dashboard/DashboardPopoutBridge'))

function AgentDashboardStartupGate(): null {
  const handledRef = useRef(false)
  const settings = useAppStore((s) => s.settings)
  const setAgentDashboardDrawerOpen = useAppStore((s) => s.setAgentDashboardDrawerOpen)

  useEffect(() => {
    if (handledRef.current || !settings) {
      return
    }
    handledRef.current = true
    if (
      settings.experimentalAgentDashboardPopout !== true ||
      settings.experimentalAgentDashboardOpenLiveOnStartup !== true
    ) {
      return
    }
    if (settings.experimentalAgentDashboardMode === 'popout') {
      void window.api.dashboard.openPopout?.('live')
      return
    }
    setAgentDashboardDrawerOpen(true, 'live')
  }, [settings, setAgentDashboardDrawerOpen])

  return null
}

/**
 * App-level gates that render nothing. Each lives here rather than inside the surface that
 * needs it so its high-churn store subscriptions stay out of the App render tree.
 */
export function AppBackgroundServices(): React.JSX.Element {
  const workspaceSessionReady = useAppStore((s) => s.workspaceSessionReady)
  const dashboardPopoutEnabled = useAppStore(
    (s) => s.settings?.experimentalAgentDashboardPopout === true
  )

  return (
    <>
      <WorkspacePortScanner enabled={workspaceSessionReady} />
      {/* Why: plugin language-pack discovery must not re-render the App shell. */}
      <MacosTccPromptNoticeHost />
      {/* Why: leaf-mounted retention sync keeps agent-status subscriptions out of the App render tree. */}
      <RetainedAgentsSyncGate />
      <AiVaultTabTitleSyncGate />
      {dashboardPopoutEnabled ? (
        <Suspense fallback={null}>
          <DashboardPopoutBridge />
        </Suspense>
      ) : null}
      <AgentDashboardStartupGate />
      <AgentHibernationGate />
    </>
  )
}
