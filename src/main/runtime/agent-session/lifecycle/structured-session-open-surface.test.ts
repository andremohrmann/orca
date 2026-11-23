import { expect, test } from 'vitest'
import { structuredSessionSurfaceIsOpen } from './structured-session-open-surface'

test('existing-only reveal loses admission when the captured presentation closes or is replaced', () => {
  const captured = { worktreeId: 'workspace-1', tabId: 'tab-1' }
  const surface = { tableId: 'tab-1', presentation: { raw: captured, saved: [] } }
  let raw: typeof captured | null = captured
  let tableId: string | null = 'tab-1'
  const host = { getSessionTabId: () => tableId }
  const runtime = { currentLocalStructuredSessionPresentation: () => raw }
  expect(structuredSessionSurfaceIsOpen(host, 'session-1', surface, runtime)).toBe(true)
  raw = null
  expect(structuredSessionSurfaceIsOpen(host, 'session-1', surface, runtime)).toBe(false)
  raw = { worktreeId: 'workspace-1', tabId: 'replacement-tab' }
  expect(structuredSessionSurfaceIsOpen(host, 'session-1', surface, runtime)).toBe(false)
  raw = captured
  tableId = null
  expect(structuredSessionSurfaceIsOpen(host, 'session-1', surface, runtime)).toBe(false)
})
