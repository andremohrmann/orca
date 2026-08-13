// @vitest-environment happy-dom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('AgentLiveGrid', () => {
  it('keeps mosaic previews from claiming the real PTY grid', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/renderer/src/components/dashboard-popout/AgentLiveGrid.tsx'),
      'utf8'
    )

    expect(source).toContain('claimGrid={false}')
  })
})
