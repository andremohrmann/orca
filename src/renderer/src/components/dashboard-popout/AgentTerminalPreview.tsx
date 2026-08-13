import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import { subscribeToTerminalUserInput } from '@/components/terminal-pane/terminal-user-input-signal'
import { TerminalKittyKeyboardModeTracker } from '../../../../shared/terminal-kitty-keyboard-mode-tracker'
import { replayPreviewConnectionSnapshot } from './preview-terminal-snapshot-replay'
import { buildPreviewAppearanceOptions } from './preview-terminal-options'
import { syncPreviewTerminalLigatures } from './preview-terminal-ligatures'
import { installPreviewTerminalCompatibility } from './preview-terminal-compatibility'
import { createPreviewClipboardPaster } from './preview-terminal-paste'
import { installPreviewImeBridge, type PreviewImeBridge } from './preview-terminal-ime-bridge'
import { useAppStore } from '@/store'
import { installPreviewTerminalKeyHandler } from './preview-terminal-key-handler'
import { createPreviewGridClaim } from './preview-grid-claim'
import { installPreviewTerminalAppMenuClipboard } from './preview-terminal-app-menu-clipboard'
import type { TerminalPreviewDataPayload } from '../../../../shared/terminal-preview'
import {
  PREVIEW_SCROLLBACK_ROWS,
  clearPreviewTerminalTimer,
  ensurePreviewTerminal
} from './preview-terminal-session'
import { usePreviewTerminalTheme } from './usePreviewTerminalTheme'
import { AgentTerminalPreviewFrame } from './AgentTerminalPreviewFrame'
import type { AgentTerminalPreviewProps } from './agent-terminal-preview-props'
import { fitPreviewTerminalToBox } from './preview-terminal-fit'

const RESYNC_RETRY_DELAY_MS = 150

export function AgentTerminalPreview({
  ptyId,
  terminalInput = null,
  terminalLinks = null,
  claimGrid = true,
  scaleToFit = true,
  autoFocus = true,
  onClosedActivate,
  className
}: AgentTerminalPreviewProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const { settings, macOptionAsAlt, terminalTheme, terminalMode } = usePreviewTerminalTheme()
  const settingsRef = useRef(settings)
  const macOptionAsAltRef = useRef(macOptionAsAlt)
  const terminalInputRef = useRef(terminalInput)
  const terminalLinksRef = useRef(terminalLinks)
  const [ptyGone, setPtyGone] = useState(false)

  useLayoutEffect(() => {
    settingsRef.current = settings
    macOptionAsAltRef.current = macOptionAsAlt
    terminalInputRef.current = terminalInput
    terminalLinksRef.current = terminalLinks
  }, [settings, macOptionAsAlt, terminalInput, terminalLinks])

  useEffect(() => {
    setPtyGone(false)
    const container = containerRef.current
    if (!container) {
      return
    }
    let disposed = false
    let terminal: Terminal | null = null
    let offData: (() => void) | null = null
    let userInputDisposable: { dispose: () => void } | null = null
    let imeBridge: PreviewImeBridge | null = null
    let disposeKeyHandler: (() => void) | null = null
    let disposeTerminalCompatibility: (() => void) | null = null
    const kittyKeyboardModes = new TerminalKittyKeyboardModeTracker()
    let refreshInFlight = false
    let refreshAgain = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let inputRefreshTimer: ReturnType<typeof setTimeout> | null = null
    let requestInputRefresh = (): void => undefined
    let scheduleGridClaim = (): void => undefined
    const pendingLivePayloads: Extract<TerminalPreviewDataPayload, { type: 'data' }>[] = []

    const fitToBox = (): void => {
      fitPreviewTerminalToBox({
        container,
        terminal,
        scaleToFit,
        onUnscaledOverflow: () => scheduleGridClaim()
      })
    }
    let fitScheduled = false
    const scheduleFit = (): void => {
      if (fitScheduled) {
        return
      }
      fitScheduled = true
      requestAnimationFrame(() => {
        fitScheduled = false
        fitToBox()
      })
    }

    const gridClaim = claimGrid
      ? createPreviewGridClaim({
          ptyId,
          container,
          getTerminal: () => terminal,
          onFitApplied: () => undefined
        })
      : { requestNow: () => undefined, schedule: () => undefined, dispose: () => undefined }
    scheduleGridClaim = gridClaim.schedule
    const boxResizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            scheduleFit()
            gridClaim.schedule()
          })
    if (container.parentElement) {
      boxResizeObserver?.observe(container.parentElement)
    }
    boxResizeObserver?.observe(container)

    let replayDepth = 0
    const writeReplayed = (chunk: string, onDone?: () => void, live = false): void => {
      // Why: a redelivered snapshot repeats the TUI's one-time kitty push, so
      // replayed bytes must apply as idempotent sets (see the tracker's docs).
      if (live) {
        kittyKeyboardModes.scan(chunk)
      } else {
        kittyKeyboardModes.scanReplay(chunk)
      }
      replayDepth++
      terminal?.write(chunk, () => {
        replayDepth--
        scheduleFit()
        onDone?.()
      })
    }

    const writeLive = (payload: Extract<TerminalPreviewDataPayload, { type: 'data' }>): void => {
      // A live echo means the preview is healthy; keep its existing xterm
      // frame instead of replacing it with a snapshot after every keystroke.
      clearPreviewTerminalTimer(inputRefreshTimer)
      inputRefreshTimer = null
      if (!terminal) {
        pendingLivePayloads.push(payload)
        return
      }
      writeReplayed(
        payload.data,
        () => {
          if (!disposed) {
            void window.api.terminalPreview.ack(ptyId, payload.bytes)
          }
        },
        true
      )
    }

    const pasteClipboardText = createPreviewClipboardPaster({
      ptyId,
      container,
      getTerminal: () => terminal,
      isDisposed: () => disposed
    })

    const disposeImeNativeTextBridge = (): void => {
      imeBridge?.dispose()
      imeBridge = null
    }

    const installImeNativeTextBridge = (): void => {
      if (terminal) {
        // Why a live getter: kitty state can change between keydown and commit,
        // and the tracker outlives every reconnect inside this effect.
        imeBridge = installPreviewImeBridge(terminal, {
          getKittyKeyboardFlags: () => kittyKeyboardModes.flags
        })
      }
    }

    const installKeyHandler = (): void => {
      if (!terminal) {
        return
      }
      disposeKeyHandler = installPreviewTerminalKeyHandler({
        terminal,
        claimImeKeyEvent: (event) => imeBridge?.claimKeyEvent(event) ?? false,
        pasteClipboardText: (activeElement, source) =>
          void pasteClipboardText(activeElement, source),
        // Why: route through terminal.input so the chord's bytes carry core's user-input signal, like typed keys.
        sendInput: (data) => terminal?.input(data),
        getShortcutContext: () => ({
          clientPlatform: getShortcutPlatform(),
          macOptionAsAlt: macOptionAsAltRef.current,
          keybindings: useAppStore.getState().keybindings,
          terminalInput: terminalInputRef.current,
          kittyKeyboardActive: () => kittyKeyboardModes.flags > 0,
          terminalShortcutPolicy: settingsRef.current?.terminalShortcutPolicy
        })
      })
    }

    const installTerminalCompatibility = (): void => {
      if (!terminal) {
        return
      }
      disposeTerminalCompatibility = installPreviewTerminalCompatibility(terminal, {
        getSettings: () => settingsRef.current,
        getTerminalLinks: () => terminalLinksRef.current
      })
    }

    const installInputRouting = (): void => {
      if (!terminal) {
        return
      }
      let pendingUserInputSignals = 0
      userInputDisposable = subscribeToTerminalUserInput(terminal, () => {
        pendingUserInputSignals = Math.min(32, pendingUserInputSignals + 1)
      })
      terminal.onData((data) => {
        const signaledUserInput = pendingUserInputSignals > 0
        if (signaledUserInput) {
          pendingUserInputSignals--
        }
        // Why: core's signal distinguishes real input from parser replies, so typing survives live replay without forwarding synthetic CPR/DA bytes.
        if (userInputDisposable ? !signaledUserInput : replayDepth > 0) {
          return
        }
        void window.api.terminalPreview.input(ptyId, data)
        requestInputRefresh()
      })
    }

    const reportTerminalFocus = (focused: boolean): void => {
      if (!terminal?.modes.sendFocusMode) {
        return
      }
      void window.api.terminalPreview.input(ptyId, focused ? '\x1b[I' : '\x1b[O')
      requestInputRefresh()
    }
    const handleFocusIn = (event: FocusEvent): void => {
      if (event.target instanceof Element && event.target.closest('.xterm')) {
        reportTerminalFocus(true)
      }
    }
    const handleFocusOut = (event: FocusEvent): void => {
      if (!container.contains(event.relatedTarget as Node | null)) {
        reportTerminalFocus(false)
      }
    }
    container.addEventListener('focusin', handleFocusIn)
    container.addEventListener('focusout', handleFocusOut)

    const replayConnection = (
      connection: Awaited<ReturnType<typeof window.api.terminalPreview.connect>>,
      replaceExisting: boolean,
      requestRefresh: () => void
    ): void => {
      const snap = connection.snapshot!
      const resolved = ensurePreviewTerminal({
        terminal,
        container,
        snap,
        replaceExisting,
        settings: settingsRef.current,
        terminalInput: terminalInputRef.current,
        macOptionIsMeta: macOptionAsAltRef.current === 'true',
        theme: terminalTheme,
        themeMode: terminalMode
      })
      terminal = resolved.terminal
      if (!terminal) {
        return
      }
      if (resolved.created) {
        terminalRef.current = terminal
        installTerminalCompatibility()
        installInputRouting()
        installImeNativeTextBridge()
        installKeyHandler()
      }
      replayPreviewConnectionSnapshot({
        snapshot: snap,
        replay: connection.replay,
        kittyKeyboardModes,
        write: (chunk, live) => writeReplayed(chunk, undefined, live)
      })
      for (const payload of pendingLivePayloads.splice(0)) {
        writeLive(payload)
      }
      if (connection.resyncRequired) {
        refreshAgain = false
        // Why: sustained output can overflow every capture; delay retries so recovery cannot spin two serializations per event-loop turn.
        writeReplayed('', () => {
          if (disposed || retryTimer) {
            return
          }
          retryTimer = setTimeout(() => {
            retryTimer = null
            requestRefresh()
          }, RESYNC_RETRY_DELAY_MS)
        })
      } else if (refreshAgain) {
        refreshAgain = false
        writeReplayed('', requestRefresh)
      }
      scheduleFit()
      gridClaim.requestNow()
      gridClaim.schedule()
      if (autoFocus) {
        terminal.focus()
      }
    }

    const setup = async (replaceExisting = false): Promise<void> => {
      if (refreshInFlight) {
        refreshAgain = true
        return
      }
      refreshInFlight = true
      const connection = await window.api.terminalPreview.connect(ptyId, {
        scrollbackRows: PREVIEW_SCROLLBACK_ROWS
      })
      if (disposed) {
        return
      }
      const snap = connection.snapshot
      if (!snap) {
        refreshInFlight = false
        setPtyGone(true)
        offData?.()
        offData = null
        userInputDisposable?.dispose()
        userInputDisposable = null
        disposeImeNativeTextBridge()
        disposeTerminalCompatibility?.()
        disposeTerminalCompatibility = null
        disposeKeyHandler?.()
        disposeKeyHandler = null
        terminal?.dispose()
        terminal = null
        terminalRef.current = null
        void window.api.terminalPreview.unsubscribe(ptyId)
        return
      }
      refreshInFlight = false
      if (!connection.resyncRequired && retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
      replayConnection(connection, replaceExisting, () => void setup(true))
    }

    requestInputRefresh = (): void => {
      clearPreviewTerminalTimer(inputRefreshTimer)
      inputRefreshTimer = setTimeout(() => {
        inputRefreshTimer = null
        void setup(true)
      }, 180)
    }
    const disposeAppMenuClipboard = installPreviewTerminalAppMenuClipboard({
      container,
      getTerminal: () => terminal,
      pasteClipboardText
    })

    offData = window.api.terminalPreview.onData((payload) => {
      if (payload.ptyId !== ptyId) {
        return
      }
      if (payload.type === 'resync') {
        void setup(true)
        return
      }
      writeLive(payload)
    })

    void setup()
    return () => {
      disposed = true
      clearPreviewTerminalTimer(retryTimer)
      clearPreviewTerminalTimer(inputRefreshTimer)
      gridClaim.dispose()
      boxResizeObserver?.disconnect()
      disposeAppMenuClipboard()
      offData?.()
      userInputDisposable?.dispose()
      disposeImeNativeTextBridge()
      disposeTerminalCompatibility?.()
      disposeKeyHandler?.()
      container.removeEventListener('focusin', handleFocusIn)
      container.removeEventListener('focusout', handleFocusOut)
      void window.api.terminalPreview.unsubscribe(ptyId)
      terminal?.dispose()
      terminalRef.current = null
    }
  }, [autoFocus, claimGrid, ptyId, scaleToFit, terminalTheme, terminalMode])

  // Why: appearance settings must land on the open terminal, and the OS input
  // source can flip Option-as-Alt with no settings change at all. A remount
  // would reconnect the pty and repaint the agent's screen from a new snapshot.
  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) {
      return
    }
    Object.assign(
      terminal.options,
      buildPreviewAppearanceOptions(settings, macOptionAsAlt === 'true')
    )
    syncPreviewTerminalLigatures(terminal, settings)
  }, [settings, macOptionAsAlt])

  return (
    <AgentTerminalPreviewFrame
      className={className}
      containerRef={containerRef}
      terminalRef={terminalRef}
      ptyGone={ptyGone}
      onClosedActivate={onClosedActivate}
      terminalTheme={terminalTheme}
    />
  )
}
