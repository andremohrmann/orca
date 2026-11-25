import type { TabBarCreateMenuController } from './tab-bar-create-menu-contract'

import { useAgentLaunchPickerInventorySource } from '../../agent/use-agent-launch-picker-inventory'
import type { AgentPickerEntry } from '../../../../../shared/agent-launch/picker/agent-launch-picker'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { launchWarpTab } from '@/lib/launch-warp-tab'
import type { WindowsTerminalCapabilities } from '@/runtime/hosts/capabilities/windows-terminal-capabilities'
import { useTabAgentMenuLaunch } from '../../agent/launch-menu/AgentMenuItems'
import { requestNativeChatComposerFocus } from '@/components/native-chat/composer/focus/native-chat-composer-focus-intent'
import { useNewTabAgentMenuRows } from '../../agent/launch-menu/use-new-tab-agent-menu-rows'
import type { AgentDetectionTarget } from '@/lib/agent-session/launch/inventory/useDetectedAgents'
import type { TabAgentLaunchOption } from '../create-entry/tab-agent-launch-options'
import { buildTabCreateMenuOptions, type TabCreateMenuOption } from './tab-create-menu-options'
import { resolveWindowsShellLaunchTarget } from './windows-shell-launch'
import { createNewTabMenuTerminalFocusController } from '../new-tab-menu-terminal-focus'
import { buildWindowsShellMenuEntries } from './tab-bar-windows-shell-options'
import type {
  getProjectRuntimeShellMenuMode,
  resolveWindowsPowerShellImplementationSetting
} from '../model/use-tab-bar-runtime-model'
export function useTabBarCreateMenuController({
  worktreeId,
  resolvedGroupId,
  terminalOnly,
  showAgentLaunchItems = true,
  mobileEmulatorEnabled,
  managedBrowserCreationEnabled,
  mobileEmulatorCreationEnabled,
  workspaceHasSimulatorTab,
  showWindowsShellMenu,
  projectRuntimeShellMenuMode,
  defaultWindowsShell,
  defaultWindowsPowerShellImplementation,
  agentDetectionTarget,
  windowsTerminalCapabilities,
  onNewTerminalTab,
  onNewTerminalWithShell,
  onNewBrowserTab,
  onNewSimulatorTab,
  onNewFileTab,
  onOpenFileTab
}: {
  worktreeId: string
  resolvedGroupId: string
  terminalOnly: boolean
  showAgentLaunchItems?: boolean
  mobileEmulatorEnabled: boolean
  managedBrowserCreationEnabled: boolean
  mobileEmulatorCreationEnabled: boolean
  workspaceHasSimulatorTab: boolean
  showWindowsShellMenu: boolean
  projectRuntimeShellMenuMode: ReturnType<typeof getProjectRuntimeShellMenuMode>
  defaultWindowsShell: string
  defaultWindowsPowerShellImplementation: ReturnType<
    typeof resolveWindowsPowerShellImplementationSetting
  >
  agentDetectionTarget: AgentDetectionTarget | undefined
  windowsTerminalCapabilities: WindowsTerminalCapabilities
  onNewTerminalTab: () => void
  onNewTerminalWithShell?: (shell: string) => void
  onNewBrowserTab: () => void
  onNewSimulatorTab?: () => void
  onNewFileTab?: () => void
  onOpenFileTab?: () => void
}): TabBarCreateMenuController {
  // Why: <webview> clicks are out-of-process, so Radix's document-pointerdown outside-click check misses them; use window blur.
  const [newTabMenuOpen, setNewTabMenuOpen] = useState(false)
  // Only whether the search holds a query: the search keeps its own text, so a keystroke that
  // leaves this unchanged doesn't re-render the tab bar and rebuild its agent menu.
  const [createMenuHasQuery, setCreateMenuHasQuery] = useState(false)
  const setCreateMenuQuery = useCallback(
    (query: string) => setCreateMenuHasQuery(query.trim().length > 0),
    []
  )
  const agentMenu = useNewTabAgentMenuRows(
    worktreeId,
    newTabMenuOpen && showAgentLaunchItems,
    agentDetectionTarget,
    { wakeOnOpen: true, observationGroup: { worktreeId, groupId: resolvedGroupId } }
  )
  const [selectedPickerAgent, selectPickerAgent] = useState<AgentPickerEntry['agent']>()
  // Why: subscribed inside the open menu only; catalog reads landing here would re-render the tab bar.
  const agentPickerInventory = useAgentLaunchPickerInventorySource(
    worktreeId,
    agentMenu,
    newTabMenuOpen && showAgentLaunchItems,
    selectedPickerAgent
  )
  const pendingNewTabMenuFocusRef = useRef<{ focus: () => void; synchronous?: true } | null>(null)
  const pendingNewTabMenuFocusAnimationRef = useRef<number | null>(null)
  const pendingNewTabMenuFocusRetryRef = useRef<number | null>(null)
  const terminalFocusController = createNewTabMenuTerminalFocusController({
    pendingFocusRef: pendingNewTabMenuFocusRef,
    pendingAnimationRef: pendingNewTabMenuFocusAnimationRef,
    pendingRetryRef: pendingNewTabMenuFocusRetryRef
  })
  const queueNewActiveTerminalFocusAfterNewTabMenuClose =
    terminalFocusController.queueNewActiveTerminalFocusAfterClose
  const queueTerminalTabFocusAfterNewTabMenuClose =
    terminalFocusController.queueTerminalTabFocusAfterClose
  const queueFocusAfterNewTabMenuClose = terminalFocusController.queueFocusAfterClose
  const windowsShellEntries = useMemo(() => {
    return buildWindowsShellMenuEntries({
      showWindowsShellMenu,
      hasShellLauncher: Boolean(onNewTerminalWithShell),
      projectRuntimeShellMenuMode,
      defaultWindowsShell,
      gitBashAvailable: windowsTerminalCapabilities.gitBashAvailable,
      wslAvailable: windowsTerminalCapabilities.wslAvailable
    })
  }, [
    defaultWindowsShell,
    onNewTerminalWithShell,
    projectRuntimeShellMenuMode,
    showWindowsShellMenu,
    windowsTerminalCapabilities.gitBashAvailable,
    windowsTerminalCapabilities.wslAvailable
  ])
  const createMenuOptions = useMemo(
    () =>
      buildTabCreateMenuOptions({
        terminalOnly,
        windowsShellEntries,
        hasNewBrowser: !terminalOnly && managedBrowserCreationEnabled,
        hasNewMarkdown: !terminalOnly && Boolean(onNewFileTab),
        hasOpenMarkdown: !terminalOnly && Boolean(onOpenFileTab),
        hasSimulator:
          !terminalOnly &&
          mobileEmulatorEnabled &&
          mobileEmulatorCreationEnabled &&
          Boolean(onNewSimulatorTab),
        simulatorIsGoTo: workspaceHasSimulatorTab
      }),
    [
      mobileEmulatorEnabled,
      managedBrowserCreationEnabled,
      mobileEmulatorCreationEnabled,
      onNewFileTab,
      onNewSimulatorTab,
      onOpenFileTab,
      terminalOnly,
      windowsShellEntries,
      workspaceHasSimulatorTab
    ]
  )
  const handleSelectCreateMenuOption = (option: TabCreateMenuOption): void => {
    switch (option.kind) {
      case 'new-warp':
        return launchWarpTab(worktreeId, resolvedGroupId, queueTerminalTabFocusAfterNewTabMenuClose)
      case 'new-terminal':
        queueNewActiveTerminalFocusAfterNewTabMenuClose()
        onNewTerminalTab()
        break
      case 'new-terminal-shell':
        if (!onNewTerminalWithShell || !option.shell) {
          break
        }
        queueNewActiveTerminalFocusAfterNewTabMenuClose()
        onNewTerminalWithShell(
          resolveWindowsShellLaunchTarget(
            option.shell,
            defaultWindowsPowerShellImplementation,
            windowsTerminalCapabilities.pwshAvailable
          )
        )
        break
      case 'new-browser':
        onNewBrowserTab()
        break
      case 'new-markdown':
        onNewFileTab?.()
        break
      case 'open-markdown':
        onOpenFileTab?.()
        break
      case 'new-simulator':
      case 'go-to-simulator':
        onNewSimulatorTab?.()
        break
      case 'new-plugin-file': // usePluginNewFileMenuOptions handles these first.
    }
  }
  const launchAgentRow = useTabAgentMenuLaunch({
    worktreeId,
    groupId: resolvedGroupId,
    launchSource: 'tab_bar_quick_launch',
    onFocusTerminal: queueTerminalTabFocusAfterNewTabMenuClose,
    onFocusHostTerminal: queueNewActiveTerminalFocusAfterNewTabMenuClose,
    onFocusChat: (tabId) =>
      queueFocusAfterNewTabMenuClose(() => requestNativeChatComposerFocus(tabId), true)
  })
  const launchAgentFromNewTabEntry = (option: TabAgentLaunchOption) => {
    if (option.row) {
      return option.setup
        ? launchAgentRow(option.row, option.setup, option.pickerEntry)
        : launchAgentRow(option.row)
    }
    return false
  }
  const menuFocusUnmountRef = useRef<((node: HTMLDivElement | null) => void) | null>(null)
  if (menuFocusUnmountRef.current === null) {
    menuFocusUnmountRef.current = (node: HTMLDivElement | null): void => {
      if (node !== null) {
        return
      }
      // Why: cancel the delayed focus handoff via this root ref cleanup, avoiding an otherwise cleanup-only React Effect.
      pendingNewTabMenuFocusRef.current = null
      terminalFocusController.clearPendingFocusAnimation()
      terminalFocusController.clearPendingFocusRetry()
    }
  }
  useEffect(() => {
    if (!newTabMenuOpen) {
      return
    }
    const dismiss = (): void => setNewTabMenuOpen(false)
    window.addEventListener('blur', dismiss)
    return () => window.removeEventListener('blur', dismiss)
  }, [newTabMenuOpen])
  const [prevNewTabMenuOpen, setPrevNewTabMenuOpen] = useState(newTabMenuOpen)
  if (prevNewTabMenuOpen !== newTabMenuOpen) {
    setPrevNewTabMenuOpen(newTabMenuOpen)
    if (!newTabMenuOpen) {
      setCreateMenuHasQuery(false)
    }
  }
  return {
    agentMenu,
    agentPickerInventory,
    selectPickerAgent,
    launchAgentRow,
    newTabMenuOpen,
    setNewTabMenuOpen,
    setCreateMenuQuery,
    createMenuOptions,
    windowsShellEntries,
    handleSelectCreateMenuOption,
    launchAgentFromNewTabEntry,
    runPendingNewTabMenuFocusAfterClose: terminalFocusController.runPendingFocusAfterClose,
    clearPendingNewTabMenuFocusOnUnmount: menuFocusUnmountRef.current,
    queueNewActiveTerminalFocusAfterNewTabMenuClose,
    queueTerminalTabFocusAfterNewTabMenuClose,
    queueFocusAfterNewTabMenuClose,
    showStaticCreateMenuItems: !createMenuHasQuery
  }
}
