// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DashboardCard } from '../../../../shared/dashboard-snapshot'
import { AgentLiveGridTerminal } from './AgentLiveGridTerminal'

vi.mock('./AgentTerminalPreview', () => ({
  AgentTerminalPreview: ({
    claimGrid,
    scaleToFit,
    autoFocus,
    onClosedActivate
  }: {
    claimGrid: boolean
    scaleToFit: boolean
    autoFocus: boolean
    onClosedActivate: () => void
  }) => (
    <button
      type="button"
      data-claim-grid={claimGrid}
      data-scale-to-fit={scaleToFit}
      data-auto-focus={autoFocus}
      onClick={onClosedActivate}
    >
      Terminal
    </button>
  )
}))

function card(): DashboardCard & { ptyId: string } {
  return {
    paneKey: 'pane-1',
    ptyId: 'pty-1',
    agentType: 'codex',
    bucket: 'working',
    dotState: 'working',
    task: 'Fix wrapping',
    repoId: 'repo-1',
    worktreeId: 'worktree-1',
    executionHostId: 'local',
    tabId: 'tab-1',
    leafId: 'leaf-1',
    repoName: 'Orca',
    worktreeName: 'viewport',
    startedAt: 1,
    finishedAt: null,
    stateChangedAt: 1,
    unseen: false
  }
}

describe('AgentLiveGridTerminal', () => {
  it('keeps the terminal interactive, passive, and scaled to its tile', () => {
    const onRevealAgent = vi.fn()
    render(<AgentLiveGridTerminal card={card()} onRevealAgent={onRevealAgent} />)

    const terminal = screen.getByRole('button', { name: 'Terminal' })
    expect(terminal).toHaveAttribute('data-claim-grid', 'false')
    expect(terminal).toHaveAttribute('data-scale-to-fit', 'true')
    expect(terminal).toHaveAttribute('data-auto-focus', 'false')

    fireEvent.click(terminal)
    expect(onRevealAgent).toHaveBeenCalledWith({
      repoId: 'repo-1',
      worktreeId: 'worktree-1',
      executionHostId: 'local',
      tabId: 'tab-1',
      leafId: 'leaf-1'
    })
  })
})
