import { expect, it } from 'vitest'
import { retireChangedTerminalPreviewProfile } from './terminal-multiplex-preview-profile'
import type { TerminalMultiplexConnection } from './terminal-multiplex-connection'
import type { TerminalMultiplexStream } from './terminal-stream-types'

it('retires a changed profile exactly once without allowing an old callback to detach a reused stream slot', () => {
  const events: unknown[] = []
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: profile retirement reads only these stream identity and negotiation fields.
  const stream = {
    streamId: 1,
    terminal: 'stable',
    supportsViewportLease: true,
    previewTarget: { worktreeId: 'workspace', incarnationId: 'incarnation', profileKey: 'old' }
  } as TerminalMultiplexStream
  const successor: TerminalMultiplexStream = {
    ...stream,
    previewTarget: { worktreeId: 'workspace', incarnationId: 'incarnation', profileKey: 'new' }
  }
  const streams = new Map([[1, stream]])
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the real retirement function uses only this registry, descriptor, detach and event boundary.
  const state = {
    closed: false,
    streams,
    runtime: {
      describePluginTerminalSurface: () => ({
        worktreeId: 'workspace',
        incarnationId: 'incarnation',
        profileKey: 'new'
      })
    },
    detachStream: (id: number) => {
      streams.delete(id)
    },
    emit: (event: unknown) => {
      events.push(event)
    }
  } as unknown as TerminalMultiplexConnection
  expect(retireChangedTerminalPreviewProfile(state, stream)).toBe(true)
  expect(streams.size).toBe(0)
  expect(events).toEqual([{ type: 'preview-profile-changed', streamId: 1 }])
  streams.set(1, successor)
  expect(retireChangedTerminalPreviewProfile(state, stream)).toBe(true)
  expect(streams.get(1)).toBe(successor)
  expect(events).toHaveLength(1)
  expect(retireChangedTerminalPreviewProfile(state, successor)).toBe(false)
})
