// @vitest-environment happy-dom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('AgentLiveGrid', () => {
  it('keeps live pane grid claims while the dashboard window is unfocused', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/renderer/src/components/dashboard-popout/AgentLiveGridTerminal.tsx'
      ),
      'utf8'
    )

    expect(source).toContain('claimGrid={true}')
    expect(source).toContain('releaseGridOnWindowBlur={false}')
    expect(source).toContain('refreshAfterInput={false}')
    expect(source).toContain('scaleToFit={false}')
  })
})
