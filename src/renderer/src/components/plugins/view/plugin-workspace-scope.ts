import type { AppState } from '@/store/types'
import {
  selectFolderWorkspaces,
  selectWorktreesByRepo
} from '@/store/workspaces/catalog/workspace-record-fields'
import { getIndexedWorktreesById } from '@/store/slices/worktrees/listing/worktree-catalog-index'
import { getIndexedRepoMap } from '@/store/repos/repository-catalog-index'
import { getWorktreeExecutionHostId } from '../../../../../shared/execution-host/execution-host'
import { parseWorkspaceKey } from '../../../../../shared/workspace/identity/workspace-scope'
import { folderWorkspaceToWorktree } from '../../../../../shared/folder-workspaces/folder-workspace-worktree'

export function pluginWorkspaceScopeCandidates(
  state: AppState,
  worktreeId: string,
  executionHostId: string
) {
  const repos = getIndexedRepoMap(state.repos)
  const candidates = getIndexedWorktreesById(selectWorktreesByRepo(state), worktreeId).map(
    (worktree) => ({
      worktree,
      repo: repos.get(worktree.repoId) ?? null
    })
  )
  const folder = parseWorkspaceKey(worktreeId)
  if (candidates.length === 0 && folder?.type === 'folder') {
    for (const entry of selectFolderWorkspaces(state) ?? []) {
      if (entry.id === folder.folderWorkspaceId) {
        candidates.push({ worktree: folderWorkspaceToWorktree(entry), repo: null })
      }
    }
  }
  const matches = candidates.filter(
    ({ worktree, repo }) =>
      worktree.id === worktreeId &&
      getWorktreeExecutionHostId(worktree, repo ?? undefined) === executionHostId
  )
  return matches
}
