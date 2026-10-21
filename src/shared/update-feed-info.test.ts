import { describe, expect, it } from 'vitest'
import {
  DEFAULT_UPDATE_FEED_REPO,
  getConfiguredUpdateFeedRepo,
  getReleaseDownloadBaseUrl,
  getReleaseLatestDownloadUrl,
  getUpdateFeedInfo
} from './update-feed-info'

describe('update feed info', () => {
  // Vitest substitutes no build constants, which is the same shape as the CLI and relay bundles:
  // reading the identifier directly would throw at module load rather than fall back.
  it('falls back to upstream when the build substituted no feed repo', () => {
    expect(getConfiguredUpdateFeedRepo()).toBe(DEFAULT_UPDATE_FEED_REPO)
  })

  it('derives every release URL from the one configured repo', () => {
    const repo = getConfiguredUpdateFeedRepo()
    expect(getUpdateFeedInfo()).toEqual({
      repo,
      isCustom: repo !== DEFAULT_UPDATE_FEED_REPO,
      atomUrl: `https://github.com/${repo}/releases.atom`,
      latestDownloadUrl: `https://github.com/${repo}/releases/latest/download`,
      releasesUrl: `https://github.com/${repo}/releases`
    })
    expect(getReleaseDownloadBaseUrl()).toBe(`https://github.com/${repo}/releases/download`)
    expect(getReleaseLatestDownloadUrl()).toBe(getUpdateFeedInfo().latestDownloadUrl)
  })

  it('flags isCustom only when the feed repo differs from upstream', () => {
    expect(getUpdateFeedInfo().isCustom).toBe(false)
  })
})
