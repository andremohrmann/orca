import { randomUUID } from 'node:crypto'
import {
  decodeTerminalStreamJson,
  type TerminalStreamFrame
} from '../../../../../shared/terminal/stream/terminal-stream-protocol'

export function decodeTerminalViewportFrame(
  payload: TerminalStreamFrame['payload']
): { cols: number; rows: number } | null {
  const viewport = decodeTerminalStreamJson<{ cols?: unknown; rows?: unknown }>(payload)
  return viewport && typeof viewport.cols === 'number' && typeof viewport.rows === 'number'
    ? { cols: viewport.cols, rows: viewport.rows }
    : null
}

export async function applyAttachedTerminalViewport(args: {
  isAttached: () => boolean
  apply: () => Promise<boolean>
  release: () => unknown
}): Promise<boolean> {
  if (!args.isAttached()) {
    return false
  }
  try {
    const applied = await args.apply()
    if (!args.isAttached()) {
      await args.release()
      return false
    }
    return applied
  } catch (error) {
    if (!args.isAttached()) {
      await args.release()
    }
    throw error
  }
}

export function createTerminalViewportSubscriptionKey(
  connectionId: string,
  streamId: number
): string {
  return `multiplex:${connectionId}:${streamId}:${randomUUID()}`
}
