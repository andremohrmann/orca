import { getRemoteRuntimeTerminalMultiplexer } from '@/runtime/remote-runtime-terminal-multiplexer'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { getRuntimeEnvironmentRevision } from '@/runtime/runtime-environment-revision'
import type { RemoteRuntimeMultiplexedTerminal } from '@/runtime/remote-runtime-terminal-multiplexer-types'
import { parseRemoteRuntimePtyId } from '../../../../shared/remote-runtime-pty-id'
import type { TerminalPreviewSnapshot } from '../../../../shared/terminal-preview'

type Grid = { cols: number; rows: number }

export function createPreviewRemoteTerminalSession(args: {
  ptyId: string
  onSnapshot: (snapshot: TerminalPreviewSnapshot) => void
  onData: (data: string) => void
  onResize: (grid: Grid) => void
  onUnavailable: () => void
}) {
  const owner = parseRemoteRuntimePtyId(args.ptyId)
  if (!owner && !args.ptyId.startsWith('remote:')) {
    return null
  }
  const ownerRevision = owner?.environmentId
    ? getRuntimeEnvironmentRevision(owner.environmentId)
    : undefined
  let stream: RemoteRuntimeMultiplexedTerminal | null = null
  let generation = 0
  let disposed = false
  let ready = false
  let desiredGrid: Grid | null = null
  let sourceGrid: Grid = { cols: 80, rows: 24 }
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let readyTimer: ReturnType<typeof setTimeout> | null = null
  let retryDelay = 1_000

  const stop = (): void => {
    generation++
    ready = false
    if (retryTimer) {
      clearTimeout(retryTimer)
    }
    if (readyTimer) {
      clearTimeout(readyTimer)
    }
    retryTimer = readyTimer = null
    stream?.close()
    stream = null
  }
  const reconnect = (): void => {
    stop()
    if (disposed) {
      return
    }
    args.onUnavailable()
    retryTimer = setTimeout(() => void start(), retryDelay)
    retryDelay = Math.min(retryDelay * 2, 10_000)
  }
  const claim = (): boolean =>
    Boolean(ready && desiredGrid && stream?.claimViewport(desiredGrid.cols, desiredGrid.rows))

  const start = async (): Promise<void> => {
    stop()
    if (disposed) {
      return
    }
    const currentGeneration = generation
    const isCurrent = (): boolean => !disposed && generation === currentGeneration
    const environmentId = owner?.environmentId
    if (!environmentId || getRuntimeEnvironmentRevision(environmentId) !== ownerRevision) {
      args.onUnavailable()
      return
    }
    readyTimer = setTimeout(() => {
      if (isCurrent()) {
        reconnect()
      }
    }, 10_000)
    try {
      const next = await getRemoteRuntimeTerminalMultiplexer(environmentId).subscribeTerminal({
        terminal: owner.handle,
        client: { id: `dashboard-preview:${createBrowserUuid()}`, type: 'desktop' },
        viewport: desiredGrid ?? undefined,
        callbacks: {
          onData: (data) => {
            if (isCurrent()) {
              args.onData(data)
            }
          },
          onSnapshot: (data, meta) => {
            if (!isCurrent()) {
              return
            }
            sourceGrid = {
              cols: meta?.cols ?? sourceGrid.cols,
              rows: meta?.rows ?? sourceGrid.rows
            }
            args.onSnapshot({ ...meta, ...sourceGrid, data })
          },
          onSubscribed: () => {
            if (!isCurrent()) {
              return
            }
            ready = true
            retryDelay = 1_000
            if (readyTimer) {
              clearTimeout(readyTimer)
            }
            readyTimer = null
            claim()
          },
          onFitOverrideChanged: (grid) => {
            if (!isCurrent()) {
              return
            }
            sourceGrid = { cols: grid.cols, rows: grid.rows }
            args.onResize(sourceGrid)
          },
          onEnd: (verdict) => {
            if (!isCurrent()) {
              return
            }
            if (verdict === 'exited') {
              stop()
              args.onUnavailable()
            } else {
              reconnect()
            }
          },
          onError: () => {
            if (isCurrent()) {
              reconnect()
            }
          },
          onTransportClose: () => {
            if (isCurrent()) {
              reconnect()
            }
          }
        }
      })
      if (!isCurrent()) {
        next.close()
        return
      }
      stream = next
      // The initial snapshot can arrive before subscribeTerminal resolves.
      if (ready) {
        claim()
      }
    } catch {
      if (isCurrent()) {
        reconnect()
      }
    }
  }

  return {
    start,
    input: (data: string): boolean => Boolean(ready && stream?.sendInput(data)),
    fit: async (_ptyId: string, cols: number, rows: number): Promise<Grid | null> => {
      desiredGrid = { cols, rows }
      return claim() ? desiredGrid : null
    },
    releaseFit: async (): Promise<void> => {
      if (!desiredGrid || disposed) {
        return
      }
      desiredGrid = null
      // Unsubscribe releases this viewer on old servers too; reattach as a passive viewer.
      await start()
    },
    dispose: (): void => {
      disposed = true
      stop()
    }
  }
}
