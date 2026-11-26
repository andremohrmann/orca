import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runProcess } from '@orca/process-host'

async function git(repo, args, allowed = [0]) {
  const result = await runProcess({
    program: 'git',
    args: ['-C', repo, ...args],
    timeoutMs: 120_000,
    maxOutputBytes: 16 * 1024 * 1024,
    terminationBarrier: true
  })
  if (result.timedOut || result.outputTruncated || !allowed.includes(result.code)) {
    throw new Error(`git ${args[0]} failed (${result.code}): ${result.stderr}`)
  }
  return result
}

export function parseMergeTree(output, code) {
  const [tree, ...parts] = output.split('\0')
  if (!/^[0-9a-f]{40,64}$/.test(tree) || ![0, 1].includes(code)) {
    throw new Error('Invalid merge-tree result')
  }
  const end = parts.indexOf('')
  if (end === -1) {
    throw new Error('Missing merge-tree path terminator')
  }
  const stages = parts.slice(0, end).map((entry) => {
    const match = /^(\d+) ([0-9a-f]{40,64}) ([123])\t([\s\S]+)$/.exec(entry)
    if (!match) {
      throw new Error('Invalid merge-tree conflict stage')
    }
    return { stage: Number(match[3]), path: match[4] }
  })
  const conflicts = [...new Set(stages.map((entry) => entry.path))]
  if ((code === 0) !== (conflicts.length === 0)) {
    throw new Error('Merge status/path mismatch')
  }
  return { tree, conflicts, stages }
}

export async function probeMerge(repo, head, upstream) {
  const result = await git(
    repo,
    [
      '-c',
      'merge.global-settings-base.driver=node config/scripts/merge-global-settings-base.mjs %O %A %B',
      'merge-tree',
      '--write-tree',
      '-z',
      head,
      upstream
    ],
    [0, 1]
  )
  const merged = parseMergeTree(result.stdout, result.code)
  const script = (await git(repo, ['show', `${head}:config/scripts/build-custom-orca-update.ps1`]))
    .stdout
  const allowlist = script.match(/\$customContentConflictAllowlist = @\(([\s\S]*?)\)/)?.[1]
  if (!allowlist) {
    throw new Error('Missing explicit conflict policy')
  }
  const customPaths = [...allowlist.matchAll(/'([^']+)'/g)].map((m) => m[1])
  const unresolvedConflicts = merged.conflicts.filter((path) => {
    const ours = merged.stages.some((entry) => entry.path === path && entry.stage === 2)
    const theirs = merged.stages.some((entry) => entry.path === path && entry.stage === 3)
    if (
      path.startsWith('.github/workflows/') &&
      path !== '.github/workflows/custom-windows-update.yml' &&
      !ours
    ) {
      return false
    }
    if (customPaths.includes(path) && ours) {
      return false
    }
    return !(!customPaths.includes(path) && ours && !theirs)
  })
  return {
    head,
    upstream,
    ...merged,
    sourceConflicts: merged.conflicts.filter((p) => !p.startsWith('.github/workflows/')),
    workflowConflicts: merged.conflicts.filter((p) => p.startsWith('.github/workflows/')),
    allowlistedConflicts: merged.conflicts.filter((p) => customPaths.includes(p)),
    unresolvedConflicts,
    unresolvedSourceConflicts: unresolvedConflicts.filter(
      (p) => !p.startsWith('.github/workflows/')
    )
  }
}

async function atomicJson(path, value) {
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
  await rename(temporary, path)
}

export async function collectComparison(repo, directory, now = new Date()) {
  await mkdir(directory, { recursive: true })
  const lockPath = join(directory, 'collect.lock')
  const lock = await open(lockPath, 'wx')
  try {
    const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
    if (manifest.schema !== 1 || manifest.mode !== 'frozen-pair') {
      throw new Error('Unknown trial mode')
    }
    if (
      manifest.cutoffs.length !== 7 ||
      new Set(manifest.cutoffs).size !== 7 ||
      manifest.cutoffs.some((value) => !Number.isFinite(Date.parse(value)))
    ) {
      throw new Error('Expected seven distinct daily cutoffs')
    }
    for (const sha of [manifest.baseline, manifest.experiment]) {
      if (!/^[0-9a-f]{40}$/.test(sha)) {
        throw new Error('Expected immutable commit SHA')
      }
      await git(repo, ['cat-file', '-e', `${sha}^{commit}`])
    }
    await git(repo, [
      'fetch',
      '--no-tags',
      'https://github.com/stablyai/orca.git',
      '+refs/heads/main:refs/remotes/conflict-trial/main'
    ])
    const observations = []
    for (const cutoff of manifest.cutoffs) {
      if (new Date(cutoff) > now) {
        continue
      }
      const file = join(directory, `${cutoff.slice(0, 10)}.json`)
      try {
        const saved = JSON.parse(await readFile(file, 'utf8'))
        if (
          saved.cutoff !== cutoff ||
          saved.baseline.head !== manifest.baseline ||
          saved.experiment.head !== manifest.experiment ||
          saved.baseline.upstream !== saved.experiment.upstream
        ) {
          throw new Error(`Observation does not match the frozen pair: ${file}`)
        }
        observations.push(saved)
        continue
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error
        }
      }
      const upstream = (
        await git(repo, [
          'log',
          '-1',
          `--until=${cutoff}`,
          '--format=%H',
          'refs/remotes/conflict-trial/main'
        ])
      ).stdout.trim()
      if (!upstream) {
        throw new Error(`No upstream commit at ${cutoff}`)
      }
      const baseline = await probeMerge(repo, manifest.baseline, upstream)
      const experiment = await probeMerge(repo, manifest.experiment, upstream)
      const sample = { cutoff, collectedAt: now.toISOString(), baseline, experiment }
      await atomicJson(file, sample)
      observations.push(sample)
    }
    const complete = observations.length === manifest.cutoffs.length
    const summary = { manifest, complete, observations }
    await atomicJson(join(directory, 'summary.json'), summary)
    console.log(JSON.stringify({ complete, samples: observations.length, directory }))
    return summary
  } finally {
    await lock.close()
    await unlink(lockPath)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [repo, directory] = process.argv.slice(2)
  if (!repo || !directory) {
    throw new Error('Usage: merge-comparison.mjs <repo> <evidence-directory>')
  }
  await collectComparison(resolve(repo), resolve(directory))
}
