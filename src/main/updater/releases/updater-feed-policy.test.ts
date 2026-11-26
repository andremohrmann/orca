import { expect, it } from 'vitest'
import { createUpdateFeedPolicy } from './updater-feed-policy'

it('rejects stock installers and foreign release redirects for a custom feed', () => {
  const policy = createUpdateFeedPolicy({
    repo: 'andremohrmann/orca',
    isCustom: true,
    atomUrl: 'https://github.com/andremohrmann/orca/releases.atom',
    releasesUrl: 'https://github.com/andremohrmann/orca/releases',
    latestDownloadUrl: 'https://github.com/andremohrmann/orca/releases/latest/download'
  })
  const tags = [{ tag: 'v1.5.0' }, { tag: 'custom-windows-1.4.215-custom.20261126140546' }]
  expect(policy.selectTags(tags, '1.4.214')).toEqual([
    { tag: 'custom-windows-1.4.215-custom.20261126140546' }
  ])
  expect(policy.selectTags([{ tag: 'v1.5.0' }], '1.4.214')).toEqual([])
  expect(policy.tagPathPattern.test('/stablyai/orca/releases/tag/v1.5.0')).toBe(false)
  expect(
    policy.tagHrefPattern.test('href="https://github.com/stablyai/orca/releases/tag/v1.5.0"')
  ).toBe(false)
  expect(policy.normalizeTag(tags[1].tag)).toBe('1.4.215-custom.20261126140546')
})
