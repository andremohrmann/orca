import updateFeedDefaults from '../update-feed-defaults.json' with { type: 'json' }

export function resolveUpdateFeedRepoLiteral(): string {
  const owner = process.env.ORCA_UPDATE_OWNER || updateFeedDefaults.owner
  const repo = process.env.ORCA_UPDATE_REPO || updateFeedDefaults.repo
  return owner.length > 0 && repo.length > 0 ? JSON.stringify(`${owner}/${repo}`) : 'null'
}
