import { ipcRenderer } from 'electron'
import type {
  TerminalPreviewConnectResult,
  TerminalPreviewDataPayload
} from '../../../shared/terminal/replay/terminal-preview'
import type { PreloadApi } from '../../api-types'

const availabilityCallbacks = new Set<() => void>()
function notifyAvailable(): void {
  for (const callback of availabilityCallbacks) {
    callback()
  }
}

export const terminalPreviewApi = {
  pluginSurface: {
    onAvailable: (callback: () => void) => {
      if (availabilityCallbacks.size === 0) {
        ipcRenderer.on('pluginTerminalSurface:available', notifyAvailable)
      }
      availabilityCallbacks.add(callback)
      return () => {
        availabilityCallbacks.delete(callback)
        if (availabilityCallbacks.size === 0) {
          ipcRenderer.removeListener('pluginTerminalSurface:available', notifyAvailable)
        }
      }
    },
    resolve: (sessionToken: string, terminalId: string, hostId?: string) =>
      ipcRenderer.invoke('pluginTerminalSurface:resolve', { sessionToken, terminalId, hostId }),
    connect: (id: string, scrollbackRows?: number) =>
      ipcRenderer.invoke('pluginTerminalSurface:connect', { id, scrollbackRows }),
    input: (id: string, data: string) =>
      ipcRenderer.invoke('pluginTerminalSurface:input', { id, data }),
    fit: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke('pluginTerminalSurface:fit', { id, cols, rows }),
    ack: (id: string, bytes: number) =>
      ipcRenderer.invoke('pluginTerminalSurface:ack', { id, bytes }),
    unsubscribe: (id: string) => ipcRenderer.invoke('pluginTerminalSurface:unsubscribe', { id }),
    releaseFit: (id: string) => ipcRenderer.invoke('pluginTerminalSurface:releaseFit', { id }),
    dispose: (id: string) => ipcRenderer.invoke('pluginTerminalSurface:dispose', { id }),
    onData: (callback: (payload: TerminalPreviewDataPayload) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: TerminalPreviewDataPayload
      ): void => callback(payload)
      ipcRenderer.on('pluginTerminalSurface:data', listener)
      return () => ipcRenderer.removeListener('pluginTerminalSurface:data', listener)
    },
    onRevoked: (callback: (payload: { id: string; reason?: 'profile_changed' }) => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: { id: string; reason?: 'profile_changed' }
      ): void => callback(payload)
      ipcRenderer.on('pluginTerminalSurface:revoked', listener)
      return () => ipcRenderer.removeListener('pluginTerminalSurface:revoked', listener)
    }
  },
  connect: (
    ptyId: string,
    opts?: { scrollbackRows?: number }
  ): Promise<TerminalPreviewConnectResult> =>
    ipcRenderer.invoke('terminalPreview:connect', { ptyId, opts }),
  input: (ptyId: string, data: string): Promise<boolean> =>
    ipcRenderer.invoke('terminalPreview:input', { ptyId, data }),
  fit: (
    ptyId: string,
    cols: number,
    rows: number
  ): Promise<{ cols: number; rows: number } | null> =>
    ipcRenderer.invoke('terminalPreview:fit', { ptyId, cols, rows }),
  ack: (ptyId: string, bytes: number): Promise<void> =>
    ipcRenderer.invoke('terminalPreview:ack', { ptyId, bytes }),
  unsubscribe: (ptyId: string): Promise<void> =>
    ipcRenderer.invoke('terminalPreview:unsubscribe', { ptyId }),
  onData: (callback: (payload: TerminalPreviewDataPayload) => void): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: TerminalPreviewDataPayload
    ): void => callback(payload)
    ipcRenderer.on('terminalPreview:data', listener)
    return () => ipcRenderer.removeListener('terminalPreview:data', listener)
  }
} satisfies PreloadApi['terminalPreview']
