import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runProcess } from '@orca/process-host'
import { expect, it } from 'vitest'
import { parseMergeTree, probeMerge } from './merge-comparison.mjs'

it('measures the same upstream against both heads without changing the checkout', async () => {
  const repo = await mkdtemp(join(tmpdir(), 'orca-merge-pair-'))
  const git = async (...args) => {
    const result = await runProcess({
      program: 'git',
      args: ['-C', repo, ...args],
      timeoutMs: 10_000
    })
    if (result.code !== 0) {
      throw new Error(result.stderr)
    }
    return result.stdout.trim()
  }
  const commit = async (value) => {
    await writeFile(join(repo, 'source.ts'), value)
    await writeFile(join(repo, 'owned.ts'), value)
    await git('add', '.')
    await git('-c', 'commit.gpgsign=false', 'commit', '-m', value)
    return git('rev-parse', 'HEAD')
  }
  try {
    await git('init')
    await git('config', 'user.name', 'Merge probe')
    await git('config', 'user.email', 'probe@example.invalid')
    await mkdir(join(repo, 'config/scripts'), { recursive: true })
    await mkdir(join(repo, '.github/workflows'), { recursive: true })
    await writeFile(join(repo, '.github/workflows/stock.yml'), 'base\n')
    await writeFile(
      join(repo, 'config/scripts/build-custom-orca-update.ps1'),
      "$customContentConflictAllowlist = @(\n  'owned.ts'\n)\n"
    )
    const base = await commit('base\n')
    await git('rm', '.github/workflows/stock.yml')
    const baseline = await commit('custom implementation\n')
    await git('checkout', '--detach', base)
    await writeFile(join(repo, '.github/workflows/stock.yml'), 'upstream\n')
    const upstream = await commit('upstream implementation\n')
    const conflicting = await probeMerge(repo, baseline, upstream)
    const clean = await probeMerge(repo, base, upstream)
    expect(conflicting.sourceConflicts).toEqual(['owned.ts', 'source.ts'])
    expect(conflicting.allowlistedConflicts).toEqual(['owned.ts'])
    expect(conflicting.workflowConflicts).toEqual(['.github/workflows/stock.yml'])
    expect(conflicting.unresolvedSourceConflicts).toEqual(['source.ts'])
    expect(clean.conflicts).toEqual([])
    expect(await git('rev-parse', 'HEAD')).toBe(upstream)
    expect(await git('status', '--porcelain')).toBe('')
    expect(() => parseMergeTree('fatal: missing ref', 128)).toThrow('Invalid merge-tree result')
  } finally {
    await rm(repo, { recursive: true, force: true })
  }
})
