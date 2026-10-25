import { ipcRenderer } from 'electron'
import type {
  DashboardAssignWorkspaceStatusArgs,
  DashboardRenameWorkspaceArgs,
  DashboardRevealAgentArgs,
  DashboardSnapshot
} from '../../shared/dashboard-snapshot'
import type { AgentDashboardView } from '../../shared/agent-dashboard-view'
import type { PreloadApi } from '../api-types'

export const dashboardApi = {
  // Open the pop-out dashboard window, or focus it if already open.
  openPopout: (view?: AgentDashboardView): Promise<void> =>
    ipcRenderer.invoke('dashboardPopout:open', view),

  publishSnapshot: (snapshot: DashboardSnapshot): Promise<void> =>
    ipcRenderer.invoke('dashboard:publishSnapshot', snapshot),
  getPopoutOpen: (): Promise<boolean> => ipcRenderer.invoke('dashboard:getPopoutOpen'),
  onPopoutOpenChanged: (callback: (open: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, open: boolean): void => callback(open)
    ipcRenderer.on('dashboard:popoutOpenChanged', listener)
    return () => ipcRenderer.removeListener('dashboard:popoutOpenChanged', listener)
  },
  onSnapshotRequested: (callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('dashboard:snapshotRequested', listener)
    return () => ipcRenderer.removeListener('dashboard:snapshotRequested', listener)
  },
  onRevealAgent: (callback: (args: DashboardRevealAgentArgs) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, args: DashboardRevealAgentArgs): void =>
      callback(args)
    ipcRenderer.on('ui:revealDashboardAgent', listener)
    return () => ipcRenderer.removeListener('ui:revealDashboardAgent', listener)
  },
  onAckAgent: (callback: (paneKey: string, intent: 'view' | 'explicit') => void): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      ack: { paneKey: string; intent: 'view' | 'explicit' }
    ): void => callback(ack.paneKey, ack.intent)
    ipcRenderer.on('ui:ackDashboardAgent', listener)
    return () => ipcRenderer.removeListener('ui:ackDashboardAgent', listener)
  },
  onAssignWorkspaceStatus: (
    callback: (args: DashboardAssignWorkspaceStatusArgs) => void
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      args: DashboardAssignWorkspaceStatusArgs
    ): void => callback(args)
    ipcRenderer.on('ui:assignDashboardWorkspaceStatus', listener)
    return () => ipcRenderer.removeListener('ui:assignDashboardWorkspaceStatus', listener)
  },
  onRenameWorkspace: (callback: (args: DashboardRenameWorkspaceArgs) => void): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      args: DashboardRenameWorkspaceArgs
    ): void => callback(args)
    ipcRenderer.on('ui:renameDashboardWorkspace', listener)
    return () => ipcRenderer.removeListener('ui:renameDashboardWorkspace', listener)
  },

  requestSnapshot: (): Promise<void> => ipcRenderer.invoke('dashboard:requestSnapshot'),
  onSnapshot: (callback: (snapshot: DashboardSnapshot) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: DashboardSnapshot): void =>
      callback(snapshot)
    ipcRenderer.on('dashboard:snapshot', listener)
    return () => ipcRenderer.removeListener('dashboard:snapshot', listener)
  },
  onViewRequested: (callback: (view: AgentDashboardView) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, view: AgentDashboardView): void =>
      callback(view)
    ipcRenderer.on('dashboard:viewRequested', listener)
    return () => ipcRenderer.removeListener('dashboard:viewRequested', listener)
  },
  getPopoutOpacity: () => ipcRenderer.invoke('dashboardPopout:getOpacity'),
  setPopoutOpacity: (opacity: number) => ipcRenderer.invoke('dashboardPopout:setOpacity', opacity),
  revealAgent: (args: DashboardRevealAgentArgs): Promise<void> =>
    ipcRenderer.invoke('dashboardPopout:revealAgent', args),
  ackAgent: (paneKey: string, intent: 'view' | 'explicit'): Promise<void> =>
    ipcRenderer.invoke('dashboardPopout:ackAgent', { paneKey, intent }),
  assignWorkspaceStatus: (args: DashboardAssignWorkspaceStatusArgs): Promise<void> =>
    ipcRenderer.invoke('dashboardPopout:assignWorkspaceStatus', args),
  renameWorkspace: (args: DashboardRenameWorkspaceArgs): Promise<void> =>
    ipcRenderer.invoke('dashboardPopout:renameWorkspace', args)
} satisfies PreloadApi['dashboard']
