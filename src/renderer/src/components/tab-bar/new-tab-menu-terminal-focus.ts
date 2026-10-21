import type { MutableRefObject } from 'react'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'
import { useAppStore } from '../../store'

const NEW_TAB_MENU_TERMINAL_FOCUS_RETRY_MS = 50
const NEW_TAB_MENU_TERMINAL_FOCUS_TIMEOUT_MS = 5000

type PendingNewTabMenuFocus = { focus: () => void; synchronous?: true }

type NewTabMenuTerminalFocusRefs = {
  pendingFocusRef: MutableRefObject<PendingNewTabMenuFocus | null>
  pendingAnimationRef: MutableRefObject<number | null>
  pendingRetryRef: MutableRefObject<number | null>
}

export type NewTabMenuTerminalFocusController = {
  clearPendingFocusAnimation: () => void
  clearPendingFocusRetry: () => void
  queueNewActiveTerminalFocusAfterClose: () => void
  queueTerminalTabFocusAfterClose: (tabId: string) => void
  // Why synchronous: the native chat composer must grab focus before the menu's own
  // close animation steals it back, so this one caller skips the request-animation-frame queue.
  queueFocusAfterClose: (focus: () => void, synchronous?: true) => void
  runPendingFocusAfterClose: () => void
}

export function createNewTabMenuTerminalFocusController({
  pendingFocusRef,
  pendingAnimationRef,
  pendingRetryRef
}: NewTabMenuTerminalFocusRefs): NewTabMenuTerminalFocusController {
  const clearPendingFocusAnimation = (): void => {
    if (pendingAnimationRef.current === null) {
      return
    }
    cancelAnimationFrame(pendingAnimationRef.current)
    pendingAnimationRef.current = null
  }
  const clearPendingFocusRetry = (): void => {
    if (pendingRetryRef.current === null) {
      return
    }
    window.clearTimeout(pendingRetryRef.current)
    pendingRetryRef.current = null
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
    pendingRetryRef.current = window.setTimeout(() => {
      pendingRetryRef.current = null
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
    pendingFocusRef.current = { focus, synchronous }
  }
  const runPendingFocusAfterClose = (): void => {
    const pendingFocus = pendingFocusRef.current
    pendingFocusRef.current = null
    clearPendingFocusAnimation()
    clearPendingFocusRetry()
    if (pendingFocus?.synchronous) {
      pendingFocus.focus()
    } else if (pendingFocus) {
      pendingAnimationRef.current = requestAnimationFrame(() => {
        pendingAnimationRef.current = null
        pendingFocus.focus()
      })
    }
  }
  return {
    clearPendingFocusAnimation,
    clearPendingFocusRetry,
    queueNewActiveTerminalFocusAfterClose,
    queueTerminalTabFocusAfterClose,
    queueFocusAfterClose,
    runPendingFocusAfterClose
  }
}
