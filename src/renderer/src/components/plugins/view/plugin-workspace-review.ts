import { useAppStore } from '@/store'
import {
  selectFolderWorkspaces,
  selectWorktreesByRepo
} from '@/store/workspaces/catalog/workspace-record-fields'
import { resolveDashboardWorkspaceReview } from '@/components/dashboard/snapshot/dashboard-card-context'
import { getIndexedWorktreesById } from '@/store/slices/worktrees/listing/worktree-catalog-index'
import { getIndexedRepoMap } from '@/store/repos/repository-catalog-index'
import { getWorktreeExecutionHostId } from '../../../../../shared/execution-host/execution-host'
import { parseWorkspaceKey } from '../../../../../shared/workspace/identity/workspace-scope'
import { folderWorkspaceToWorktree } from '../../../../../shared/folder-workspaces/folder-workspace-worktree'
import type {
  PluginViewReply,
  PluginViewRequest
} from '../../../../../shared/plugins/view/plugin-view-protocol'

export function readPluginWorkspaceReview(
  request: Extract<PluginViewRequest, { kind: 'read-workspace-review' }>
): PluginViewReply {
  const state = useAppStore.getState()
  const repos = getIndexedRepoMap(state.repos)
  const candidates = getIndexedWorktreesById(selectWorktreesByRepo(state), request.worktreeId).map(
    (worktree) => ({
      worktree,
      repo: repos.get(worktree.repoId) ?? null
    })
  )
  const folder = parseWorkspaceKey(request.worktreeId)
  if (candidates.length === 0 && folder?.type === 'folder') {
    for (const entry of selectFolderWorkspaces(state) ?? []) {
      if (entry.id === folder.folderWorkspaceId) {
        candidates.push({ worktree: folderWorkspaceToWorktree(entry), repo: null })
      }
    }
  }
  const matches = candidates.filter(
    ({ worktree, repo }) =>
      worktree.id === request.worktreeId &&
      getWorktreeExecutionHostId(worktree, repo ?? undefined) === request.executionHostId
  )
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
