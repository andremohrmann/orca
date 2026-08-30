// @vitest-environment happy-dom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('AgentLiveGrid', () => {
  it('keeps mosaic previews passive and scales their exact terminal layout to fit', () => {
    const gridSource = readFileSync(
      resolve(process.cwd(), 'src/renderer/src/components/dashboard-popout/AgentLiveGrid.tsx'),
      'utf8'
    )
    const terminalSource = readFileSync(
      resolve(
        process.cwd(),
        'src/renderer/src/components/dashboard-popout/AgentLiveGridTerminal.tsx'
      ),
      'utf8'
    )

    expect(gridSource).toContain('<AgentLiveGridTerminal')
    expect(terminalSource).toContain('claimGrid={false}')
    expect(terminalSource).toContain('scaleToFit')
  })
})
