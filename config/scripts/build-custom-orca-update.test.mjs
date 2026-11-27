import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SCRIPT = readFileSync(resolve(import.meta.dirname, 'build-custom-orca-update.ps1'), 'utf8')
describe('custom Windows updater merge safety', () => {
  it.skipIf(process.platform !== 'win32').each([false, true])(
    'accepts upstream deletions but retains custom-owned files (preserved=%s)',
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
        git('config', 'core.autocrlf', 'false')
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
        expect(result.status, result.stdout + result.stderr).toBe(0)
        expect(git('diff', '--name-only', '--diff-filter=U')).toBe('')
        if (!preserved) {
          expect(git('ls-files', '--', 'preview.test.ts')).toBe('')
        } else {
          expect(git('ls-files', '--', 'preview.test.ts')).toBe('preview.test.ts')
          expect(readFileSync(join(directory, 'preview.test.ts'), 'utf8')).toBe('custom change\n')
        }
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    },
    30000
  )

  it.skipIf(process.platform !== 'win32')(
    'merges the pinned snapshot even when fetched main has advanced',
    () => {
      const directory = mkdtempSync(join(tmpdir(), 'orca-pinned-merge-'))
      const git = (...args) => {
        const result = spawnSync('git', ['-c', 'commit.gpgsign=false', ...args], {
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
        git('config', 'commit.gpgsign', 'false')
        git('checkout', '-b', 'main')
        writeFileSync(join(directory, 'base.txt'), 'base\n')
        git('add', '.')
        git('commit', '-m', 'base')
        const base = git('rev-parse', 'HEAD')
        writeFileSync(join(directory, 'snapshot.txt'), 'pinned\n')
        git('add', '.')
        git('commit', '-m', 'pinned snapshot')
        const pinned = git('rev-parse', 'HEAD')
        writeFileSync(join(directory, 'later.txt'), 'not part of this pair\n')
        git('add', '.')
        git('commit', '-m', 'later upstream change')
        git('remote', 'add', 'upstream', directory)
        git('checkout', '-b', 'custom', base)
        writeFileSync(join(directory, 'custom.txt'), 'custom\n')
        git('add', '.')
        git('commit', '-m', 'custom feature')
        const inputHead = git('rev-parse', 'HEAD')
        const functions = SCRIPT.slice(0, SCRIPT.indexOf('\n$repoRoot ='))
        writeFileSync(
          join(directory, 'merge.ps1'),
          `${functions}
$UpstreamCommit = '${pinned}'
$MergeReportPath = Join-Path $PWD 'report.json'
Merge-CustomBranch -BranchName custom -UpstreamRef upstream/main
`
        )
        const result = spawnSync(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-File', 'merge.ps1'],
          {
            cwd: directory,
            encoding: 'utf8',
            windowsHide: true
          }
        )
        expect(result.status, result.stdout + result.stderr).toBe(0)
        expect(git('show', 'HEAD:snapshot.txt')).toBe('pinned')
        expect(git('ls-tree', '--name-only', 'HEAD')).toBe('base.txt\ncustom.txt\nsnapshot.txt')
        expect(
          JSON.parse(readFileSync(join(directory, 'report.json'), 'utf8').replace(/^\uFEFF/, ''))
        ).toMatchObject({
          schema: 2,
          branch: 'custom',
          inputHead,
          upstream: pinned,
          state: 'merged',
          rawConflicts: [],
          remainingConflicts: []
        })
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    },
    30000
  )
})
