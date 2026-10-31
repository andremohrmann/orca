import { Suspense, useEffect, useRef } from 'react'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import { AgentHibernationGate } from '../components/AgentHibernationGate'
import { AiVaultTabTitleSyncGate } from '../components/AiVaultTabTitleSyncGate'
import RetainedAgentsSyncGate from '../components/dashboard/RetainedAgentsSyncGate'
import { WorkspacePortScanner } from '../components/ports/WorkspacePortScanner'
import { SavedHostScopeWidenGate } from '../components/sidebar/SavedHostScopeWidenGate'
import { MacosTccPromptNoticeHost } from '../hooks/MacosTccPromptNoticeHost'
import { useAppStore } from '../store'
import { ActiveWorkspaceSyncGate } from './ActiveWorkspaceSyncGate'
import { StructuredAgentSessionAttentionBridge } from '../components/native-chat/StructuredAgentSessionAttentionBridge'
import { StructuredAgentSessionStatusBridge } from '../components/native-chat/StructuredAgentSessionStatusBridge'

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
      <ActiveWorkspaceSyncGate />
      {/* Keep permission notices available across app surfaces. */}
      <MacosTccPromptNoticeHost />
      {/* Keep agent-status retention subscriptions out of the App render tree. */}
      <RetainedAgentsSyncGate />
      <AiVaultTabTitleSyncGate />
      <SavedHostScopeWidenGate />
      {dashboardPopoutEnabled ? (
        <Suspense fallback={null}>
          <DashboardPopoutBridge />
        </Suspense>
      ) : null}
      <AgentDashboardStartupGate />
      <AgentHibernationGate />
      <StructuredAgentSessionStatusBridge />
      {/* Background chats have no mounted pane but still need completion attention. */}
      <StructuredAgentSessionAttentionBridge />
    </>
  )
}
