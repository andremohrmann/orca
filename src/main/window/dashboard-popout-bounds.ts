import type { Store } from '../persistence/loading-store/store'
import { rectHasVisibleAreaOnAnyDisplay } from './window-bounds-validation'

export function resolveDashboardPopoutBounds(
  store: Store | null,
  minWidth: number,
  minHeight: number
): {
  x: number
  y: number
  width: number
  height: number
} | null {
  const raw = store?.getUI().dashboardPopoutBounds ?? null
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
