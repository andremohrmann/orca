import type { MutableRefObject } from 'react'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'
import { useAppStore } from '../../store'

const NEW_TAB_MENU_TERMINAL_FOCUS_RETRY_MS = 50
const NEW_TAB_MENU_TERMINAL_FOCUS_TIMEOUT_MS = 5000

type NewTabMenuTerminalFocusRefs = {
  pendingFocusRef: MutableRefObject<(() => void) | null>
  pendingAnimationRef: MutableRefObject<number | null>
  pendingRetryRef: MutableRefObject<number | null>
}

export type NewTabMenuTerminalFocusController = {
  clearPendingFocusAnimation: () => void
  clearPendingFocusRetry: () => void
  queueNewActiveTerminalFocusAfterClose: () => void
  queueTerminalTabFocusAfterClose: (tabId: string) => void
  queueFocusAfterClose: (focus: () => void) => void
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
    pendingFocusRef.current = () => {
      // Why: paired web/SSH tab creation is async; await the host snapshot's new terminal instead of the pre-existing active tab.
      focusNewActiveTerminalWhenReady(
        previousActiveTabId,
        Date.now() + NEW_TAB_MENU_TERMINAL_FOCUS_TIMEOUT_MS,
        Date.now()
      )
    }
  }
  const queueTerminalTabFocusAfterClose = (tabId: string): void => {
    pendingFocusRef.current = () => focusTerminalTabSurface(tabId)
  }
  const queueFocusAfterClose = (focus: () => void): void => {
    pendingFocusRef.current = focus
  }
  const runPendingFocusAfterClose = (): void => {
    const pendingFocus = pendingFocusRef.current
    pendingFocusRef.current = null
    clearPendingFocusAnimation()
    clearPendingFocusRetry()
    if (pendingFocus) {
      pendingAnimationRef.current = requestAnimationFrame(() => {
        pendingAnimationRef.current = null
        pendingFocus()
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
