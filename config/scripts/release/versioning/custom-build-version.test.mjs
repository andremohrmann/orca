import { expect, it } from 'vitest'
import { createCustomBuildVersion } from './custom-build-version.mjs'

it('keeps custom builds above published stable despite main retaining an old package version', () => {
  expect(createCustomBuildVersion('1.4.214', 'v1.4.278', new Date('2026-11-26T14:05:46Z'))).toBe(
    '1.4.279-custom.20261126140546'
  )
  expect(() => createCustomBuildVersion('1.4.214', 'android-v0.0.71')).toThrow('stable release tag')
})
