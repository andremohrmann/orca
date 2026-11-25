import { focusTerminalTabSurface } from '@/components/terminal-pane/input/focus/focus-terminal-tab-surface'
import { useAppStore } from '../../store'

const NEW_TAB_MENU_TERMINAL_FOCUS_RETRY_MS = 50
const NEW_TAB_MENU_TERMINAL_FOCUS_TIMEOUT_MS = 5000

type PendingNewTabMenuFocus = { focus: () => void; synchronous?: true }

export type NewTabMenuTerminalFocusController = {
  clearPendingFocus: () => void
  clearPendingFocusAnimation: () => void
  clearPendingFocusRetry: () => void
  queueNewActiveTerminalFocusAfterClose: () => void
  queueTerminalTabFocusAfterClose: (tabId: string) => void
  // Why synchronous: the native chat composer must grab focus before the menu's own
  // close animation steals it back, so this one caller skips the request-animation-frame queue.
  queueFocusAfterClose: (focus: () => void, synchronous?: true) => void
  runPendingFocusAfterClose: () => void
}

export function createNewTabMenuTerminalFocusController(): NewTabMenuTerminalFocusController {
  let pendingFocus: PendingNewTabMenuFocus | null = null
  let pendingAnimation: number | null = null
  let pendingRetry: number | null = null
  const clearPendingFocusAnimation = (): void => {
    if (pendingAnimation === null) {
      return
    }
    cancelAnimationFrame(pendingAnimation)
    pendingAnimation = null
  }
  const clearPendingFocusRetry = (): void => {
    if (pendingRetry === null) {
      return
    }
    window.clearTimeout(pendingRetry)
    pendingRetry = null
  }
  const focusNewActiveTerminalWhenReady = (
    previousActiveTabId: string | null,
    expiresAt: number,
    now: number
  ): void => {
    const state = useAppStore.getState()
    if (
      (state.activeTabType === 'terminal' || state.activeTabType === 'simulator') &&
      state.activeTabId &&
      state.activeTabId !== previousActiveTabId
    ) {
      focusTerminalTabSurface(state.activeTabId)
      return
    }
    if (now >= expiresAt) {
      return
    }
    pendingRetry = window.setTimeout(() => {
      pendingRetry = null
      focusNewActiveTerminalWhenReady(previousActiveTabId, expiresAt, Date.now())
    }, NEW_TAB_MENU_TERMINAL_FOCUS_RETRY_MS)
  }
  const queueNewActiveTerminalFocusAfterClose = (): void => {
    const previousActiveTabId = useAppStore.getState().activeTabId
    queueFocusAfterClose(() => {
      // Why: paired web/SSH tab creation is async; await the host snapshot's new terminal instead of the pre-existing active tab.
      focusNewActiveTerminalWhenReady(
        previousActiveTabId,
        Date.now() + NEW_TAB_MENU_TERMINAL_FOCUS_TIMEOUT_MS,
        Date.now()
      )
    })
  }
  const queueTerminalTabFocusAfterClose = (tabId: string): void =>
    queueFocusAfterClose(() => focusTerminalTabSurface(tabId))
  const queueFocusAfterClose = (focus: () => void, synchronous?: true): void => {
    clearPendingFocusAnimation()
    clearPendingFocusRetry()
    pendingFocus = { focus, synchronous }
  }
  const runPendingFocusAfterClose = (): void => {
    const focus = pendingFocus
    pendingFocus = null
    clearPendingFocusAnimation()
    clearPendingFocusRetry()
    if (focus?.synchronous) {
      focus.focus()
    } else if (focus) {
      pendingAnimation = requestAnimationFrame(() => {
        pendingAnimation = null
        focus.focus()
      })
    }
  }
  const clearPendingFocus = (): void => {
    pendingFocus = null
    clearPendingFocusAnimation()
    clearPendingFocusRetry()
  }
  return {
    clearPendingFocus,
    clearPendingFocusAnimation,
    clearPendingFocusRetry,
    queueNewActiveTerminalFocusAfterClose,
    queueTerminalTabFocusAfterClose,
    queueFocusAfterClose,
    runPendingFocusAfterClose
  }
}
