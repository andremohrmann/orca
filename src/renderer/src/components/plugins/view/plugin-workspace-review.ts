import { pluginWorkspaceScopeCandidates } from './plugin-workspace-scope'
import { useAppStore } from '@/store'
import { resolveDashboardWorkspaceReview } from '@/components/dashboard/snapshot/dashboard-card-context'
import type {
  PluginViewReply,
  PluginViewRequest
} from '../../../../../shared/plugins/view/plugin-view-protocol'

export function readPluginWorkspaceReview(
  request: Extract<PluginViewRequest, { kind: 'read-workspace-review' }>
): PluginViewReply {
  const state = useAppStore.getState()
  const matches = pluginWorkspaceScopeCandidates(state, request.worktreeId, request.executionHostId)
  const target = matches.length === 1 ? matches[0] : undefined
  if (!target) {
    return { requestId: request.requestId, ok: true, workspaceReview: null }
  }
  const { hasReview, review } = resolveDashboardWorkspaceReview(state, target.repo, target.worktree)
  return {
    requestId: request.requestId,
    ok: true,
    workspaceReview: {
      worktreeId: target.worktree.id,
      executionHostId: request.executionHostId,
      hasReview,
      review:
        review && review.provider !== 'unsupported'
          ? { provider: review.provider, number: review.number, state: review.state }
          : null
    }
  }
}
