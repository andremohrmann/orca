#!/usr/bin/env node
// Custom git merge driver for src/shared/global-settings-base.ts.
//
// Why this file needs one: every feature module (ours and upstream's) contributes one
// `import type { X } from './x'` line plus one member in the `GlobalSettingsBase` intersection.
// Two branches adding different members to the same list is never a real conflict — the correct
// result is always "keep both" — but git's line-based 3-way merge conflicts on it constantly
// because both sides touch adjacent lines. This driver does a proper set-based 3-way merge of the
// import lines and intersection members (using the common ancestor to tell "upstream added this"
// apart from "upstream deleted this feature module entirely"), so this file stops showing up in
// the daily upstream-merge conflict list for a change that was never actually in dispute.
//
// A plain union (ignoring the base) would get this half right and half wrong: it handles the
// common case — both sides add different members — but silently keeps a member upstream removed
// (e.g. a whole settings group deleted in a refactor), reintroducing a "Cannot find module" error
// days later instead of surfacing it as the conflict it actually is. Using the base avoids that.
//
// Registered via .gitattributes (`src/shared/global-settings-base.ts merge=global-settings-base`)
// and `git config merge.global-settings-base.driver`, set up by build-custom-orca-update.ps1
// before it merges upstream. Git invokes it as:
//   node config/scripts/merge-global-settings-base.mjs %O %A %B
// %A is both an input (our side) and the output: the driver must overwrite it with the merged
// result. Exit 0 means "resolved"; nonzero falls back to git's own conflict markers in %A.
import { readFileSync, writeFileSync } from 'node:fs'

const [basePath, oursPath, theirsPath] = process.argv.slice(2)
if (!basePath || !oursPath || !theirsPath) {
  console.error('usage: merge-global-settings-base.mjs <base> <ours> <theirs>')
  process.exit(2)
}

const IMPORT_LINE = /^import type \{ (\w+) \} from '([^']+)'$/
const TYPE_HEADER = /^export type GlobalSettingsBase = /

function parse(text) {
  const lines = text.split('\n')
  const imports = [] // { name, path, line }
  let headerIndex = -1
  for (let i = 0; i < lines.length; i++) {
    const match = IMPORT_LINE.exec(lines[i])
    if (match) {
      imports.push({ name: match[1], path: match[2], line: lines[i] })
      continue
    }
    if (TYPE_HEADER.test(lines[i])) {
      headerIndex = i
      break
    }
  }
  if (headerIndex === -1) {
    return null // Shape changed too much (e.g. a rename); let git fall back to conflict markers.
  }
  // Collect the intersection body: the header's own first member, then one member per
  // subsequent line until a line without a trailing " &" (the last member has none).
  const members = []
  const first = lines[headerIndex].slice(lines[headerIndex].indexOf('= ') + 2)
  let cursor = headerIndex
  let current = first
  while (current.endsWith(' &')) {
    members.push(current.slice(0, -2).trim())
    cursor += 1
    current = (lines[cursor] ?? '').trim()
  }
  members.push(current.trim())
  return { imports, members, trailingLines: lines.slice(cursor + 1) }
}

/** Three-way set merge: keep base items unless one side deleted them; append items either side added, ours first. */
function mergeThreeWay(base, ours, theirs, key) {
  const baseKeys = new Set(base.map(key))
  const oursKeys = new Set(ours.map(key))
  const theirsKeys = new Set(theirs.map(key))
  const byKey = new Map()
  for (const item of [...base, ...ours, ...theirs]) {
    byKey.set(key(item), item)
  }
  const result = []
  const emitted = new Set()
  const emit = (k) => {
    if (!emitted.has(k)) {
      emitted.add(k)
      result.push(byKey.get(k))
    }
  }
  for (const item of base) {
    const k = key(item)
    const removedByOurs = baseKeys.has(k) && !oursKeys.has(k)
    const removedByTheirs = baseKeys.has(k) && !theirsKeys.has(k)
    if (!removedByOurs && !removedByTheirs) {
      emit(k)
    }
  }
  for (const item of ours) {
    if (!baseKeys.has(key(item))) {
      emit(key(item))
    }
  }
  for (const item of theirs) {
    if (!baseKeys.has(key(item))) {
      emit(key(item))
    }
  }
  return result
}

const baseParsed = parse(readFileSync(basePath, 'utf8'))
const oursParsed = parse(readFileSync(oursPath, 'utf8'))
const theirsParsed = parse(readFileSync(theirsPath, 'utf8'))
if (!baseParsed || !oursParsed || !theirsParsed) {
  process.exit(1) // Let git's default conflict markers take over.
}

const imports = mergeThreeWay(
  baseParsed.imports,
  oursParsed.imports,
  theirsParsed.imports,
  (i) => i.path
)
const members = mergeThreeWay(
  baseParsed.members.map((m) => ({ name: m })),
  oursParsed.members.map((m) => ({ name: m })),
  theirsParsed.members.map((m) => ({ name: m })),
  (m) => m.name
).map((m) => m.name)

if (members.length === 0 || imports.length === 0) {
  process.exit(1) // Every member/import survived deletion on both sides — too strange, ask a human.
}

const out = [
  ...imports.map((i) => i.line),
  '',
  '/** Settings groups owned by their feature modules and composed into GlobalSettings. */',
  `export type GlobalSettingsBase = ${members.map((m, i) => (i === members.length - 1 ? m : `${m} &`)).join('\n  ')}`,
  ...oursParsed.trailingLines
].join('\n')

writeFileSync(oursPath, out)
process.exit(0)
