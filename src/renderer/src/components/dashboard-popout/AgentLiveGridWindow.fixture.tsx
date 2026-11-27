import { useState } from 'react'
import { defineFixture } from '../../component-fixtures/component-fixture'
import type { DashboardCard } from '../../../../shared/agent-status/presentation/dashboard-snapshot'
import { AgentLiveGridHeader } from './AgentLiveGridHeader'
import { AgentLiveGridStateOutline } from './AgentLiveGridStateOutline'
import type { AgentDashboardLiveBorderColors } from '../../../../shared/agent-dashboard-live-layout'

function Window({
  state,
  colors
}: {
  state: 'attention' | 'failed' | 'done' | 'working' | 'idle'
  colors?: AgentDashboardLiveBorderColors
}): React.JSX.Element {
  const [pinned, setPinned] = useState(false)
  const card: DashboardCard = {
    paneKey: state,
    ptyId: state,
    agentType: 'codex',
    bucket: state === 'failed' ? 'done' : state,
    dotState: state === 'attention' ? 'waiting' : state === 'failed' ? 'done' : state,
    verdict: state === 'failed' ? 'failed' : undefined,
    task: state,
    repoId: 'repo',
    worktreeId: state,
    tabId: state,
    leafId: state,
    repoName: 'Orca',
    worktreeName: state,
    startedAt: 1,
    finishedAt: state === 'done' || state === 'failed' ? 2 : null,
    stateChangedAt: 2,
    unseen: true
  }
  return (
    <section className="relative flex h-64 min-w-0 flex-col overflow-hidden rounded-md border border-border bg-card">
      <AgentLiveGridStateOutline card={card} colors={colors} />
      <AgentLiveGridHeader
        card={card}
        pinned={pinned}
        onTogglePin={() => setPinned(!pinned)}
        title={
          state === 'failed'
            ? 'Failed build'
            : state === 'done'
              ? 'Completed build'
              : state === 'attention'
                ? 'Waiting for input'
                : state === 'working'
                  ? 'Updating upstream'
                  : 'Idle terminal'
        }
        subtitle=""
        editingPaneKey={null}
        nameDraft=""
        setNameDraft={() => {}}
        beginRename={() => {}}
        finishRename={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
        onOpenTerminal={() => {}}
        onRevealAgent={() => {}}
        onAssignWorkspaceStatus={() => {}}
        onMinimize={() => {}}
        onClose={() => {}}
      />
      <pre className="flex-1 overflow-hidden bg-background p-3 font-mono text-xs text-foreground">
        {state === 'failed'
          ? '$ pnpm build\nError: build failed.\n$'
          : state === 'done'
            ? '$ pnpm build\nBuild complete.\n$'
            : state === 'attention'
              ? '$ deploy\nContinue? [y/N]'
              : state === 'working'
                ? '$ git fetch stablyai\nReceiving objects…'
                : '$\nReady for a task.'}
      </pre>
    </section>
  )
}
export const states = defineFixture({
  width: 1800,
  render: () => (
    <div className="grid grid-cols-5 gap-2 p-2">
      <Window state="attention" />
      <Window state="failed" />
      <Window state="done" />
      <Window state="working" />
      <Window state="idle" />
    </div>
  ),
  interact: (frame) => {
    const button = frame.querySelector<HTMLButtonElement>(
      'button[aria-label="Pin window to this position"]'
    )
    button?.click()
  }
})
export const narrow = defineFixture({ width: 360, render: () => <Window state="done" /> })
export const narrowWorking = defineFixture({ width: 360, render: () => <Window state="working" /> })
export const narrowFailed = defineFixture({ width: 360, render: () => <Window state="failed" /> })
export const customColors = defineFixture({
  width: 1800,
  render: () => {
    const colors = { attention: '#3377cc', working: '#cc88ee', done: '#00aa88', failed: '#dd4488' }
    return (
      <div className="grid grid-cols-5 gap-2 p-2">
        <Window state="attention" colors={colors} />
        <Window state="failed" colors={colors} />
        <Window state="done" colors={colors} />
        <Window state="working" colors={colors} />
        <Window state="idle" colors={colors} />
      </div>
    )
  }
})
