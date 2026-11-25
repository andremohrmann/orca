import { createHostTwinFixture } from '@/store/workspaces/host-isolation/host-twin.test-fixture'
import { makeStructuredChatTab } from '@/store/slices/tabs/tab-group.test-fixture'
import { projectStatus } from '@/components/native-chat/session/status/structured-agent-session-status-projection'
import { isStructuredTab } from '../../../../../shared/agent-session/view/structured-agent-session-tab'

export function createCanonicalPresentationFixture(count = 101, excerpt?: string) {
  const fixture = createHostTwinFixture('local+ssh')
  const { store, workspaceKey } = fixture
  const now = Date.now()
  const tabs = Array.from({ length: count }, (_, index) =>
    makeStructuredChatTab({
      id: `integration-chat-${index}`,
      entityId: `integration-session-${index}`,
      worktreeId: workspaceKey,
      executionHostId: 'local',
      agentSessionAgent: 'codex'
    })
  )
  store.setState({
    tabsByWorktree: {},
    ptyIdsByTabId: {},
    terminalLayoutsByTabId: {},
    unifiedTabsByWorktree: { [workspaceKey]: tabs }
  })
  store.getState().transactAgentStatuses((transaction) => {
    for (const tab of tabs) {
      if (!isStructuredTab(tab)) {
        throw new Error('Invalid structured fixture')
      }
      projectStatus(
        transaction,
        tab,
        {
          sessionId: tab.entityId,
          workspaceId: workspaceKey,
          agent: 'codex',
          status: 'working',
          latestPrompt: excerpt ?? `Task ${tab.id}`,
          lastAssistantMessage: excerpt,
          updatedAt: now,
          hostExecutionOwned: true
        },
        'live',
        null
      )
    }
  })
  return { store, workspaceKey, now }
}
