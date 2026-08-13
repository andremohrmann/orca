// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import type React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { DashboardCard } from '../../../../shared/dashboard-snapshot'
import { AgentLiveGridHeader } from './AgentLiveGridHeader'

vi.mock('@/lib/agent-catalog', () => ({
  AgentIcon: () => <span data-testid="agent-icon" />
}))

vi.mock('@/components/AgentStateDot', () => ({
  AgentStateDot: () => <span data-testid="state-dot" />
}))

vi.mock('./DashboardWorkspaceStatusButton', () => ({
  DashboardWorkspaceStatusButton: () => <span data-testid="workspace-status" />
}))

function card(overrides: Partial<DashboardCard> = {}): DashboardCard {
  return {
    paneKey: 'tab:leaf',
    ptyId: 'pty-1',
    agentType: 'codex',
    bucket: 'working',
    dotState: 'working',
    task: 'Ship it',
    repoId: 'repo-1',
    worktreeId: 'worktree-1',
    tabId: 'tab',
    leafId: 'leaf',
    repoName: 'Orca',
    worktreeName: 'dashboard-live',
    startedAt: 1_000,
    finishedAt: null,
    stateChangedAt: 1_000,
    unseen: false,
    ...overrides
  }
}

function renderHeader(props: Partial<React.ComponentProps<typeof AgentLiveGridHeader>> = {}) {
  const baseCard = card()
  return render(
    <TooltipProvider>
      <AgentLiveGridHeader
        card={baseCard}
        title="dashboard-live"
        subtitle="Implement Live view"
        editingPaneKey={null}
        nameDraft=""
        setNameDraft={vi.fn()}
        beginRename={vi.fn()}
        finishRename={vi.fn()}
        cancelRenameRef={{ current: false }}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
        onOpenTerminal={vi.fn()}
        onRevealAgent={vi.fn()}
        onAssignWorkspaceStatus={vi.fn()}
        onMinimize={vi.fn()}
        onClose={vi.fn()}
        {...props}
      />
    </TooltipProvider>
  )
}

describe('AgentLiveGridHeader', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows the project icon before the Live view workspace title', () => {
    renderHeader({ repoIcon: { type: 'emoji', emoji: '🐋' } })

    expect(screen.getByLabelText('Project: Orca')).toHaveTextContent('🐋')
    expect(screen.getByText('dashboard-live')).toBeInTheDocument()
  })

  it('keeps a project icon affordance when the repo has no custom icon', () => {
    renderHeader({ repoIcon: null })

    expect(screen.getByLabelText('Project: Orca')).toBeInTheDocument()
  })
})
