import type { BrowserWindow } from 'electron'
import type { Store } from '../persistence/loading-store/store'
import {
  normalizeDashboardPopoutOpacity,
  type DashboardPopoutOpacityState
} from '../../shared/dashboard-popout-opacity'

function dashboardPopoutOpacitySupported(): boolean {
  return process.platform === 'win32' || process.platform === 'darwin'
}

export function getDashboardPopoutOpacityState(store: Store | null): DashboardPopoutOpacityState {
  const supported = dashboardPopoutOpacitySupported()
  return {
    opacity: supported ? normalizeDashboardPopoutOpacity(store?.getUI().dashboardPopoutOpacity) : 1,
    supported
  }
}

export function persistDashboardPopoutOpacity(
  store: Store,
  requestedOpacity: number,
  window: BrowserWindow | null
): DashboardPopoutOpacityState {
  const supported = dashboardPopoutOpacitySupported()
  const state = {
    opacity: supported ? normalizeDashboardPopoutOpacity(requestedOpacity) : 1,
    supported
  }
  if (!state.supported) {
    return state
  }
  window?.setOpacity(state.opacity)
  store.updateUI({ dashboardPopoutOpacity: state.opacity })
  return state
}
