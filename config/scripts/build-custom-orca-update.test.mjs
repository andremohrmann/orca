import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SCRIPT = readFileSync(resolve(import.meta.dirname, 'build-custom-orca-update.ps1'), 'utf8')
const WORKFLOW = readFileSync(
  resolve(import.meta.dirname, '../../.github/workflows/custom-windows-update.yml'),
  'utf8'
)
const VERIFY_UPDATE = readFileSync(
  resolve(import.meta.dirname, 'verify-custom-orca-update.ps1'),
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
    expect(SCRIPT).toContain("'Commit upstream merge' git @(")
    expect(SCRIPT).toContain("'--no-verify'")
  })

  it('preserves the custom dashboard owner when upstream changes the same board file', () => {
    expect(SCRIPT).toContain('Align-ChangedFilesToUpstream -UpstreamRef $UpstreamRef')
    expect(SCRIPT).toContain('git diff --name-only "$UpstreamRef...HEAD" --')
    expect(SCRIPT).toContain("'config/scripts/build-custom-orca-update.ps1'")
    expect(SCRIPT).toContain('& git checkout $UpstreamRef -- $path | Out-Host')
  })

  it('accepts upstream content for non-custom files while retaining a conflict guard', () => {
    expect(SCRIPT).toContain('Accept upstream content for non-custom file $path')
    expect(SCRIPT).toContain('& git checkout --theirs -- $path | Out-Host')
    expect(SCRIPT).toContain('remainingConflicts.Count -gt 0')
  })

  it('keeps the update feed files out of the forced upstream alignment', () => {
    // The October 2026 regression: an automated upstream merge reverted these, so the installer
    // published to the fork while the app itself offered upstream's releases.
    for (const path of [
      'config/update-feed-defaults.json',
      'config/dev-app-update.yml',
      'config/build-plugins/startup-diagnostics-banner.ts',
      'electron.vite.config.ts',
      'src/shared/update-feed-info.ts',
      'src/shared/release-channel.ts',
      'src/main/updater-prerelease-feed.ts',
      'src/main/updater/updater-release-feed.ts',
      'src/main/updater/updater-setup.ts'
    ]) {
      expect(SCRIPT).toContain(`'${path}'`)
    }
    expect(SCRIPT).toContain(') + $customUpdateFeedPaths')
  })

  it('resolves conflicts to the fork only in files upstream does not own', () => {
    const allowlist = SCRIPT.match(/\$customContentConflictAllowlist = @\(([\s\S]+?)\)/)?.[1]

    expect(allowlist).toContain("'src/shared/update-feed-info.ts'")
    // Shared updater sources must stop the merge instead, so an upstream fix is never dropped.
    expect(allowlist).not.toContain("'src/main/updater/updater-setup.ts'")
    expect(allowlist).not.toContain("'electron.vite.config.ts'")
  })

  it('verifies the built bundle checks the repo the installer publishes to', () => {
    expect(VERIFY_UPDATE).toContain('$expectedFeedRepo')
    expect(VERIFY_UPDATE).toContain("Join-Path (Get-Location).Path 'out/main'")
    expect(VERIFY_UPDATE).toContain('Main bundle does not embed update feed $expectedFeedRepo')
  })

  it('blocks publishing when the packaged renderer cannot start', () => {
    expect(SCRIPT).toContain("'src/renderer/src/renderer-node-builtin-boundary.test.ts'")
    expect(SCRIPT).toContain("'tests/tools/win-update-e2e/packaged-startup-smoke.mjs'")
    expect(SCRIPT).toContain("Invoke-Native 'Smoke test packaged renderer startup' node")
  })

  it('installs the separate mobile project before building release artifacts', () => {
    expect(SCRIPT).toMatch(
      /Invoke-Native 'Install mobile web bundle dependencies' pnpm @[\s\S]+?'--dir',[\s\S]+?'mobile',[\s\S]+?'install',[\s\S]+?'--frozen-lockfile'[\s\S]+?Invoke-Native 'Build release artifacts'/
    )
  })

  it('installs desktop dependencies after merging upstream changes', () => {
    expect(SCRIPT).toContain("Invoke-Native 'Install merged desktop dependencies' pnpm @(")
    expect(SCRIPT).toContain("'install', '--frozen-lockfile'")
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
