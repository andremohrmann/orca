import type { PluginEventName } from '../../../shared/plugins/contributions/plugin-event-contribution'

type DashboardEvent = 'provider.usageChanged' | 'agents.summariesChanged'
export function createPluginDashboardInvalidations(events: {
  wantsEvent(event: PluginEventName): boolean
  emitEvent(event: PluginEventName, payload: unknown): void
}): { quota(): void; agents(): void } {
  const pending = new Set<DashboardEvent>()
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = (event: DashboardEvent): void => {
    if (!events.wantsEvent(event)) {
      return
    }
    pending.add(event)
    timer ??= setTimeout(() => {
      timer = undefined
      for (const name of pending) {
        if (events.wantsEvent(name)) {
          events.emitEvent(name, { invalidated: true })
        }
      }
      pending.clear()
    }, 150)
    timer.unref?.()
  }
  return {
    quota: () => schedule('provider.usageChanged'),
    agents: () => schedule('agents.summariesChanged')
  }
}
