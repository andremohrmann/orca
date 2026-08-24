import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SCRIPT = readFileSync(resolve(import.meta.dirname, 'build-custom-orca-update.ps1'), 'utf8')

describe('custom Windows updater merge safety', () => {
  it('does not mix native command output into the conflict-resolution result', () => {
    const resolver = SCRIPT.match(
      /function Resolve-DeletedWorkflowMergeConflicts \{([\s\S]+?)\n\}\n\nfunction Set-CustomBuildVersion/
    )?.[1]

    expect(resolver).toContain('& git rm -- $workflowConflicts | Out-Host')
    expect(resolver).toContain('& git -c core.editor=true commit --no-edit | Out-Host')
  })
})
