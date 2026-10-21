// Why a module-local declaration as well as the ambient one: this file is bundled for the
// CLI and relay too, and those builds never substitute the constant.
declare const ORCA_UPDATE_FEED_REPO: string | null

/** The repo an unmodified Orca build updates from. */
export const DEFAULT_UPDATE_FEED_REPO = 'stablyai/orca'

export type UpdateFeedInfo = {
  repo: string
  atomUrl: string
  latestDownloadUrl: string
  releasesUrl: string
}

/**
 * The `owner/repo` whose releases this build installs. A fork substitutes it at build time so
 * its users are never offered upstream's installers, which carry none of the fork's changes.
 */
export function getConfiguredUpdateFeedRepo(): string {
  // Why `typeof`: only the Electron bundles define the constant; elsewhere a bare read throws.
  return typeof ORCA_UPDATE_FEED_REPO === 'string' && ORCA_UPDATE_FEED_REPO.length > 0
    ? ORCA_UPDATE_FEED_REPO
    : DEFAULT_UPDATE_FEED_REPO
}

export function getUpdateFeedInfo(): UpdateFeedInfo {
  const repo = getConfiguredUpdateFeedRepo()
  return {
    repo,
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
