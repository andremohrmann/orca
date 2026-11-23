import { createContext } from 'react'
import type { DashboardCardTerminalInput } from '../../../../../shared/agent-status/presentation/dashboard-snapshot'

export type PluginTerminalSurfaceConnection = {
  dispose: () => void
  ptyId: string
  terminalInput?: DashboardCardTerminalInput | null
  api: typeof window.api.terminalPreview
  onRevoked: (dispose: (reason?: 'profile_changed') => void) => () => void
}

export type PluginTerminalSurfaceResolver = (
  terminalId: string,
  signal: AbortSignal,
  hostId?: string
) => Promise<PluginTerminalSurfaceConnection | null>

/**
 * What a drawn panel needs from its host beyond events: plugin image files (as object URLs the
 * host made from bytes main read inside the plugin) and the checked link-open path.
 */
export type PluginDeclarativeHostServices = {
  /** Main admits the session and stable terminal identity before connecting. */
  resolveTerminalSurface?: PluginTerminalSurfaceResolver
  /** Resolves an object URL for a plugin-relative image, or null when it cannot be shown. */
  loadImage?: (path: string) => Promise<string | null>
  /** Opens an `http(s):`/`mailto:` URL once the control carrying `gestureId` has settled. */
  openLink?: (href: string, gestureId: string) => void
}

export const PluginDeclarativeHostServicesContext = createContext<PluginDeclarativeHostServices>({})

/** Links Orca opens outside itself; anything else in Markdown stays text. */
export function isPluginDeclarativeExternalHref(href: string | undefined): href is string {
  return typeof href === 'string' && /^(https?:\/\/|mailto:)/i.test(href) && href.length <= 2048
}
