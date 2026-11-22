import { readRuntimeStatuses } from '@/store/slices/runtime-status/views/runtime-status-owner'
import { useAppStore } from '@/store'
import { toast } from 'sonner'
import { parseExecutionHostId } from '../../../shared/execution-host/execution-host'
import { resolveTerminalInputHostPlatform } from '@/components/terminal-pane/input/terminal-input-host-platform'
import {
  isWslShellName,
  resolveLocalWindowsTerminalShellOverrideForTab
} from '../../../shared/shell/launch/local-windows-terminal-runtime'
import { worktreeUsesWslPath } from '@/store/terminals/tabs/creation/terminal-workspace-routing'
import { getExecutionHostIdForWorktree } from './workspace/ownership/worktree-runtime-owner'
import { getLocalProjectExecutionRuntimeContext } from '../runtime/hosts/preflight/local-preflight-context'
import { getRendererAppPlatform } from '../app-shell/platform/renderer-app-platform'
import { runQuickCommandInNewTab } from './terminal/quick-commands/run-quick-command-in-new-tab'

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
  const statuses = readRuntimeStatuses()
  const clientPlatform = getRendererAppPlatform()
  const host = parseExecutionHostId(getExecutionHostIdForWorktree(state, worktreeId))
  const environmentId = host?.kind === 'runtime' ? host.environmentId : null
  const sshStates = environmentId
    ? state.sshStateByEnvironment.get(environmentId)?.connectionStates
    : state.sshConnectionStates
  if (
    (host?.kind === 'runtime' && !statuses.get(host.environmentId)?.status?.hostPlatform) ||
    (host?.kind === 'ssh' && !sshStates?.get(host.targetId)?.remotePlatform)
  ) {
    toast.error('Connect to the workspace host before opening a Warp tab.')
    return
  }
  const platform = resolveTerminalInputHostPlatform({
    state,
    statuses,
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
