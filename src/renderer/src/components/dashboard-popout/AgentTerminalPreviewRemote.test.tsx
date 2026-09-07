// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { runtimeStreamHarness, terminalHarness } from './agent-terminal-preview-test-harness'
import { AgentTerminalPreview } from './AgentTerminalPreview'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

it('fits a remote Live View pane through its own stream and keeps the claim on blur', async () => {
  vi.useFakeTimers()
  terminalHarness.instances.length = 0
  const localConnect = vi.fn(),
    localFit = vi.fn(),
    localUnsubscribe = vi.fn()
  Object.assign(window, {
    api: {
      terminalPreview: { connect: localConnect, fit: localFit, unsubscribe: localUnsubscribe },
      ui: {
        onAppMenuPaste: () => vi.fn(),
        onAppMenuSelectionAction: () => vi.fn()
      }
    }
  })
  runtimeStreamHarness.subscribeTerminal.mockImplementation(async ({ callbacks }) => {
    runtimeStreamHarness.callbacks = callbacks
    callbacks.onSnapshot('remote screen', { cols: 80, rows: 24 })
    callbacks.onSubscribed()
    return {
      sendInput: runtimeStreamHarness.sendInput,
      claimViewport: runtimeStreamHarness.claimViewport,
      close: runtimeStreamHarness.dispose
    }
  })
  const view = render(
    <AgentTerminalPreview
      ptyId="remote:other-server@@terminal-1"
      claimGrid={true}
      releaseGridOnWindowBlur={false}
      refreshAfterInput={false}
      scaleToFit={false}
      autoFocus={false}
    />
  )
  await vi.waitFor(() => expect(terminalHarness.instances).toHaveLength(1))
  const host = view.container.querySelector<HTMLElement>('.origin-bottom-left')!
  const box = host.parentElement!
  Object.defineProperty(box, 'clientWidth', { configurable: true, value: 900 })
  Object.defineProperty(box, 'clientHeight', { configurable: true, value: 480 })
  const screen = document.createElement('div')
  screen.className = 'xterm-screen'
  Object.defineProperty(screen, 'offsetWidth', { configurable: true, value: 800 })
  Object.defineProperty(screen, 'offsetHeight', { configurable: true, value: 384 })
  host.appendChild(screen)
  await vi.advanceTimersByTimeAsync(200)
  expect(runtimeStreamHarness.claimViewport).toHaveBeenCalledWith(90, 30)
  expect(localFit).not.toHaveBeenCalled()
  expect(localConnect).not.toHaveBeenCalled()

  act(() => window.dispatchEvent(new Event('blur')))
  expect(runtimeStreamHarness.dispose).not.toHaveBeenCalled()
  act(() =>
    runtimeStreamHarness.callbacks?.onFitOverrideChanged?.({
      mode: 'desktop-fit',
      cols: 90,
      rows: 30
    })
  )
  expect(terminalHarness.instances[0]!.resize).toHaveBeenCalledWith(90, 30)
  const snapshotCalls = terminalHarness.instances[0]!.reset.mock.calls.length
  act(() => runtimeStreamHarness.callbacks?.onData('remote output'))
  expect(terminalHarness.instances[0]!.write).toHaveBeenCalledWith(
    'remote output',
    expect.any(Function)
  )
  expect(terminalHarness.instances[0]!.reset).toHaveBeenCalledTimes(snapshotCalls)
  view.unmount()
  expect(runtimeStreamHarness.dispose).toHaveBeenCalledOnce()
  expect(localUnsubscribe).not.toHaveBeenCalled()
})
