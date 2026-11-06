import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
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
  it.skipIf(process.platform !== 'win32').each([false, true])(
    'resolves upstream deletions while guarding preserved files (preserved=%s)',
    (preserved) => {
      const directory = mkdtempSync(join(tmpdir(), 'orca-merge-deletion-'))
      const git = (...args) => {
        const result = spawnSync('git', args, {
          cwd: directory,
          encoding: 'utf8',
          windowsHide: true
        })
        expect(result.status, result.stderr).toBe(0)
        return result.stdout.trim()
      }
      try {
        git('init')
        git('config', 'user.name', 'Merge test')
        git('config', 'user.email', 'merge-test@example.invalid')
        writeFileSync(join(directory, 'preview.test.ts'), 'base\n')
        git('add', '.')
        git('commit', '-m', 'base')
        git('checkout', '-b', 'upstream')
        git('rm', 'preview.test.ts')
        git('commit', '-m', 'delete upstream test')
        git('checkout', '-b', 'custom', 'HEAD~1')
        writeFileSync(join(directory, 'preview.test.ts'), 'custom change\n')
        git('commit', '-am', 'modify custom test')
        const merge = spawnSync('git', ['merge', '--no-commit', 'upstream'], {
          cwd: directory,
          encoding: 'utf8',
          windowsHide: true
        })
        expect(merge.status).toBe(1)
        expect(git('diff', '--name-only', '--diff-filter=U')).toBe('preview.test.ts')
        const resolver = SCRIPT.match(
          /function Resolve-DeletedWorkflowMergeConflicts \{[\s\S]+?\r?\n\}(?=\r?\n\r?\nfunction Set-CustomBuildVersion)/
        )?.[0]
        expect(resolver).toBeTypeOf('string')
        const scriptPath = join(directory, 'resolve.ps1')
        writeFileSync(
          scriptPath,
          `$customContentConflictAllowlist = @(${preserved ? "'preview.test.ts'" : ''})
${resolver}
if (Resolve-DeletedWorkflowMergeConflicts) { exit 0 } else { exit 1 }
`
        )
        const result = spawnSync(
          process.platform === 'win32' ? 'powershell.exe' : 'pwsh',
          ['-NoProfile', '-NonInteractive', '-File', scriptPath],
          { cwd: directory, encoding: 'utf8', windowsHide: true }
        )
        expect(result.error).toBeUndefined()
        expect(result.status, result.stdout + result.stderr).toBe(preserved ? 1 : 0)
        expect(git('diff', '--name-only', '--diff-filter=U')).toBe(
          preserved ? 'preview.test.ts' : ''
        )
        if (!preserved) {
          expect(git('ls-files', '--', 'preview.test.ts')).toBe('')
        }
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    },
    30000
  )

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

  it('accepts upstream content for non-custom files while retaining a conflict guard', () => {
    expect(SCRIPT).toContain('Accept upstream content for non-custom file $path')
    expect(SCRIPT).toContain('& git checkout --theirs -- $path | Out-Host')
    expect(SCRIPT).toContain('remainingConflicts.Count -gt 0')
  })

  it('never force-aligns every differing file to upstream after a merge', () => {
    // The October 13 2026 incident: a function that ran after every merge — conflict or not — and
    // reverted or deleted any file merely differing from upstream (not just ones with a real
    // conflict) silently erased this fork's entire Live View dashboard feature (~148 files, two
    // months of work) plus its update-feed wiring, and every scheduled merge after kept re-erasing
    // it, because "differs from upstream" is true of nearly every custom file by definition.
    expect(SCRIPT).not.toContain('function Align-ChangedFilesToUpstream')
    expect(SCRIPT).not.toContain('Align-ChangedFilesToUpstream -UpstreamRef')
    expect(SCRIPT).not.toContain('$customPreservePaths')
    // A plain 3-way merge must be what runs — it keeps everything that doesn't textually conflict.
    expect(SCRIPT).toContain('& git merge --no-ff --no-commit $UpstreamRef')
  })

  it('takes the fork side only on an actual conflict in files upstream does not own', () => {
    // The update-feed files the Oct 13 incident deleted. Listing them here only matters for a
    // genuine textual conflict (resolved below) — a non-conflicting merge already keeps them.
    for (const path of [
      'config/update-feed-defaults.json',
      'config/dev-app-update.yml',
      'src/shared/update-feed-info.ts',
      'src/shared/update-feed-info.test.ts'
    ]) {
      expect(SCRIPT).toContain(`'${path}'`)
    }
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
