import { describe, expect, it } from 'vitest'
import {
  getReleaseNotesUrlForVersion,
  getVersionChannel,
  isCustomVersion,
  normalizeTagToVersion
} from './release-channel'

describe('custom Windows release channel', () => {
  it('maps custom builds onto the RC update channel', () => {
    expect(getVersionChannel('custom-windows-1.4.160-custom.20260812031544')).toBe('rc')
  })

  it('links custom builds to their fork release tag', () => {
    expect(getReleaseNotesUrlForVersion('1.4.160-custom.20260812031544')).toBe(
      'https://github.com/stablyai/orca/releases/tag/custom-windows-1.4.160-custom.20260812031544'
    )
  })

  it('normalizes custom Windows release tags', () => {
    expect(normalizeTagToVersion('custom-windows-1.4.160-custom.20260812031544')).toBe(
      '1.4.160-custom.20260812031544'
    )
    expect(isCustomVersion('1.4.160-custom.20260812031544')).toBe(true)
    expect(isCustomVersion('custom-windows-1.4.160-custom.20260812031544')).toBe(true)
    expect(isCustomVersion('1.4.160-rc.3')).toBe(false)
  })
})
