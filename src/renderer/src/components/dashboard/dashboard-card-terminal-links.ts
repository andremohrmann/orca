import type { DashboardCardTerminalLinks } from '../../../../shared/dashboard-snapshot'
import { getRemoteRuntimePtyEnvironmentId } from '@/runtime/runtime-terminal-stream'
import { parseWslUncPath } from '../../../../shared/wsl-paths'

export function buildDashboardCardTerminalLinks(
  ptyId: string,
  worktreeId: string,
  worktreePath: string,
  startupCwd?: string | null
): DashboardCardTerminalLinks {
  const runtimeEnvironmentId = getRemoteRuntimePtyEnvironmentId(ptyId)
  const wslDistro = runtimeEnvironmentId ? null : parseWslUncPath(worktreePath)?.distro
  return {
    worktreeId,
    worktreePath,
    startupCwd: startupCwd ?? worktreePath,
    ...(runtimeEnvironmentId ? { runtimeEnvironmentId } : {}),
    ...(wslDistro ? { wslDistro } : {})
  }
}
