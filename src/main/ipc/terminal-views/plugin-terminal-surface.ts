import {
  PluginTerminalSurfaceLeases,
  type PluginTerminalSurfaceLease
} from './plugin-terminal-surface-leases'
import { ipcMain, type WebContents } from 'electron'
import type { OrcaRuntimeService } from '../../runtime/orca-runtime'
import {
  TerminalPreviewOutputStream,
  TERMINAL_PREVIEW_OUTPUT_BATCH_MAX_BYTES
} from './terminal-preview-output-stream'
import { observeTerminalSurfaceApproval } from './plugin-terminal-surface-approval'
export { bindTerminalSurfacePlugins } from './plugin-terminal-surface-approval'

let disposeRegistered = (): void => {}

export function registerPluginTerminalSurfaceHandlers(runtime: OrcaRuntimeService): void {
  disposeRegistered()
  for (const operation of [
    'resolve',
    'connect',
    'input',
    'ack',
    'fit',
    'releaseFit',
    'unsubscribe',
    'dispose'
  ]) {
    ipcMain.removeHandler(`pluginTerminalSurface:${operation}`)
  }
  const leases = new PluginTerminalSurfaceLeases(runtime)
  const surfaces = leases.surfaces
  const live = (surface: PluginTerminalSurfaceLease, interactive = false) =>
    leases.current(surface, interactive)
  const get = (contents: WebContents, id: unknown, interactive = false) =>
    leases.get(contents, id, interactive)
  const sweep = (): void => {
    for (const surface of surfaces.values()) {
      if (!live(surface)) {
        surface.dispose()
      } else if (!live(surface, true)) {
        surface.release()
      }
    }
  }
  const stopApproval = observeTerminalSurfaceApproval(sweep)
  disposeRegistered = () => {
    stopApproval()
    leases.dispose()
  }
  ipcMain.handle('pluginTerminalSurface:resolve', (event, args) =>
    leases.resolve(event.sender, args)
  )
  ipcMain.handle(
    'pluginTerminalSurface:connect',
    async (event, args: { id?: unknown; scrollbackRows?: number }) => {
      const surface = get(event.sender, args?.id)
      if (!surface) {
        return { snapshot: null, replay: [] }
      }
      if (surface.remote) {
        return surface.remote.connect(args.scrollbackRows)
      }
      surface.stream?.dispose()
      const stream = new TerminalPreviewOutputStream(
        event.sender,
        surface.id,
        runtime.registerRawTerminalViewSubscriber(surface.ptyId),
        () => {
          if (surface.stream === stream) {
            surface.stream = null
          }
          if (!live(surface)) {
            surface.dispose()
          }
        },
        { channel: 'pluginTerminalSurface:data', allowed: () => live(surface) }
      )
      surface.stream = stream
      let offData = (): void => {}
      let offResize = (): void => {}
      stream.setDataSubscription(() => {
        offData()
        offResize()
      })
      try {
        offData = runtime.subscribeToTerminalData(surface.ptyId, (data, meta) => {
          if (!live(surface)) {
            surface.dispose()
            return
          }
          stream.append(data, meta)
        })
        offResize = runtime.subscribeToTerminalResize(surface.ptyId, () => stream.requestResync())

        const scrollbackRows = Math.max(
          0,
          Math.min(1000, Number.isFinite(args.scrollbackRows) ? args.scrollbackRows! : 24)
        )
        let snapshot = await runtime.serializeTerminalBuffer(surface.ptyId, { scrollbackRows })
        if (stream.disposed || !live(surface)) {
          stream.dispose()
          return { snapshot: null, replay: [] }
        }
        let resyncRequired = false
        if (stream.consumeInitialOverflow()) {
          snapshot = await runtime.serializeTerminalBuffer(surface.ptyId, { scrollbackRows })
          resyncRequired = stream.consumeInitialOverflow()
        }
        if (!snapshot || stream.disposed || !live(surface)) {
          stream.dispose()
          return { snapshot: null, replay: [] }
        }
        const replay = stream.completeSnapshot(snapshot.seq)
        if (resyncRequired) {
          stream.pauseForReconnect()
        }
        return { snapshot, replay, resyncRequired }
      } catch {
        stream.dispose()
        return { snapshot: null, replay: [] }
      }
    }
  )
  ipcMain.handle('pluginTerminalSurface:input', (event, args: { id?: unknown; data?: unknown }) => {
    const surface = get(event.sender, args?.id, true)
    return surface && typeof args.data === 'string' && args.data.length <= 65536
      ? surface.remote
        ? surface.remote.input(args.data)
        : runtime.writeTerminalPreviewInput(surface.ptyId, args.data)
      : false
  })
  ipcMain.handle('pluginTerminalSurface:ack', (event, args: { id?: unknown; bytes?: unknown }) => {
    const surface = get(event.sender, args?.id)
    if (
      surface &&
      typeof args.bytes === 'number' &&
      Number.isFinite(args.bytes) &&
      args.bytes > 0 &&
      args.bytes <= TERMINAL_PREVIEW_OUTPUT_BATCH_MAX_BYTES
    ) {
      if (surface.remote) {
        surface.remote.ack(args.bytes)
      } else {
        surface.stream?.acknowledge(args.bytes)
      }
    }
  })
  ipcMain.handle(
    'pluginTerminalSurface:fit',
    async (event, args: { id?: unknown; cols?: unknown; rows?: unknown }) => {
      const surface = get(event.sender, args?.id, true)
      if (
        !surface ||
        typeof args.cols !== 'number' ||
        typeof args.rows !== 'number' ||
        !Number.isFinite(args.cols) ||
        !Number.isFinite(args.rows)
      ) {
        return null
      }
      if (surface.remote) {
        return surface.remote.fit(args.cols, args.rows)
      }
      surface.release()
      const key = `plugin-surface:${surface.id}:${++surface.fitEpoch}`
      surface.viewerKey = key
      let applied: boolean
      try {
        applied = await runtime.updateRemoteDesktopViewer(
          surface.ptyId,
          key,
          key,
          Math.max(2, Math.min(500, Math.floor(args.cols))),
          Math.max(2, Math.min(200, Math.floor(args.rows)))
        )
      } catch {
        if (surface.viewerKey === key) {
          surface.release()
        }
        await runtime.unregisterRemoteDesktopViewer(surface.ptyId, key).catch(() => undefined)
        return null
      }
      if (!applied || surface.viewerKey !== key || !get(event.sender, args.id, true)) {
        if (surface.viewerKey === key) {
          surface.viewerKey = null
        }
        await runtime.unregisterRemoteDesktopViewer(surface.ptyId, key)
        return null
      }
      return runtime.getTerminalSize(surface.ptyId)
    }
  )
  ipcMain.handle('pluginTerminalSurface:unsubscribe', (event, args: { id?: unknown }) => {
    const surface = typeof args?.id === 'string' ? surfaces.get(args.id) : null
    if (surface?.contents === event.sender) {
      void surface.remote?.unsubscribe()
      surface.stream?.dispose()
      surface.stream = null
      surface.release()
    }
  })
  ipcMain.handle('pluginTerminalSurface:releaseFit', (event, args: { id?: unknown }) => {
    const surface = get(event.sender, args?.id)
    if (surface?.remote) {
      return surface.remote.releaseFit()
    }
    surface?.release()
    return undefined
  })
  ipcMain.handle('pluginTerminalSurface:dispose', (event, args: { id?: unknown }) => {
    const surface = typeof args?.id === 'string' ? surfaces.get(args.id) : null
    if (surface?.contents === event.sender) {
      surface.dispose()
    }
  })
}
