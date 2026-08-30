import type { Terminal } from '@xterm/xterm'
import { subscribeToTerminalUserInput } from '@/components/terminal-pane/terminal-user-input-signal'

export function installPreviewTerminalInputRouting(args: {
  terminal: Terminal
  sendInput: (data: string) => boolean | Promise<boolean>
  requestInputRefresh: () => void
  shouldRequestInputRefresh?: (data: string) => boolean
  scheduleHorizontalReset: () => void
  isReplaying: () => boolean
}): { dispose: () => void } | null {
  let pendingUserInputSignals = 0
  const userInputDisposable = subscribeToTerminalUserInput(args.terminal, () => {
    pendingUserInputSignals = Math.min(32, pendingUserInputSignals + 1)
  })
  args.terminal.onData((data) => {
    const signaledUserInput = pendingUserInputSignals > 0
    if (signaledUserInput) {
      pendingUserInputSignals--
    }
    if (userInputDisposable ? !signaledUserInput : args.isReplaying()) {
      return
    }
    void args.sendInput(data)
    if (args.shouldRequestInputRefresh?.(data) ?? true) {
      args.requestInputRefresh()
    }
    if (data.includes('\r') || data.includes('\n')) {
      args.scheduleHorizontalReset()
    }
  })
  return userInputDisposable
}
