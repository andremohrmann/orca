// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardCard } from '../../../../shared/dashboard-snapshot'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { AgentDashboardLiveLayout } from '../../../../shared/agent-dashboard-live-layout'
import { AgentLiveGrid } from './AgentLiveGrid'

vi.mock('./AgentLiveGridTerminal', () => ({
  AgentLiveGridTerminal: ({ card }: { card: DashboardCard }) => (
    <div data-testid={`terminal-${card.paneKey}`} />
  )
}))
vi.mock('./AgentLiveGridHeader', () => ({ AgentLiveGridHeader: () => null }))
vi.mock('@/lib/agent-catalog', () => ({ AgentIcon: () => null }))

let savedLayout: AgentDashboardLiveLayout
let emitSettings: (updates: Partial<GlobalSettings>) => void
const setSettings = vi.fn((updates: Partial<GlobalSettings>) => {
  savedLayout = updates.experimentalAgentDashboardLiveLayout ?? {}
  return Promise.resolve()
})

beforeEach(() => {
  savedLayout = {}
  setSettings.mockClear()
  vi.stubGlobal('api', {
    settings: {
      get: async () => ({ experimentalAgentDashboardLiveLayout: savedLayout }),
      set: setSettings,
      onChanged: (listener: typeof emitSettings) => {
        emitSettings = listener
        return () => {}
      }
    }
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function card(paneKey: string, overrides: Partial<DashboardCard> = {}): DashboardCard {
  return {
    paneKey,
    ptyId: `pty-${paneKey}`,
    agentType: 'codex',
    bucket: 'working',
    dotState: 'working',
    task: '',
    repoId: 'repo',
    worktreeId: 'workspace',
    tabId: paneKey,
    leafId: 'leaf',
    repoName: 'Orca',
    worktreeName: paneKey,
    startedAt: 1,
    finishedAt: null,
    stateChangedAt: 1,
    unseen: false,
    ...overrides
  }
}

function renderGrid(cards: DashboardCard[]) {
  return render(
    <AgentLiveGrid
      cards={cards}
      onOpenTerminal={vi.fn()}
      onRevealAgent={vi.fn()}
      onAssignWorkspaceStatus={vi.fn()}
      onRenameWorkspace={vi.fn()}
    />
  )
}

async function toggleChildAgents(): Promise<void> {
  fireEvent.keyDown(screen.getByRole('button', { name: 'Live options' }), { key: 'Enter' })
  fireEvent.click(
    await screen.findByRole('menuitemcheckbox', { name: 'Hide child-agent terminals' })
  )
}

describe('Live view child-agent visibility', () => {
  it('persists the toggle, restores children, and preserves layout preferences', async () => {
    savedLayout = { density: 'compact', names: { child: 'Worker' }, order: ['child', 'parent'] }
    const cards = [card('parent'), card('child', { parentPaneKey: 'parent' })]
    const view = renderGrid(cards)
    await waitFor(() => expect(screen.getByTestId('terminal-child')).toBeInTheDocument())

    await toggleChildAgents()
    expect(screen.queryByTestId('terminal-child')).not.toBeInTheDocument()
    expect(screen.getByTestId('terminal-parent')).toBeInTheDocument()
    expect(savedLayout).toMatchObject({
      hideChildAgents: true,
      density: 'compact',
      names: { child: 'Worker' },
      order: ['child', 'parent']
    })

    view.unmount()
    renderGrid(cards)
    await waitFor(() => expect(screen.queryByTestId('terminal-child')).not.toBeInTheDocument())
    await toggleChildAgents()
    expect(screen.getByTestId('terminal-child')).toBeInTheDocument()
    expect(savedLayout.hideChildAgents).toBe(false)
  })

  it('uses parent links across hosts and folders, even when the parent is absent', async () => {
    savedLayout = { hideChildAgents: true }
    renderGrid([
      card('unknown-lineage', { hostKind: 'remote' }),
      card('workspace-child', { parentWorktreeId: 'parent-workspace', workspaceKind: 'folder' }),
      card('ssh-child', { parentPaneKey: 'absent-parent', hostKind: 'ssh' }),
      card('nested-child', { parentPaneKey: 'ssh-child', workspaceKind: 'folder' })
    ])

    await waitFor(() => expect(screen.queryByTestId('terminal-ssh-child')).not.toBeInTheDocument())
    expect(screen.queryByTestId('terminal-nested-child')).not.toBeInTheDocument()
    expect(screen.getByTestId('terminal-unknown-lineage')).toBeInTheDocument()
    expect(screen.getByTestId('terminal-workspace-child')).toBeInTheDocument()
  })

  it('updates from settings and keeps the toggle reachable when every child is hidden', async () => {
    savedLayout = { minimized: ['minimized-child'] }
    renderGrid([
      card('live-child', { parentPaneKey: 'absent-parent' }),
      card('closed-child', { parentPaneKey: 'absent-parent', ptyId: null }),
      card('minimized-child', { parentPaneKey: 'absent-parent' })
    ])
    await waitFor(() => expect(screen.getByText('Minimized')).toBeInTheDocument())

    act(() => {
      emitSettings({
        experimentalAgentDashboardLiveLayout: { ...savedLayout, hideChildAgents: true }
      })
    })
    expect(screen.queryByTestId('terminal-live-child')).not.toBeInTheDocument()
    expect(screen.queryByText('closed-child')).not.toBeInTheDocument()
    expect(screen.queryByText('minimized-child')).not.toBeInTheDocument()
    expect(screen.getByText('No live terminals.')).toBeInTheDocument()

    await toggleChildAgents()
    expect(screen.getByTestId('terminal-live-child')).toBeInTheDocument()
    expect(screen.getByText('closed-child')).toBeInTheDocument()
    expect(screen.getByText('minimized-child')).toBeInTheDocument()
  })
})
