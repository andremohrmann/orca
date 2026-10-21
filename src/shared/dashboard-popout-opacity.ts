export const DEFAULT_DASHBOARD_POPOUT_OPACITY = 1
export const MIN_DASHBOARD_POPOUT_OPACITY = 0.2

export function normalizeDashboardPopoutOpacity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_DASHBOARD_POPOUT_OPACITY
  }
  return Math.min(1, Math.max(MIN_DASHBOARD_POPOUT_OPACITY, Math.round(value * 100) / 100))
}

export type DashboardPopoutOpacityState = {
  opacity: number
  supported: boolean
}
