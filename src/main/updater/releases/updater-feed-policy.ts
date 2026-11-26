import { getUpdateFeedInfo, type UpdateFeedInfo } from '../../../shared/update-feed-info'
import { escapeRegex } from '../../../shared/text/regex-escaping'
import { isCustomVersion, normalizeTagToVersion } from '../../../shared/updater/release-channel'

export function createUpdateFeedPolicy(feed: UpdateFeedInfo) {
  return {
    atomUrl: feed.atomUrl,
    latestUrl: `${feed.releasesUrl}/latest`,
    tagHrefPattern: new RegExp(`href="${escapeRegex(`${feed.releasesUrl}/tag/`)}([^"]+)"`),
    tagPathPattern: new RegExp(`^/${escapeRegex(feed.repo)}/releases/tag/([^/]+)$`),
    normalizeTag: normalizeTagToVersion,
    selectTags<T extends { tag: string }>(tags: T[], currentVersion: string): T[] {
      return feed.isCustom || isCustomVersion(currentVersion)
        ? tags.filter(({ tag }) => isCustomVersion(tag))
        : tags
    }
  }
}

export const updateFeedPolicy = createUpdateFeedPolicy(getUpdateFeedInfo())
