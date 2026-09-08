import { runQuickCommandInNewTab } from './run-quick-command-in-new-tab'

export function launchWarpTab(
  worktreeId: string,
  groupId?: string,
  onCreated?: (tabId: string) => void
): void {
  const result = runQuickCommandInNewTab({
    worktreeId,
    groupId,
    historyId: null,
    command: {
      id: 'warp',
      label: 'Warp',
      action: 'terminal-command',
      command: 'warp',
      appendEnter: true
    }
  })
  if (result) {
    onCreated?.(result.tabId)
  }
}
