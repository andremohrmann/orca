import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runQuickCommandInNewTab } from './run-quick-command-in-new-tab'

type MockStoreState = {
  createTab: ReturnType<typeof vi.fn>
  setActiveTabType: ReturnType<typeof vi.fn>
  setTabBarOrder: ReturnType<typeof vi.fn>
  setRecentQuickCommandForGroup: ReturnType<typeof vi.fn>
  tabsByWorktree: Record<string, { id: string }[]>
  unifiedTabsByWorktree: Record<
    string,
    { entityId: string; contentType: string; groupId: string }[]
  >
  activeGroupIdByWorktree: Record<string, string>
  openFiles: { id: string; worktreeId: string }[]
  browserTabsByWorktree: Record<string, { id: string }[]>
  tabBarOrderByWorktree: Record<string, string[]>
}

const mocks = vi.hoisted(() => ({
  launchAgentInNewTab: vi.fn()
}))

let mockState: MockStoreState

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => mockState
  }
}))

vi.mock('@/lib/launch-agent-in-new-tab', () => ({
  launchAgentInNewTab: mocks.launchAgentInNewTab
}))

function createStoreState(): MockStoreState {
  return {
    createTab: vi.fn(() => ({ id: 'tab-new' })),
    setActiveTabType: vi.fn(),
    setTabBarOrder: vi.fn(),
    setRecentQuickCommandForGroup: vi.fn(),
    tabsByWorktree: { 'wt-1': [{ id: 'tab-existing' }, { id: 'tab-new' }] },
    unifiedTabsByWorktree: {
      'wt-1': [{ entityId: 'tab-new', contentType: 'terminal', groupId: 'group-1' }]
    },
    activeGroupIdByWorktree: { 'wt-1': 'group-1' },
    openFiles: [],
    browserTabsByWorktree: {},
    tabBarOrderByWorktree: {}
  }
}

describe('runQuickCommandInNewTab', () => {
  beforeEach(() => {
    mockState = createStoreState()
    mocks.launchAgentInNewTab.mockReset()
  })

  it('launches a built-in command with the default quick-command history', () => {
    runQuickCommandInNewTab({
      worktreeId: 'wt-1',
      groupId: 'group-1',
      command: {
        id: 'warp',
        label: 'Warp',
        action: 'terminal-command',
        command: '& $orcaWarpCli',
        appendEnter: true
      }
    })
    expect(mockState.createTab).toHaveBeenCalledWith('wt-1', 'group-1', undefined, {
      quickCommandLabel: 'Warp',
      pendingStartup: { command: '& $orcaWarpCli' }
    })
    expect(mockState.setActiveTabType).toHaveBeenCalledWith('terminal', 'wt-1')
    expect(mockState.setTabBarOrder).toHaveBeenCalledWith('wt-1', ['tab-existing', 'tab-new'])
    expect(mockState.setRecentQuickCommandForGroup).toHaveBeenCalledWith('group-1', 'warp')
    expect(mocks.launchAgentInNewTab).not.toHaveBeenCalled()
  })

  it('flattens multiline quick commands before queuing', () => {
    const result = runQuickCommandInNewTab({
      command: {
        id: 'build',
        label: 'Build',
        action: 'terminal-command',
        command: 'cd packages\nbun run build\ncd ..',
        appendEnter: true
      },
      worktreeId: 'wt-1',
      groupId: 'group-1'
    })

    expect(result).toEqual({ tabId: 'tab-new' })
    expect(mockState.createTab).toHaveBeenCalledWith('wt-1', 'group-1', undefined, {
      quickCommandLabel: 'Build',
      pendingStartup: { command: 'cd packages; bun run build; cd ..' }
    })
    expect(mockState.setRecentQuickCommandForGroup).toHaveBeenCalledWith('group-1', 'build')
  })

  it('records a host-qualified history id when provided', () => {
    runQuickCommandInNewTab({
      command: {
        id: 'build',
        label: 'Build',
        action: 'terminal-command',
        command: 'pnpm build',
        appendEnter: true
      },
      worktreeId: 'wt-1',
      groupId: 'group-1',
      historyId: 'runtime:server\0build'
    })

    expect(mockState.setRecentQuickCommandForGroup).toHaveBeenCalledWith(
      'group-1',
      'runtime:server\0build'
    )
  })

  it('appends the new terminal after editor and browser tabs in the stored tab order', () => {
    mockState.openFiles = [{ id: 'file-1', worktreeId: 'wt-1' }]
    mockState.browserTabsByWorktree = { 'wt-1': [{ id: 'browser-1' }] }
    mockState.tabBarOrderByWorktree = { 'wt-1': ['file-1', 'tab-existing'] }

    runQuickCommandInNewTab({
      command: {
        id: 'status',
        label: 'Status',
        action: 'terminal-command',
        command: 'git status',
        appendEnter: true
      },
      worktreeId: 'wt-1',
      groupId: 'group-1'
    })

    expect(mockState.setTabBarOrder).toHaveBeenCalledWith('wt-1', [
      'file-1',
      'tab-existing',
      'browser-1',
      'tab-new'
    ])
  })
})
