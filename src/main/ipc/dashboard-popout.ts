import { app, ipcMain } from 'electron'
import type { Store } from '../persistence'
import type { KeybindingService } from '../keybindings/keybinding-service'
import type { DashboardSnapshot } from '../../shared/dashboard-snapshot'
import { isAgentDashboardView } from '../../shared/agent-dashboard-view'
import {
  createOrFocusDashboardPopout,
  closeDashboardPopout,
  getDashboardPopoutOpacityState,
  getDashboardPopoutWindow,
  isDashboardPopoutRenderer,
  onDashboardPopoutOpenChanged,
  setDashboardPopoutOpacity
} from '../window/dashboard-popout-window'
import { safelyRevealWindow } from '../window/focus-existing-window'
import { isBackgroundLaunch } from '../window/foreground-activation-policy'
import { getTrustedUIRendererWindow, isTrustedUIRenderer, sendToTrustedUIRenderer } from './ui'
import {
  admitDashboardSnapshot,
  isDashboardPaneKey,
  isDashboardRevealAgentArgs
} from './dashboard-payload-validation'
import {
  isDashboardAssignWorkspaceStatusArgs,
  isDashboardRenameWorkspaceArgs
} from './dashboard-workspace-mutation-validation'

// Replay immediately on mount; clear on close to avoid showing a previous session.
let lastSnapshot: DashboardSnapshot | null = null

function isDashboardEnabled(store: Store): boolean {
  return store.getSettings().experimentalAgentDashboardPopout === true
}

export function registerDashboardPopoutHandlers(
  store: Store,
  keybindings?: KeybindingService
): void {
  ipcMain.removeHandler('dashboardPopout:open')
  ipcMain.removeHandler('dashboard:publishSnapshot')
  ipcMain.removeHandler('dashboard:requestSnapshot')
  ipcMain.removeHandler('dashboard:getPopoutOpen')
  ipcMain.removeHandler('dashboardPopout:revealAgent')
  ipcMain.removeHandler('dashboardPopout:ackAgent')
  ipcMain.removeHandler('dashboardPopout:assignWorkspaceStatus')
  ipcMain.removeHandler('dashboardPopout:renameWorkspace')
  ipcMain.removeHandler('dashboardPopout:getOpacity')
  ipcMain.removeHandler('dashboardPopout:setOpacity')

  onDashboardPopoutOpenChanged((open) => {
    if (!open) {
      lastSnapshot = null
    }
  })
  store.onSettingsChanged((updates, settings) => {
    if (
      'experimentalAgentDashboardPopout' in updates &&
      settings.experimentalAgentDashboardPopout !== true
    ) {
      lastSnapshot = null
      closeDashboardPopout()
    }
  })

  ipcMain.handle('dashboardPopout:open', (event, view: unknown): void => {
    if (!isTrustedUIRenderer(event.sender) || !isDashboardEnabled(store)) {
      return
    }
    if (view !== undefined && !isAgentDashboardView(view)) {
      return
    }
    createOrFocusDashboardPopout(store, view, {
      getKeybindings: () => keybindings?.getOverrides()
    })
  })

  ipcMain.handle('dashboard:publishSnapshot', (event, snapshot: unknown): void => {
    if (!isTrustedUIRenderer(event.sender) || !isDashboardEnabled(store)) {
      return
    }
    const admitted = admitDashboardSnapshot(snapshot)
    // Explain stale replays instead of silently discarding malformed snapshots.
    if (!admitted) {
      console.warn('[dashboard] rejected malformed snapshot; pop-out keeps its previous board')
      return
    }
    if (admitted.droppedCardCount > 0) {
      console.warn(`[dashboard] dropped ${admitted.droppedCardCount} invalid card(s) from snapshot`)
    }
    // Retain omitted unchanged icons for newly mounting popouts; live forwards stay sparse.
    lastSnapshot =
      admitted.snapshot.repoIconsByRepoId === undefined && lastSnapshot?.repoIconsByRepoId
        ? { ...admitted.snapshot, repoIconsByRepoId: lastSnapshot.repoIconsByRepoId }
        : admitted.snapshot
    getDashboardPopoutWindow()?.webContents.send('dashboard:snapshot', admitted.snapshot)
  })

  // Replay immediately, then request fresh renderer state.
  ipcMain.handle('dashboard:requestSnapshot', (event): void => {
    if (!isDashboardPopoutRenderer(event.sender) || !isDashboardEnabled(store)) {
      return
    }
    if (lastSnapshot) {
      event.sender.send('dashboard:snapshot', lastSnapshot)
    }
    sendToTrustedUIRenderer('dashboard:snapshotRequested', null)
  })

  ipcMain.handle('dashboard:getPopoutOpen', (event): boolean =>
    isTrustedUIRenderer(event.sender) && isDashboardEnabled(store)
      ? getDashboardPopoutWindow() !== null
      : false
  )

  ipcMain.handle('dashboardPopout:getOpacity', (event) => {
    if (!isDashboardPopoutRenderer(event.sender) || !isDashboardEnabled(store)) {
      return null
    }
    return getDashboardPopoutOpacityState(store)
  })

  ipcMain.handle('dashboardPopout:setOpacity', (event, opacity: unknown) => {
    if (
      !isDashboardPopoutRenderer(event.sender) ||
      !isDashboardEnabled(store) ||
      typeof opacity !== 'number' ||
      !Number.isFinite(opacity)
    ) {
      return null
    }
    return setDashboardPopoutOpacity(store, opacity)
  })

  // Seen-sync: opening a card's terminal dialog acknowledges the agent in the
  // main renderer's store — the same ack that mutes its sidebar row.
  ipcMain.handle('dashboardPopout:ackAgent', (event, args: unknown): void => {
    const ack = args && typeof args === 'object' ? args : {}
    const paneKey = 'paneKey' in ack ? ack.paneKey : undefined
    if (
      !isDashboardPopoutRenderer(event.sender) ||
      !isDashboardEnabled(store) ||
      !isDashboardPaneKey(paneKey)
    ) {
      return
    }
    sendToTrustedUIRenderer('ui:ackDashboardAgent', {
      paneKey,
      intent: 'intent' in ack && ack.intent === 'explicit' ? 'explicit' : 'view'
    })
  })

  ipcMain.handle('dashboardPopout:revealAgent', (event, args: unknown): void => {
    if (
      !isDashboardPopoutRenderer(event.sender) ||
      !isDashboardEnabled(store) ||
      !isDashboardRevealAgentArgs(args)
    ) {
      return
    }
    const mainWindow = getTrustedUIRendererWindow()
    if (!mainWindow) {
      return
    }
    safelyRevealWindow(mainWindow)
    mainWindow.webContents.send('ui:revealDashboardAgent', args)
    if (!isBackgroundLaunch()) {
      try {
        app.focus({ steal: true })
      } catch {
        // Best-effort; the per-window focus above may still bring it forward.
      }
    }
  })

  ipcMain.handle('dashboardPopout:assignWorkspaceStatus', (event, args: unknown): void => {
    if (
      !isDashboardPopoutRenderer(event.sender) ||
      !isDashboardEnabled(store) ||
      !isDashboardAssignWorkspaceStatusArgs(args)
    ) {
      return
    }
    sendToTrustedUIRenderer('ui:assignDashboardWorkspaceStatus', args)
  })

  ipcMain.handle('dashboardPopout:renameWorkspace', (event, args: unknown): void => {
    if (
      !isDashboardPopoutRenderer(event.sender) ||
      !isDashboardEnabled(store) ||
      !isDashboardRenameWorkspaceArgs(args)
    ) {
      return
    }
    sendToTrustedUIRenderer('ui:renameDashboardWorkspace', args)
  })
}
