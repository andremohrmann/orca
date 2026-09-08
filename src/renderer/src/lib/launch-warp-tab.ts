import { useAppStore } from '@/store'
import { toast } from 'sonner'
import { parseExecutionHostId } from '../../../shared/execution-host'
import { resolveTerminalInputHostPlatform } from '@/components/terminal-pane/terminal-input-host-platform'
import {
  isWslShellName,
  resolveLocalWindowsTerminalShellOverrideForTab
} from '../../../shared/local-windows-terminal-runtime'
import { worktreeUsesWslPath } from '@/store/terminals/terminal-workspace-routing'
import {
  getExecutionHostIdForWorktree,
  getRuntimeEnvironmentIdForWorktree
} from './worktree-runtime-owner'
import { getLocalProjectExecutionRuntimeContext } from './local-preflight-context'
import { getRendererAppPlatform } from './renderer-app-platform'
import { runQuickCommandInNewTab } from './run-quick-command-in-new-tab'

// The desktop app also installs warp.cmd on PATH; only the Agent CLI belongs in a PTY.
export const WINDOWS_WARP_AGENT_COMMAND =
  "$orcaWarpCli = Join-Path $env:LOCALAPPDATA 'Warp/bin/warp.cmd'; " +
  'if (Test-Path -LiteralPath $orcaWarpCli) { & $orcaWarpCli } else { ' +
  "Write-Error 'Install the Warp Agent CLI on this host: https://docs.warp.dev/agents/cli/quickstart/' }"

export function launchWarpTab(
  worktreeId: string,
  groupId?: string,
  onCreated?: (tabId: string) => void
): void {
  const state = useAppStore.getState()
  const clientPlatform = getRendererAppPlatform()
  const host = parseExecutionHostId(getExecutionHostIdForWorktree(state, worktreeId))
  const environmentId = getRuntimeEnvironmentIdForWorktree(state, worktreeId)
  const sshStates = environmentId
    ? state.sshStateByEnvironment.get(environmentId)?.connectionStates
    : state.sshConnectionStates
  if (
    (host?.kind === 'runtime' &&
      !state.runtimeStatusByEnvironmentId.get(host.environmentId)?.status?.hostPlatform) ||
    (host?.kind === 'ssh' && !sshStates?.get(host.targetId)?.remotePlatform)
  ) {
    toast.error('Connect to the workspace host before opening a Warp tab.')
    return
  }
  const platform = resolveTerminalInputHostPlatform({
    state,
    clientPlatform,
    worktreeId,
    transport: null
  })
  const isLocal = host?.kind === 'local'
  const shell =
    isLocal && platform === 'win32'
      ? resolveLocalWindowsTerminalShellOverrideForTab({
          explicitShellOverride: undefined,
          defaultWindowsShell: state.settings?.terminalWindowsShell,
          isWslWorktree: worktreeUsesWslPath(state, worktreeId),
          projectRuntime: getLocalProjectExecutionRuntimeContext(state, worktreeId, clientPlatform)
        })
      : undefined
  const useWindowsCli = platform === 'win32' && !isWslShellName(shell)
  const result = runQuickCommandInNewTab({
    worktreeId,
    groupId,
    historyId: null,
    shellOverride: useWindowsCli ? 'powershell.exe' : undefined,
    command: {
      id: 'warp',
      label: 'Warp',
      action: 'terminal-command',
      command: useWindowsCli ? WINDOWS_WARP_AGENT_COMMAND : 'warp',
      appendEnter: true
    }
  })
  if (result) {
    onCreated?.(result.tabId)
  }
}
