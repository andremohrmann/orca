// @vitest-environment happy-dom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('AgentLiveGrid', () => {
  it('fits live panes locally without changing the shared PTY grid', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/renderer/src/components/dashboard-popout/AgentLiveGrid.tsx'),
      'utf8'
    )

    expect(source).toContain('claimGrid={false}')
    expect(source).toContain('refreshAfterInput={false}')
    expect(source).toContain('scaleToFit={false}')
  })
})
