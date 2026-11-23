import { describe, expect, it } from 'vitest'
import {
  applyAttachedTerminalViewport,
  createTerminalViewportSubscriptionKey
} from './terminal-stream-viewport-lease'

function gate() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('terminal stream geometry lifetime', () => {
  it('does not allocate a viewport queued behind a detached stream', async () => {
    const blocked = gate()
    let attached = true
    let allocated = 0
    const viewers = new Set<string>()
    const queued = blocked.promise.then(() =>
      applyAttachedTerminalViewport({
        isAttached: () => attached,
        apply: async () => {
          allocated++
          viewers.add('retired')
          return true
        },
        release: () => {
          viewers.delete('retired')
        }
      })
    )
    attached = false
    blocked.resolve()
    expect(await queued).toBe(false)
    expect(allocated).toBe(0)
    expect([...viewers]).toEqual([])
  })

  it('releases a late viewport without deleting a successor stream claim', async () => {
    const blocked = gate()
    let attached = true
    const viewers = new Set<string>()
    const retired = createTerminalViewportSubscriptionKey('same-connection', 1)
    const successor = createTerminalViewportSubscriptionKey('same-connection', 1)
    const pending = applyAttachedTerminalViewport({
      isAttached: () => attached,
      apply: async () => {
        await blocked.promise
        viewers.add(retired)
        return true
      },
      release: () => {
        viewers.delete(retired)
      }
    })
    attached = false
    viewers.delete(retired)
    viewers.add(successor)
    blocked.resolve()
    expect(await pending).toBe(false)
    expect(viewers.size).toBe(1)
    expect(viewers.has(successor)).toBe(true)
  })
})
