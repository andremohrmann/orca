import { expect, it } from 'vitest'
import { createCanonicalPresentationFixture } from './plugin-agent-presentation.test-fixture'
import {
  createAgentPresentationReader,
  type AgentPresentationSelection
} from './plugin-agent-presentation-reader'

it('enumerates 101 real Unicode-heavy summaries within the whole-response budget while reserving every continuation', () => {
  const { store, workspaceKey } = createCanonicalPresentationFixture(101, '界'.repeat(2048))
  const reader = createAgentPresentationReader()
  let selection: AgentPresentationSelection | null = null
  const ids = new Set<string>()
  let finished = false
  while (!finished) {
    const page = reader.readPage(
      {
        params: {
          projectionVersion: 1,
          workspaceId: workspaceKey,
          requestKey: selection ? '\0'.repeat(128) : 'short'
        },
        worktreeId: workspaceKey,
        hostId: 'local',
        kind: 'worktree',
        ownerEpoch: 'fixture-live-owner',
        selection
      },
      store,
      new Map()
    )
    const result = page.result
    expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThanOrEqual(524288)
    expect(result.totalRows).toBe(101)
    expect(result.status).not.toBe('unavailable')
    if (result.status === 'unavailable') {
      throw new Error('Canonical inventory unavailable')
    }
    if (!selection) {
      expect(result.reason).toBe('byte-limit')
    }
    expect(result.rows.length).toBeGreaterThan(0)
    for (const row of result.rows) {
      expect(ids.has(row.rowId)).toBe(false)
      ids.add(row.rowId)
    }
    finished = page.nextReader === null
    selection = page.nextReader ? { ...page.nextReader, version: result.version } : null
    if (finished) {
      expect(result.status).toBe('complete')
    }
  }
  expect(ids.size).toBe(101)
})
