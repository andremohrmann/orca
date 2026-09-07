import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SCRIPT = readFileSync(resolve(import.meta.dirname, 'build-custom-orca-update.ps1'), 'utf8')
const WORKFLOW = readFileSync(
  resolve(import.meta.dirname, '../../.github/workflows/custom-windows-update.yml'),
  'utf8'
)
const PACKAGED_STARTUP_SMOKE = readFileSync(
  resolve(import.meta.dirname, '../../tests/tools/win-update-e2e/packaged-startup-smoke.mjs'),
  'utf8'
)

describe('custom Windows updater merge safety', () => {
  it('does not mix native command output into the conflict-resolution result', () => {
    const resolver = SCRIPT.match(
      /function Resolve-DeletedWorkflowMergeConflicts \{([\s\S]+?)\r?\n\}\r?\n\r?\nfunction Set-CustomBuildVersion/
    )?.[1]

    expect(resolver).toBeTypeOf('string')
    expect(resolver).toContain('& git rm -- $workflowConflicts | Out-Host')
    expect(resolver).not.toContain('commit --no-edit')
  })

  it('removes inherited workflows before committing the upstream merge', () => {
    expect(SCRIPT).toContain("'.github/workflows/custom-windows-update.yml'")
    expect(SCRIPT).toContain("'.github/workflows/pr-test-loc.yml'")
    expect(SCRIPT).toContain('& git merge --no-ff --no-commit $UpstreamRef')
    expect(SCRIPT).toContain('& git rm -f -- $inheritedWorkflows | Out-Host')
    expect(SCRIPT).toContain('if (@(git diff --cached --name-only).Count -gt 0)')
    expect(SCRIPT).toMatch(/Remove-InheritedWorkflows\r?\n\s+Invoke-Native 'Commit upstream merge'/)
  })

  it('blocks publishing when the packaged renderer cannot start', () => {
    expect(SCRIPT).toContain("'src/renderer/src/renderer-node-builtin-boundary.test.ts'")
    expect(SCRIPT).toContain("'tests/tools/win-update-e2e/packaged-startup-smoke.mjs'")
    expect(SCRIPT).toContain("Invoke-Native 'Smoke test packaged renderer startup' node")
  })

  it('does not fail a successful startup proof on transient Windows profile locks', () => {
    expect(PACKAGED_STARTUP_SMOKE).toContain('maxRetries: 20')
    expect(PACKAGED_STARTUP_SMOKE).toContain('retryDelay: 250')
    expect(PACKAGED_STARTUP_SMOKE).toContain(
      '[packaged-startup-smoke] could not remove temporary profile'
    )
  })

  it('requires the built commit to reach the custom branch before release publication', () => {
    expect(WORKFLOW).not.toMatch(/Push updated custom branch\r?\n\s+continue-on-error:/)
    expect(WORKFLOW).toContain('git ls-remote origin "refs/heads/$env:CUSTOM_BRANCH"')
    expect(WORKFLOW).toContain('does not match built commit')
  })
})
