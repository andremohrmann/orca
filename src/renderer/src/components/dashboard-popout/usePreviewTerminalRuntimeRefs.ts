import { useLayoutEffect, useRef } from 'react'
import type { MacOptionAsAlt } from '@/components/terminal-pane/terminal-shortcut-policy'
import type {
  DashboardCardTerminalInput,
  DashboardCardTerminalLinks
} from '../../../../shared/dashboard-snapshot'
import type { GlobalSettings } from '../../../../shared/global-settings-types'

export function usePreviewTerminalRuntimeRefs(args: {
  settings: GlobalSettings | null
  macOptionAsAlt: MacOptionAsAlt
  terminalInput: DashboardCardTerminalInput | null
  terminalLinks: DashboardCardTerminalLinks | null
}): {
  settingsRef: React.MutableRefObject<GlobalSettings | null>
  macOptionAsAltRef: React.MutableRefObject<MacOptionAsAlt>
  terminalInputRef: React.MutableRefObject<DashboardCardTerminalInput | null>
  terminalLinksRef: React.MutableRefObject<DashboardCardTerminalLinks | null>
} {
  const settingsRef = useRef(args.settings)
  const macOptionAsAltRef = useRef(args.macOptionAsAlt)
  const terminalInputRef = useRef(args.terminalInput)
  const terminalLinksRef = useRef(args.terminalLinks)

  useLayoutEffect(() => {
    settingsRef.current = args.settings
    macOptionAsAltRef.current = args.macOptionAsAlt
    terminalInputRef.current = args.terminalInput
    terminalLinksRef.current = args.terminalLinks
  }, [args.settings, args.macOptionAsAlt, args.terminalInput, args.terminalLinks])

  return { settingsRef, macOptionAsAltRef, terminalInputRef, terminalLinksRef }
}
