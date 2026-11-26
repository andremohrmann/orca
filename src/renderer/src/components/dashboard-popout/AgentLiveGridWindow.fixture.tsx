import { useRef, useState } from 'react'
import { defineFixture } from '../../component-fixtures/component-fixture'
import type { DashboardCard } from '../../../../shared/agent-status/presentation/dashboard-snapshot'
import { AgentLiveGridHeader } from './AgentLiveGridHeader'
import { AgentLiveGridStateOutline } from './AgentLiveGridStateOutline'

function Window({ state }: { state: 'attention' | 'done' | 'working' }): React.JSX.Element {
  const [pinned, setPinned] = useState(false)
  const cancelRenameRef = useRef(false)
  const card: DashboardCard = {
    paneKey: state,
    ptyId: state,
    agentType: 'codex',
    bucket: state,
    dotState: state === 'attention' ? 'waiting' : state,
    task: state,
    repoId: 'repo',
    worktreeId: state,
    tabId: state,
    leafId: state,
    repoName: 'Orca',
    worktreeName: state,
    startedAt: 1,
    finishedAt: state === 'done' ? 2 : null,
    stateChangedAt: 2,
    unseen: true
  }
  return (
    <section className="relative flex h-64 min-w-0 flex-col overflow-hidden rounded-md border border-border bg-card">
      <AgentLiveGridStateOutline card={card} />
      <AgentLiveGridHeader
        card={card}
        pinned={pinned}
        onTogglePin={() => setPinned(!pinned)}
        title={
          state === 'done'
            ? 'Completed build'
            : state === 'attention'
              ? 'Waiting for input'
              : 'Updating upstream'
        }
        subtitle=""
        editingPaneKey={null}
        nameDraft=""
        setNameDraft={() => {}}
        beginRename={() => {}}
        finishRename={() => {}}
        cancelRenameRef={cancelRenameRef}
        onDragStart={() => {}}
        onDragEnd={() => {}}
        onOpenTerminal={() => {}}
        onRevealAgent={() => {}}
        onAssignWorkspaceStatus={() => {}}
        onMinimize={() => {}}
        onClose={() => {}}
      />
      <pre className="flex-1 overflow-hidden bg-background p-3 font-mono text-xs text-foreground">
        {state === 'done'
          ? '$ pnpm build\nBuild complete.\n$'
          : state === 'attention'
            ? '$ deploy\nContinue? [y/N]'
            : '$ git fetch stablyai\nReceiving objects…'}
      </pre>
    </section>
  )
}
export const states = defineFixture({
  width: 1140,
  render: () => (
    <div className="grid grid-cols-3 gap-2 p-2">
      <Window state="attention" />
      <Window state="done" />
      <Window state="working" />
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
