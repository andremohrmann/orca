// @vitest-environment happy-dom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('AgentLiveGrid', () => {
  it('claims live pane grids only while the dashboard window is focused', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/renderer/src/components/dashboard-popout/AgentLiveGrid.tsx'),
      'utf8'
    )

    expect(source).toContain('claimGrid={true}')
    expect(source).toContain('releaseGridOnWindowBlur={true}')
    expect(source).toContain('refreshAfterInput={false}')
    expect(source).toContain('scaleToFit={false}')
  })
})
