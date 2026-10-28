import { describe, expect, it } from 'vitest'
import { terminalPreviewUnavailableMessage } from './terminal-preview-unavailable-message'

describe('terminalPreviewUnavailableMessage', () => {
  it('reports the generic no-preview message only for a pty the client could have observed', () => {
    const local = terminalPreviewUnavailableMessage({ ptyId: 'pty-1' })
    expect(local).toMatch(/no preview available/i)
    expect(local).not.toMatch(/remote session/)
    expect(terminalPreviewUnavailableMessage({ hostKind: 'local' })).toBe(local)
  })

  it('reports an unobservable remote preview instead of the generic no-preview message', () => {
    // Missing remote snapshots prove loss of observation, not pane exit; see docs/reference/ssh-execution-boundary.md.
    const fromPtyId = terminalPreviewUnavailableMessage({ ptyId: 'ssh:devbox@@pty-3' })
    expect(fromPtyId).toMatch(/remote session/)
    expect(fromPtyId).not.toBe(terminalPreviewUnavailableMessage({ ptyId: 'pty-1' }))
    expect(terminalPreviewUnavailableMessage({ hostKind: 'ssh' })).toBe(fromPtyId)
    expect(terminalPreviewUnavailableMessage({ ptyId: 'remote:other-server@@pty-3' })).toBe(
      fromPtyId
    )
  })

  it('reports a paired-server card as remote instead of claiming its pane closed (#25688)', () => {
    const remote = terminalPreviewUnavailableMessage({ hostKind: 'ssh' })
    expect(terminalPreviewUnavailableMessage({ hostKind: 'remote' })).toBe(remote)
    expect(terminalPreviewUnavailableMessage({ ptyId: 'remote:env-1@@term_1' })).toBe(remote)
    expect(terminalPreviewUnavailableMessage({ ptyId: 'remote:term_1' })).toBe(remote)
  })
})
