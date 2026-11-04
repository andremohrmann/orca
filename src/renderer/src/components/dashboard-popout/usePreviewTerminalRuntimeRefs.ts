import { useLayoutEffect, useRef } from 'react'
import type { MacOptionAsAlt } from '@/components/terminal-pane/terminal-shortcut-policy'
import type {
  DashboardCardTerminalInput,
  DashboardCardTerminalLinks
} from '../../../../shared/dashboard-snapshot'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { DashboardPreviewLinkSource } from './dashboard-preview-http-actions'

export function usePreviewTerminalRuntimeRefs(args: {
  settings: GlobalSettings | null
  macOptionAsAlt: MacOptionAsAlt
  terminalInput: DashboardCardTerminalInput | null
  terminalLinks: DashboardCardTerminalLinks | null
  linkSource?: DashboardPreviewLinkSource
  onBrowserForeground?: () => void
}): {
  settingsRef: React.MutableRefObject<GlobalSettings | null>
  macOptionAsAltRef: React.MutableRefObject<MacOptionAsAlt>
  terminalInputRef: React.MutableRefObject<DashboardCardTerminalInput | null>
  terminalLinksRef: React.MutableRefObject<DashboardCardTerminalLinks | null>
  linkSourceRef: React.MutableRefObject<DashboardPreviewLinkSource | undefined>
  onBrowserForegroundRef: React.MutableRefObject<(() => void) | undefined>
} {
  const settingsRef = useRef(args.settings)
  const macOptionAsAltRef = useRef(args.macOptionAsAlt)
  const terminalInputRef = useRef(args.terminalInput)
  const terminalLinksRef = useRef(args.terminalLinks)
  const linkSourceRef = useRef(args.linkSource)
  const onBrowserForegroundRef = useRef(args.onBrowserForeground)

  useLayoutEffect(() => {
    settingsRef.current = args.settings
    macOptionAsAltRef.current = args.macOptionAsAlt
    terminalInputRef.current = args.terminalInput
    terminalLinksRef.current = args.terminalLinks
    linkSourceRef.current = args.linkSource
    onBrowserForegroundRef.current = args.onBrowserForeground
  }, [
    args.settings,
    args.macOptionAsAlt,
    args.terminalInput,
    args.terminalLinks,
    args.linkSource,
    args.onBrowserForeground
  ])

  return {
    settingsRef,
    macOptionAsAltRef,
    terminalInputRef,
    terminalLinksRef,
    linkSourceRef,
    onBrowserForegroundRef
  }
}
