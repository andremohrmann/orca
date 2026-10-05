import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { launchWarpTab } from '@/lib/launch-warp-tab'
import type { TuiAgent } from '../../../../shared/tui-agent'
import { translate } from '@/i18n/i18n'
import {
  launchAgentInNewTab,
  shouldQueueTerminalFocusAfterMenuClose
} from '@/lib/launch-agent-in-new-tab'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import type { WindowsTerminalCapabilities } from '@/lib/windows-terminal-capabilities'
import { createNewTabMenuTerminalFocusController } from './new-tab-menu-terminal-focus'
import type { TabAgentLaunchOption } from './tab-agent-launch-options'
import { buildTabCreateMenuOptions, type TabCreateMenuOption } from './tab-create-menu-options'
import { resolveWindowsShellLaunchTarget } from './windows-shell-launch'
import {
  buildWindowsShellMenuEntries,
  type WindowsShellMenuEntry
} from './tab-bar-windows-shell-options'
import type {
  getProjectRuntimeShellMenuMode,
  resolveWindowsPowerShellImplementationSetting
} from './use-tab-bar-runtime-model'

export type TabBarCreateMenuController = {
  newTabMenuOpen: boolean
  setNewTabMenuOpen: (open: boolean) => void
  setCreateMenuQuery: (query: string) => void
  createMenuOptions: TabCreateMenuOption[]
  windowsShellEntries: WindowsShellMenuEntry[] | undefined
  handleSelectCreateMenuOption: (option: TabCreateMenuOption) => void
  launchAgentFromNewTabEntry: (agent: TuiAgent) => void
  runPendingNewTabMenuFocusAfterClose: () => void
  clearPendingNewTabMenuFocusOnUnmount: (node: HTMLDivElement | null) => void
  queueNewActiveTerminalFocusAfterNewTabMenuClose: () => void
  queueTerminalTabFocusAfterNewTabMenuClose: (tabId: string) => void
  queueFocusAfterNewTabMenuClose: (focus: () => void) => void
  showStaticCreateMenuItems: boolean
}

export function useTabBarCreateMenuController({
  worktreeId,
  resolvedGroupId,
  terminalOnly,
  mobileEmulatorEnabled,
  managedBrowserCreationEnabled,
  mobileEmulatorCreationEnabled,
  workspaceHasSimulatorTab,
  showWindowsShellMenu,
  projectRuntimeShellMenuMode,
  defaultWindowsShell,
  defaultWindowsPowerShellImplementation,
  windowsTerminalCapabilities,
  agentLaunchOptions,
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
  windowsTerminalCapabilities: WindowsTerminalCapabilities
  agentLaunchOptions: TabAgentLaunchOption[]
  onNewTerminalTab: () => void
  onNewTerminalWithShell?: (shell: string) => void
  onNewBrowserTab: () => void
  onNewSimulatorTab?: () => void
  onNewFileTab?: () => void
  onOpenFileTab?: () => void
}): TabBarCreateMenuController {
  // Why: <webview> clicks are out-of-process, so Radix's document-pointerdown outside-click check misses them; use window blur.
  const [newTabMenuOpen, setNewTabMenuOpen] = useState(false)
  const [createMenuQuery, setCreateMenuQuery] = useState('')
  const pendingNewTabMenuFocusRef = useRef<(() => void) | null>(null)
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
    }
  }
  const launchAgentFromNewTabEntry = (agent: TuiAgent): void => {
    const option = agentLaunchOptions.find((candidate) => candidate.agent === agent)
    const result = launchAgentInNewTab({
      requestId: newAgentLaunchRequestId(),
      agent,
      worktreeId,
      groupId: resolvedGroupId,
      launchSource: 'tab_bar_quick_launch'
    })
    if (!result) {
      toast.error(
        translate(
          'auto.components.tab.bar.TabBar.ab589350e5',
          'Could not build launch command for {{value0}}.',
          { value0: option?.label ?? agent }
        )
      )
      return
    }
    if (result.surface.kind === 'local-terminal') {
      queueTerminalTabFocusAfterNewTabMenuClose(result.surface.tabId)
      return
    }
    if (shouldQueueTerminalFocusAfterMenuClose(result)) {
      queueNewActiveTerminalFocusAfterNewTabMenuClose()
    }
  }
  const clearPendingNewTabMenuFocusOnUnmountRef = useRef<
    ((node: HTMLDivElement | null) => void) | null
  >(null)
  if (clearPendingNewTabMenuFocusOnUnmountRef.current === null) {
    clearPendingNewTabMenuFocusOnUnmountRef.current = (node: HTMLDivElement | null): void => {
      if (node !== null) {
        return
      }
      // Why: cancel the delayed focus handoff via this root ref cleanup, avoiding an otherwise cleanup-only React Effect.
      terminalFocusController.clearPendingFocusAnimation()
      terminalFocusController.clearPendingFocusRetry()
    }
  }
  const clearPendingNewTabMenuFocusOnUnmount = clearPendingNewTabMenuFocusOnUnmountRef.current

  useEffect(() => {
    if (!newTabMenuOpen) {
      return
    }
    const dismiss = (): void => setNewTabMenuOpen(false)
    window.addEventListener('blur', dismiss)
    return () => window.removeEventListener('blur', dismiss)
  }, [newTabMenuOpen])

  useEffect(() => {
    if (!newTabMenuOpen) {
      setCreateMenuQuery('')
    }
  }, [newTabMenuOpen])

  return {
    newTabMenuOpen,
    setNewTabMenuOpen,
    setCreateMenuQuery,
    createMenuOptions,
    windowsShellEntries,
    handleSelectCreateMenuOption,
    launchAgentFromNewTabEntry,
    runPendingNewTabMenuFocusAfterClose: terminalFocusController.runPendingFocusAfterClose,
    clearPendingNewTabMenuFocusOnUnmount,
    queueNewActiveTerminalFocusAfterNewTabMenuClose,
    queueTerminalTabFocusAfterNewTabMenuClose,
    queueFocusAfterNewTabMenuClose,
    showStaticCreateMenuItems: createMenuQuery.trim().length === 0
  }
}
