import { vi, type Mock } from 'vitest'

type TerminalPreviewMock = Mock<(...args: unknown[]) => unknown>

type PreviewTerminalInstance = {
  write: TerminalPreviewMock
  writeCallbacks: (() => void)[]
  onDataListener: ((data: string) => void) | null
  dispose: TerminalPreviewMock
  resize: TerminalPreviewMock
  reset: TerminalPreviewMock
  focus: TerminalPreviewMock
  paste: TerminalPreviewMock
  input: TerminalPreviewMock
  scrollToTop: TerminalPreviewMock
  scrollToBottom: TerminalPreviewMock
  selectAll: TerminalPreviewMock
  clearSelection: TerminalPreviewMock
  registerLinkProvider: TerminalPreviewMock
  modes: { bracketedPasteMode: boolean }
  selectionText: string
  customKeyHandler: ((event: KeyboardEvent) => boolean) | null
}

type PreviewTerminalHarness = {
  instances: PreviewTerminalInstance[]
  linkProviderRegistrations: number
  userInputListener: (() => void) | null
  userInputDispose: TerminalPreviewMock
}

const terminalHarness = vi.hoisted(
  (): PreviewTerminalHarness => ({
    instances: [],
    linkProviderRegistrations: 0,
    userInputListener: null,
    userInputDispose: vi.fn()
  })
)

const platformState = vi.hoisted(() => ({ value: 'linux' }))
const storeState = vi.hoisted(() => ({
  settings: null,
  keybindings: {} as Record<string, string[]>
}))

const imeHarness = vi.hoisted(() => ({
  forwarders: [] as {
    claimKeyEvent: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
    sendInput: (data: string) => void
    getKittyKeyboardFlags: () => number
  }[],
  trackers: [] as { dispose: ReturnType<typeof vi.fn> }[],
  claimResult: false
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80
    rows = 24
    buffer = { active: { cursorY: 0 } }
    writeCallbacks: (() => void)[] = []
    onDataListener: ((data: string) => void) | null = null
    customKeyHandler: ((event: KeyboardEvent) => boolean) | null = null
    selectionText = ''
    write = vi.fn((_data: string, callback?: () => void) => {
      if (callback) {
        this.writeCallbacks.push(callback)
      }
    })
    open = vi.fn()
    focus = vi.fn()
    dispose = vi.fn()
    resize = vi.fn()
    reset = vi.fn()
    modes = { bracketedPasteMode: false }
    paste = vi.fn((data: string) => {
      terminalHarness.userInputListener?.()
      this.onDataListener?.(data)
    })
    input = vi.fn((data: string) => {
      terminalHarness.userInputListener?.()
      this.onDataListener?.(data)
    })
    element = document.createElement('div')
    unicode = { activeVersion: '6', versions: ['6', '11'], register: vi.fn() }
    loadAddon = vi.fn()
    attachCustomWheelEventHandler = vi.fn()
    scrollToTop = vi.fn()
    scrollToBottom = vi.fn()
    selectAll = vi.fn()
    clearSelection = vi.fn()
    registerLinkProvider = vi.fn(() => {
      terminalHarness.linkProviderRegistrations += 1
      return { dispose: vi.fn() }
    })
    getSelection = vi.fn(() => this.selectionText)
    attachCustomKeyEventHandler = vi.fn((handler: (event: KeyboardEvent) => boolean) => {
      this.customKeyHandler = handler
    })
    onData = vi.fn((listener: (data: string) => void) => {
      this.onDataListener = listener
      return { dispose: vi.fn() }
    })

    constructor() {
      terminalHarness.instances.push(this as unknown as PreviewTerminalInstance)
    }
  }
}))
vi.mock(import('@/lib/pane-manager/pane-terminal-options'), async (importOriginal) => ({
  ...(await importOriginal()),
  buildDefaultTerminalOptions: () => ({})
}))
vi.mock('@/components/terminal-pane/terminal-user-input-signal', () => ({
  subscribeToTerminalUserInput: (_terminal: unknown, listener: () => void) => {
    terminalHarness.userInputListener = listener
    return { dispose: terminalHarness.userInputDispose }
  }
}))
vi.mock('@/components/terminal-pane/use-system-prefers-dark', () => ({
  useSystemPrefersDark: () => false
}))
vi.mock('@/lib/shortcut-platform', () => ({
  getShortcutPlatform: () => platformState.value
}))
vi.mock('@/components/terminal-pane/terminal-ime-native-text-forwarder', () => ({
  installTerminalImeNativeTextForwarder: (args: {
    sendInput: (data: string) => void
    getKittyKeyboardFlags?: () => number
  }) => {
    const forwarder = {
      claimKeyEvent: vi.fn(() => imeHarness.claimResult),
      dispose: vi.fn(),
      sendInput: args.sendInput,
      // Why captured: the bridge's whole job is handing the live mirror to the forwarder.
      getKittyKeyboardFlags: args.getKittyKeyboardFlags ?? ((): number => 0)
    }
    imeHarness.forwarders.push(forwarder)
    return forwarder
  }
}))
vi.mock('@/components/terminal-pane/terminal-ime-composition-tracker', () => ({
  installTerminalImeCompositionTracker: () => {
    const tracker = { isActive: () => false, dispose: vi.fn() }
    imeHarness.trackers.push(tracker)
    return tracker
  }
}))
vi.mock('@/store', () => {
  const useAppStore = (selector: (s: typeof storeState) => unknown): unknown => selector(storeState)
  useAppStore.getState = (): typeof storeState => storeState
  return { useAppStore }
})

export { imeHarness, platformState, storeState, terminalHarness }
