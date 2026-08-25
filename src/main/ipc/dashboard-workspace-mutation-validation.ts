import {
  DASHBOARD_MAX_LABEL_LENGTH,
  type DashboardAssignWorkspaceStatusArgs,
  type DashboardRenameWorkspaceArgs
} from '../../shared/dashboard-snapshot'

const MAX_ID_LENGTH = 4_096

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
}

export function isDashboardAssignWorkspaceStatusArgs(
  value: unknown
): value is DashboardAssignWorkspaceStatusArgs {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const args = value as Record<string, unknown>
  return (
    isBoundedString(args.worktreeId, MAX_ID_LENGTH) &&
    isBoundedString(args.status, DASHBOARD_MAX_LABEL_LENGTH)
  )
}

export function isDashboardRenameWorkspaceArgs(
  value: unknown
): value is DashboardRenameWorkspaceArgs {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const args = value as Record<string, unknown>
  return (
    isBoundedString(args.worktreeId, MAX_ID_LENGTH) &&
    isBoundedString(args.displayName, DASHBOARD_MAX_LABEL_LENGTH)
  )
}
