import type { NativeSettingsProjection } from '../core-desktop/native-settings-projection'
import { rectHasVisibleAreaOnAnyDisplay } from './presentation/window-bounds-validation'

export function resolveDashboardPopoutBounds(
  nativeSettings: NativeSettingsProjection | null,
  minWidth: number,
  minHeight: number
): {
  x: number
  y: number
  width: number
  height: number
} | null {
  const raw = nativeSettings?.getUI().dashboardPopoutBounds ?? null
  if (
    raw &&
    raw.width >= minWidth &&
    raw.height >= minHeight &&
    rectHasVisibleAreaOnAnyDisplay(raw, minWidth / 2, minHeight / 2)
  ) {
    return raw
  }
  if (raw) {
    console.warn('[dashboard-popout] Discarding off-screen/near-min popout bounds:', raw)
  }
  return null
}
