import { afterEach, expect, it, vi } from 'vitest'
import { PluginAgentPresentationFences } from './plugin-agent-presentation-fences'

const version = {
  producerEpoch: 'producer',
  ownerEpoch: 'owner',
  scopeEpoch: 'scope',
  scopeGeneration: 1,
  revision: 1
}
const reader = {
  kind: 'inventory' as const,
  parentRowId: null,
  offset: 100,
  coverageInvalid: false
}
afterEach(() => vi.restoreAllMocks())

it('invalidates evicted and recreated lifetimes rather than reviving old cursors', () => {
  const owner = new PluginAgentPresentationFences()
  const first = owner.accept(owner.begin('plugin', 'workspace', 'grant-A'), version, false)
  if (!first) {
    throw new Error('Version not admitted')
  }
  const token = owner.mint(first, reader)
  for (let index = 0; index < 2000; index += 1) {
    owner.begin('plugin', `other-${index}`, 'grant-A')
  }
  expect(owner.decode(first, token)).toBeNull()
  expect(() => owner.mint(first, reader)).toThrow('Presentation version retired')
  const recreated = owner.accept(owner.begin('plugin', 'workspace', 'grant-A'), version, false)
  if (!recreated) {
    throw new Error('Replacement not admitted')
  }
  expect(owner.decode(recreated, token)).toBeNull()
  expect(owner.decode(recreated, owner.mint(recreated, reader))).toEqual({
    kind: 'inventory',
    parentRowId: null,
    offset: 100,
    coverageInvalid: false
  })
})

it('uses a fresh per-hop lease and refuses grant changes and older semantic generations', () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000)
  const owner = new PluginAgentPresentationFences()
  const first = owner.accept(owner.begin('plugin', 'workspace', 'grant-A'), version, false)
  if (!first) {
    throw new Error('Version not admitted')
  }
  const oldToken = owner.mint(first, reader)
  expect(owner.accept(first, { ...version, scopeEpoch: 'substitute' }, false)).toBeNull()
  expect(owner.accept(first, { ...version, ownerEpoch: 'substitute' }, false)).toBeNull()
  expect(owner.decode(first, oldToken)).toEqual(reader)
  clock.mockReturnValue(50_000)
  const renewed = owner.mint(first, { ...reader, offset: 200 })
  clock.mockReturnValue(90_000)
  expect(owner.decode(first, oldToken)).toBeNull()
  expect(owner.decode(first, renewed)).toEqual({
    kind: 'inventory',
    parentRowId: null,
    offset: 200,
    coverageInvalid: false
  })
  const changed = owner.accept(first, { ...version, scopeGeneration: 2 }, false)
  if (!changed) {
    throw new Error('Current generation not admitted')
  }
  expect(owner.accept(changed, version, false)).toBeNull()
  expect(owner.decode(changed, renewed)).toBeNull()
  const newGrant = owner.begin('plugin', 'workspace', 'grant-B')
  expect(owner.decode(newGrant, renewed)).toBeNull()
  expect(() => owner.mint(changed, reader)).toThrow('Presentation version retired')
})
