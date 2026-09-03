import { ipcRenderer } from 'electron'
import type {
  DashboardAssignWorkspaceStatusArgs,
  DashboardRenameWorkspaceArgs,
  DashboardRevealAgentArgs,
  DashboardSleepWorkspaceArgs,
  DashboardSnapshot,
  DashboardSpawnAgentArgs
} from '../../shared/dashboard-snapshot'
import type { AgentDashboardView } from '../../shared/agent-dashboard-view'
import type { PreloadApi } from '../api-types'

export const dashboardApi = {
  // Open the pop-out dashboard window, or focus it if already open.
  openPopout: (view?: AgentDashboardView): Promise<void> =>
    ipcRenderer.invoke('dashboardPopout:open', view),

  // ── Producer side (main window) ──────────────────────────────────────
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
  onAckAgent: (callback: (paneKey: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, paneKey: string): void => callback(paneKey)
    ipcRenderer.on('ui:ackDashboardAgent', listener)
    return () => ipcRenderer.removeListener('ui:ackDashboardAgent', listener)
  },
  onSpawnAgent: (callback: (args: DashboardSpawnAgentArgs) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, args: DashboardSpawnAgentArgs): void =>
      callback(args)
    ipcRenderer.on('ui:spawnDashboardAgent', listener)
    return () => ipcRenderer.removeListener('ui:spawnDashboardAgent', listener)
  },
  onSleepWorkspace: (callback: (args: DashboardSleepWorkspaceArgs) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, args: DashboardSleepWorkspaceArgs): void =>
      callback(args)
    ipcRenderer.on('ui:sleepDashboardWorkspace', listener)
    return () => ipcRenderer.removeListener('ui:sleepDashboardWorkspace', listener)
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

  // ── Consumer side (pop-out window) ───────────────────────────────────
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
  revealAgent: (args: DashboardRevealAgentArgs): Promise<void> =>
    ipcRenderer.invoke('dashboardPopout:revealAgent', args),
  ackAgent: (paneKey: string): Promise<void> =>
    ipcRenderer.invoke('dashboardPopout:ackAgent', { paneKey }),
  spawnAgent: (args: DashboardSpawnAgentArgs): Promise<void> =>
    ipcRenderer.invoke('dashboardPopout:spawnAgent', args),
  sleepWorkspace: (args: DashboardSleepWorkspaceArgs): Promise<void> =>
    ipcRenderer.invoke('dashboardPopout:sleepWorkspace', args),
  assignWorkspaceStatus: (args: DashboardAssignWorkspaceStatusArgs): Promise<void> =>
    ipcRenderer.invoke('dashboardPopout:assignWorkspaceStatus', args),
  renameWorkspace: (args: DashboardRenameWorkspaceArgs): Promise<void> =>
    ipcRenderer.invoke('dashboardPopout:renameWorkspace', args)
} satisfies PreloadApi['dashboard']
