declare const ORCA_UPDATE_FEED_REPO: string | null

export const DEFAULT_UPDATE_FEED_REPO = 'stablyai/orca'

export type UpdateFeedInfo = {
  repo: string
  isCustom: boolean
  atomUrl: string
  latestDownloadUrl: string
  releasesUrl: string
}

export function getConfiguredUpdateFeedRepo(): string {
  return ORCA_UPDATE_FEED_REPO ?? DEFAULT_UPDATE_FEED_REPO
}

export function getUpdateFeedInfo(): UpdateFeedInfo {
  const repo = getConfiguredUpdateFeedRepo()
  return {
    repo,
    isCustom: repo !== DEFAULT_UPDATE_FEED_REPO,
    atomUrl: `https://github.com/${repo}/releases.atom`,
    latestDownloadUrl: `https://github.com/${repo}/releases/latest/download`,
    releasesUrl: `https://github.com/${repo}/releases`
  }
}

export function getReleaseDownloadBaseUrl(): string {
  return `https://github.com/${getConfiguredUpdateFeedRepo()}/releases/download`
}

export function getReleaseLatestDownloadUrl(): string {
  return getUpdateFeedInfo().latestDownloadUrl
}
