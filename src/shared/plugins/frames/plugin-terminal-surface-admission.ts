import type {
  PluginTerminalSurfaceApi,
  PluginTerminalSurfaceTarget
} from './plugin-terminal-surface'

export async function resolveTerminalSurfaceWhenAvailable(
  transport: PluginTerminalSurfaceApi,
  sessionToken: string,
  terminalId: string,
  signal: AbortSignal,
  hostId?: string
): Promise<PluginTerminalSurfaceTarget | null> {
  let revision = 0
  let wake: (() => void) | undefined
  const abort = (): void => {
    wake?.()
    wake = undefined
  }
  const off = transport.onAvailable(() => {
    revision++
    abort()
  })
  signal.addEventListener('abort', abort)
  try {
    while (!signal.aborted) {
      const before = revision
      const result = await transport.resolve(sessionToken, terminalId, hostId)
      if (result && !('unavailable' in result)) {
        if (signal.aborted) {
          await transport.dispose(result.id)
          return null
        }
        return result
      }
      if (!result || signal.aborted) {
        return null
      }
      if (revision === before) {
        await new Promise<void>((resolve) => {
          wake = resolve
        })
      }
    }
    return null
  } finally {
    off()
    signal.removeEventListener('abort', abort)
  }
}
