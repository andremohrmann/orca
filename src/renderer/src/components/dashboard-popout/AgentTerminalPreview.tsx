import { useEffect, useRef, useState } from 'react'
import type { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import { TerminalKittyKeyboardModeTracker } from '../../../../shared/terminal-kitty-keyboard-mode-tracker'
import { replayPreviewConnectionSnapshot } from './preview-terminal-snapshot-replay'
import { installPreviewTerminalCompatibility } from './preview-terminal-compatibility'
import { createPreviewClipboardPaster } from './preview-terminal-paste'
import { installPreviewImeBridge, type PreviewImeBridge } from './preview-terminal-ime-bridge'
import { useAppStore } from '@/store'
import { installPreviewTerminalKeyHandler } from './preview-terminal-key-handler'
import { createPreviewGridFocusHandoff } from './preview-grid-focus-handoff'
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
import { createPreviewTerminalFitScheduler } from './preview-terminal-fit'
import { createPreviewTerminalHorizontalScrollReset } from './preview-terminal-horizontal-scroll'
import { installPreviewTerminalInputRouting } from './preview-terminal-input-routing'
import { usePreviewTerminalAppearance } from './usePreviewTerminalAppearance'
import { usePreviewTerminalRuntimeRefs } from './usePreviewTerminalRuntimeRefs'
import { installPreviewTerminalInteractions } from './preview-terminal-interaction-installers'
import { createPreviewGonePtyRetry } from './preview-terminal-gone-retry'
import { createPreviewRemoteTerminalSession } from './preview-remote-terminal-session'
import { isWindowsUserAgent } from '@/components/terminal-pane/pane-helpers'
const RESYNC_RETRY_DELAY_MS = 150
type PendingLivePayload = {
  acknowledge: boolean
  payload: Extract<TerminalPreviewDataPayload, { type: 'data' }>
}
export function AgentTerminalPreview(props: AgentTerminalPreviewProps): React.JSX.Element {
  const {
    ptyId,
    terminalInput = null,
    terminalLinks = null,
    claimGrid = true,
    releaseGridOnWindowBlur = false,
    refreshAfterInput = true,
    scaleToFit = true,
    autoFocus = true,
    onClosedActivate,
    className
  } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const { settings, macOptionAsAlt, terminalTheme, terminalMode } = usePreviewTerminalTheme()
  const { settingsRef, macOptionAsAltRef, terminalInputRef, terminalLinksRef } =
    usePreviewTerminalRuntimeRefs({ settings, macOptionAsAlt, terminalInput, terminalLinks })
  const [ptyGone, setPtyGone] = useState(false),
    retryGonePtyRef = useRef<() => void>(() => undefined),
    reclaimGridRef = useRef<() => void>(() => undefined)
  const pasteClipboardTextRef = useRef<ReturnType<typeof createPreviewClipboardPaster> | null>(null)
  usePreviewTerminalAppearance({ terminalRef, settings, macOptionAsAlt })
  useEffect(() => {
    setPtyGone(false)
    const container = containerRef.current
    if (!container) {
      return
    }
    let disposed = false
    let terminal: Terminal | null = null
    let userInputDisposable: { dispose: () => void } | null = null
    let imeBridge: PreviewImeBridge | null = null
    let disposeKeyHandler: (() => void) | null = null
    let disposeTerminalCompatibility: (() => void) | null = null
    let disposeInteractions: (() => void) | null = null
    const kittyKeyboardModes = new TerminalKittyKeyboardModeTracker()
    let replayDepth = 0,
      refreshInFlight = false
    let refreshAgain = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let inputRefreshTimer: ReturnType<typeof setTimeout> | null = null
    let requestInputRefresh = (): void => undefined,
      scheduleGridClaim = (): void => undefined
    const pendingLivePayloads: PendingLivePayload[] = []
    const horizontalReset = createPreviewTerminalHorizontalScrollReset(container)
    const scheduleFit = createPreviewTerminalFitScheduler({
      container,
      getTerminal: () => terminal,
      scaleToFit,
      localResizeToFit: !scaleToFit,
      onUnscaledOverflow: () => scheduleGridClaim()
    })
    const goneRetry = createPreviewGonePtyRetry({
      retryDelayMs: 1_000,
      requestReconnect: () => void setup(true),
      isDisposed: () => disposed
    })
    const remoteSession = createPreviewRemoteTerminalSession({
      ptyId,
      onSnapshot: (snapshot) => {
        setPtyGone(false)
        replayConnection({ snapshot, replay: [] }, terminal !== null, () => undefined)
      },
      onData: (data) => writeLive({ type: 'data', ptyId, data, bytes: 0 }, false),
      onResize: ({ cols, rows }) => terminal?.resize(cols, rows),
      onUnavailable: () => setPtyGone(true)
    })
    const gridClaim = createPreviewGridFocusHandoff({
      claimGrid,
      releaseOnWindowBlur: releaseGridOnWindowBlur,
      ptyId,
      container,
      getTerminal: () => terminal,
      transport: remoteSession ?? undefined
    })
    scheduleGridClaim = gridClaim.schedule
    reclaimGridRef.current = gridClaim.reclaim
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
    const writeReplayed = (chunk: string, onDone?: () => void, live = false): void => {
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
    const writeLive = (payload: PendingLivePayload['payload'], acknowledge = true): void => {
      clearPreviewTerminalTimer(inputRefreshTimer)
      inputRefreshTimer = null
      if (!terminal) {
        pendingLivePayloads.push({ payload, acknowledge })
        return
      }
      writeReplayed(
        payload.data,
        () => {
          if (!disposed && acknowledge) {
            void window.api.terminalPreview.ack(ptyId, payload.bytes)
          }
        },
        true
      )
    }
    const sendInput = (data: string): boolean | Promise<boolean> => {
      return remoteSession
        ? remoteSession.input(data)
        : window.api.terminalPreview.input(ptyId, data)
    }
    const pasteClipboardText = createPreviewClipboardPaster({
      ptyId,
      container,
      getTerminal: () => terminal,
      getTerminalInput: () => terminalInputRef.current,
      getTerminalLinks: () => terminalLinksRef.current,
      writePty: sendInput,
      isDisposed: () => disposed
    })
    pasteClipboardTextRef.current = pasteClipboardText

    const disposeImeNativeTextBridge = (): void => {
      imeBridge?.dispose()
      imeBridge = null
    }
    const installImeNativeTextBridge = (): void => {
      if (terminal) {
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
        sendInput: (data) => terminal?.input(data),
        getShortcutContext: () => ({
          clientPlatform: getShortcutPlatform(),
          macOptionAsAlt: macOptionAsAltRef.current,
          keybindings: useAppStore.getState().keybindings,
          terminalInput: terminalInputRef.current,
          getKittyKeyboardFlags: () => kittyKeyboardModes.flags,
          terminalShortcutPolicy: settingsRef.current?.terminalShortcutPolicy
        })
      })
    }
    disposeInteractions = installPreviewTerminalInteractions({
      container,
      getTerminal: () => terminal,
      sendInput,
      requestInputRefresh,
      isRightClickToPasteEnabled: () =>
        settingsRef.current?.terminalRightClickToPaste ?? isWindowsUserAgent(),
      pasteClipboardText: (activeElement, source) => void pasteClipboardText(activeElement, source)
    })

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
        disposeTerminalCompatibility = installPreviewTerminalCompatibility(terminal, {
          getSettings: () => settingsRef.current,
          getTerminalLinks: () => terminalLinksRef.current
        })
        userInputDisposable = installPreviewTerminalInputRouting({
          terminal,
          sendInput,
          requestInputRefresh:
            refreshAfterInput && !remoteSession ? requestInputRefresh : () => undefined,
          scheduleHorizontalReset: horizontalReset.schedule,
          isReplaying: () => replayDepth > 0
        })
        installImeNativeTextBridge()
        installKeyHandler()
      }
      replayPreviewConnectionSnapshot({
        snapshot: snap,
        replay: connection.replay,
        kittyKeyboardModes,
        write: (chunk, live) => writeReplayed(chunk, undefined, live)
      })
      for (const pending of pendingLivePayloads.splice(0)) {
        writeLive(pending.payload, pending.acknowledge)
      }
      if (connection.resyncRequired) {
        refreshAgain = false
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
      if (!connection.snapshot) {
        refreshInFlight = false
        setPtyGone(true)
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
        goneRetry.schedule()
        return
      }
      refreshInFlight = false
      setPtyGone(false)
      goneRetry.dispose()
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
    retryGonePtyRef.current = remoteSession ? () => void remoteSession.start() : goneRetry.retryNow
    const disposeAppMenuClipboard = installPreviewTerminalAppMenuClipboard({
      container,
      getTerminal: () => terminal,
      pasteClipboardText
    })

    const offData = remoteSession
      ? null
      : window.api.terminalPreview.onData((payload) => {
          if (payload.ptyId !== ptyId) {
            return
          }
          if (payload.type === 'resync') {
            void setup(true)
            return
          }
          writeLive(payload)
        })

    void (remoteSession ? remoteSession.start() : setup())
    return () => {
      disposed = true
      clearPreviewTerminalTimer(retryTimer)
      clearPreviewTerminalTimer(inputRefreshTimer)
      goneRetry.dispose()
      retryGonePtyRef.current = () => undefined
      reclaimGridRef.current = () => undefined
      horizontalReset.dispose()
      pasteClipboardTextRef.current = null
      gridClaim.dispose()
      boxResizeObserver?.disconnect()
      disposeAppMenuClipboard()
      offData?.()
      userInputDisposable?.dispose()
      disposeImeNativeTextBridge()
      disposeTerminalCompatibility?.()
      disposeKeyHandler?.()
      disposeInteractions?.()
      if (remoteSession) {
        remoteSession.dispose()
      } else {
        void window.api.terminalPreview.unsubscribe(ptyId)
      }
      terminal?.dispose()
      terminalRef.current = null
    }
  }, [
    autoFocus,
    claimGrid,
    macOptionAsAltRef,
    pasteClipboardTextRef,
    ptyId,
    releaseGridOnWindowBlur,
    refreshAfterInput,
    scaleToFit,
    settingsRef,
    terminalInputRef,
    terminalLinksRef,
    terminalTheme,
    terminalMode
  ])

  return (
    <AgentTerminalPreviewFrame
      className={className}
      containerRef={containerRef}
      terminalRef={terminalRef}
      ptyId={ptyId}
      ptyGone={ptyGone}
      onActivate={() => reclaimGridRef.current()}
      onClosedActivate={() => {
        onClosedActivate?.()
        retryGonePtyRef.current()
      }}
      terminalTheme={terminalTheme}
    />
  )
}
