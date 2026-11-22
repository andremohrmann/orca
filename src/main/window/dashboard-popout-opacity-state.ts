import type { BrowserWindow } from 'electron'
import type { NativeSettingsProjection } from '../core-desktop/native-settings-projection'
import {
  normalizeDashboardPopoutOpacity,
  type DashboardPopoutOpacityState
} from '../../shared/dashboard-popout-opacity'

function dashboardPopoutOpacitySupported(): boolean {
  return process.platform === 'win32' || process.platform === 'darwin'
}

export function getDashboardPopoutOpacityState(
  nativeSettings: NativeSettingsProjection | null
): DashboardPopoutOpacityState {
  const supported = dashboardPopoutOpacitySupported()
  return {
    opacity: supported
      ? normalizeDashboardPopoutOpacity(nativeSettings?.getUI().dashboardPopoutOpacity)
      : 1,
    supported
  }
}

export function persistDashboardPopoutOpacity(
  nativeSettings: NativeSettingsProjection,
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
  void nativeSettings.requestCoreWrite({
    kind: 'ui',
    updates: { dashboardPopoutOpacity: state.opacity }
  })
  return state
}
