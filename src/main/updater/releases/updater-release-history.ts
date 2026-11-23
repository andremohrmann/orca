import { compareVersions } from './updater-fallback'
import type { DatedReleaseTag } from './updater-release-delay'
import type { ReleaseBuild } from '../../../shared/updater/release-channel'
import { listMainRepoReleaseBuildsUntil } from './updater-release-builds'

// Releases past the feed don't change and newer ones come from Atom, so a list that settled the delay stays accurate.
const OLDER_RELEASES_TTL_MS = 6 * 60 * 60 * 1000
let olderReleasesCache: {
  tags: DatedReleaseTag[]
  expiresAt: number
  exhaustive: boolean
} | null = null

export async function fetchOlderReleaseTags(
  settlesDelay: (tags: DatedReleaseTag[]) => boolean,
  now: number
): Promise<DatedReleaseTag[] | null> {
  if (
    olderReleasesCache &&
    olderReleasesCache.expiresAt > now &&
    (olderReleasesCache.exhaustive || settlesDelay(olderReleasesCache.tags))
  ) {
    return olderReleasesCache.tags
  }
  try {
    const builds = await listMainRepoReleaseBuildsUntil((listed) =>
      settlesDelay(listed.map(toDatedReleaseTag))
    )
    const tags = builds.map(toDatedReleaseTag)
    // An unsettled list ran to the last page or the cap, so refetching within the TTL finds nothing more.
    olderReleasesCache = {
      tags,
      expiresAt: now + OLDER_RELEASES_TTL_MS,
      exhaustive: !settlesDelay(tags)
    }
    return tags
  } catch {
    // Rate limits or outages keep the Atom-only result, which holds the update (fail closed).
    return null
  }
}

function toDatedReleaseTag({ tag, version, publishedAt }: ReleaseBuild): DatedReleaseTag {
  const releasedAt = publishedAt ? Date.parse(publishedAt) : Number.NaN
  return { tag, version, releasedAt: Number.isNaN(releasedAt) ? null : releasedAt }
}

// Atom entries win; REST pages can repeat a release published while paging.
export function mergeReleaseTags(
  feedTags: DatedReleaseTag[],
  olderTags: DatedReleaseTag[]
): DatedReleaseTag[] {
  const byTag = new Map<string, DatedReleaseTag>()
  for (const entry of [...feedTags, ...olderTags]) {
    if (!byTag.has(entry.tag)) {
      byTag.set(entry.tag, entry)
    }
  }
  return [...byTag.values()].sort((left, right) => compareVersions(right.version, left.version))
}
