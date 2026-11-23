import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { PluginWindowPreferences } from './plugin-window-preferences'
import { writePluginFileAtomically } from '../installation/plugin-atomic-file-write'

const roots: string[] = []
function root(): string {
  const path = mkdtempSync(join(tmpdir(), 'orca-window-preferences-'))
  roots.push(path)
  return path
}
afterEach(() => {
  for (const path of roots.splice(0)) {
    rmSync(path, { recursive: true, force: true })
  }
})

it('does not restore another install revision’s startup consent, opacity or bounds', async () => {
  const path = root()
  await new PluginWindowPreferences(path).set('author.plugin/dashboard', 'a'.repeat(64), {
    startup: 'popout',
    opacity: 0.6,
    bounds: { x: 40, y: 60, width: 960, height: 720 }
  })
  const reloaded = new PluginWindowPreferences(path)
  await reloaded.whenReady()
  expect(reloaded.get('author.plugin/dashboard', 'a'.repeat(64))).toEqual({
    revision: 'a'.repeat(64),
    startup: 'popout',
    opacity: 0.6,
    bounds: { x: 40, y: 60, width: 960, height: 720 }
  })
  expect(reloaded.get('author.plugin/dashboard', 'b'.repeat(64))).toEqual({
    revision: 'b'.repeat(64),
    startup: null,
    opacity: 1,
    bounds: null
  })
  expect(reloaded.get('other.plugin/dashboard', 'a'.repeat(64)).startup).toBeNull()
})

it('refuses to overwrite an unreadable preference document', async () => {
  const path = root()
  const file = join(path, 'plugin-window-presentation.json')
  writeFileSync(file, '{broken')
  const preferences = new PluginWindowPreferences(path)
  await expect(
    preferences.set('author.plugin/dashboard', 'a'.repeat(64), { startup: 'popout' })
  ).rejects.toThrow('refusing to overwrite')
  expect(readFileSync(file, 'utf8')).toBe('{broken')
})

it('serializes concurrent patches and drops a revoked queued write without losing committed state', async () => {
  const path = root()
  const preferences = new PluginWindowPreferences(path)
  const key = 'author.plugin/dashboard'
  const revision = 'a'.repeat(64)
  const first = preferences.set(key, revision, { opacity: 0.6 })
  const second = preferences.set(key, revision, { startup: 'popout' })
  await Promise.all([first, second])
  await expect(
    preferences.set(key, revision, { opacity: 0.2 }, () => {
      throw new Error('approval revoked')
    })
  ).rejects.toThrow('approval revoked')
  const reloaded = new PluginWindowPreferences(path)
  await reloaded.whenReady()
  expect(reloaded.get(key, revision)).toEqual({
    revision,
    opacity: 0.6,
    startup: 'popout',
    bounds: null
  })
})

it('rejects a document whose indented bytes would exceed the bounded reload limit', async () => {
  const path = root()
  const preferences = new PluginWindowPreferences(path)
  await expect(
    preferences.set('x'.repeat(1_048_440), 'a'.repeat(64), { startup: 'popout' })
  ).rejects.toThrow('storage limit')
  expect(readdirSync(path)).toEqual([])
})

it('keeps committed bytes and removes the staged file when publication authority is revoked', async () => {
  const path = root()
  const file = join(path, 'presentation.json')
  writeFileSync(file, 'committed')
  await expect(
    writePluginFileAtomically(file, 'revoked', {
      assertPublish: () => {
        throw new Error('approval revoked')
      }
    })
  ).rejects.toThrow('approval revoked')
  expect(readFileSync(file, 'utf8')).toBe('committed')
  expect(readdirSync(path)).toEqual(['presentation.json'])
})
