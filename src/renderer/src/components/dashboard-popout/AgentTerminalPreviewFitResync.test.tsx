// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { terminalHarness } from './agent-terminal-preview-test-harness'
import { AgentTerminalPreview } from './AgentTerminalPreview'

describe('AgentTerminalPreview fit resync', () => {
  const input = vi.fn(async (_ptyId: string, _data: string) => true)
  const fit = vi.fn(async (_ptyId: string, cols: number, rows: number) => ({ cols, rows }))
  const ack = vi.fn(async () => {})
  const unsubscribe = vi.fn(async () => {})
  const connect = vi.fn()
  let emitData: ((payload: unknown) => void) | null

  beforeEach(() => {
    terminalHarness.instances.length = 0
    terminalHarness.linkProviderRegistrations = 0
    terminalHarness.userInputListener = null
    emitData = null
    connect.mockResolvedValue({
      snapshot: { data: '', cols: 80, rows: 24, seq: 1 },
      replay: []
    })
    Object.assign(window, {
      api: {
        terminalPreview: {
          connect,
          input,
          fit,
          ack,
          unsubscribe,
          onData: (listener: (payload: unknown) => void) => {
            emitData = listener
            return vi.fn()
          }
        },
        ui: {
          readClipboardText: vi.fn(async () => ''),
          writeClipboardText: vi.fn(async () => {}),
          writeTerminalClipboardText: vi.fn(async () => {}),
          onAppMenuPaste: () => vi.fn(),
          onAppMenuSelectionAction: () => vi.fn(),
          performNativeSelectionAction: vi.fn()
        }
      }
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('claims a grid sized to the dialog box and never re-requests an unchanged target', async () => {
    vi.useFakeTimers()
    const view = render(<AgentTerminalPreview ptyId="pty-1" />)
    await vi.waitFor(() => expect(terminalHarness.instances).toHaveLength(1))

    const host = view.container.querySelector<HTMLElement>('.origin-bottom-left')!
    const box = host.parentElement!
    Object.defineProperty(box, 'clientWidth', { configurable: true, value: 900 })
    Object.defineProperty(box, 'clientHeight', { configurable: true, value: 480 })
    // 80x24 grid rendered at 800x384 -> 10x16 cells -> the box holds 90x30.
    const screen = document.createElement('div')
    screen.className = 'xterm-screen'
    Object.defineProperty(screen, 'offsetWidth', { configurable: true, value: 800 })
    Object.defineProperty(screen, 'offsetHeight', { configurable: true, value: 384 })
    host.appendChild(screen)

    await vi.advanceTimersByTimeAsync(200)
    expect(fit).toHaveBeenCalledTimes(1)
    expect(fit).toHaveBeenCalledWith('pty-1', 90, 30)

    act(() => emitData?.({ type: 'resync', ptyId: 'pty-1' }))
    await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(2))
    await vi.advanceTimersByTimeAsync(400)
    expect(fit).toHaveBeenCalledTimes(1)
  })

  it('reflows a live-view preview locally while claiming the matching PTY grid', async () => {
    vi.useFakeTimers()
    const view = render(
      <AgentTerminalPreview
        ptyId="pty-1"
        claimGrid={true}
        refreshAfterInput={false}
        scaleToFit={false}
        autoFocus={false}
      />
    )
    await vi.waitFor(() => expect(terminalHarness.instances).toHaveLength(1))

    const host = view.container.querySelector<HTMLElement>('.origin-bottom-left')!
    const box = host.parentElement!
    Object.defineProperty(box, 'clientWidth', { configurable: true, value: 600 })
    Object.defineProperty(box, 'clientHeight', { configurable: true, value: 320 })
    const screen = document.createElement('div')
    screen.className = 'xterm-screen'
    Object.defineProperty(screen, 'offsetWidth', { configurable: true, value: 800 })
    Object.defineProperty(screen, 'offsetHeight', { configurable: true, value: 384 })
    host.appendChild(screen)

    act(() => emitData?.({ type: 'data', ptyId: 'pty-1', data: 'output', bytes: 6 }))
    act(() =>
      terminalHarness.instances[0]!.writeCallbacks.splice(0).forEach((callback) => callback())
    )
    await vi.advanceTimersByTimeAsync(20)

    expect(terminalHarness.instances[0]!.resize).toHaveBeenCalledWith(60, 20)
    expect(fit).not.toHaveBeenCalled()
  })

  it('does not reconnect a grid-fitted live-view preview after typing or submitting', async () => {
    vi.useFakeTimers()
    render(
      <AgentTerminalPreview
        ptyId="pty-1"
        claimGrid={true}
        refreshAfterInput={false}
        scaleToFit={false}
        autoFocus={false}
      />
    )
    await vi.waitFor(() => expect(terminalHarness.instances).toHaveLength(1))
    const terminal = terminalHarness.instances[0]!

    act(() => {
      terminalHarness.userInputListener?.()
      terminal.onDataListener?.('k')
      terminalHarness.userInputListener?.()
      terminal.onDataListener?.('\r')
    })
    await vi.advanceTimersByTimeAsync(200)

    expect(input.mock.calls.map(([, data]) => data)).toEqual(['k', '\r'])
    expect(connect).toHaveBeenCalledTimes(1)
    expect(terminal.reset).not.toHaveBeenCalled()
  })

  it('delays repeated capture after an overflow and cancels the retry on unmount', async () => {
    vi.useFakeTimers()
    connect.mockResolvedValue({
      snapshot: { data: 'screen', cols: 80, rows: 24, seq: 1 },
      replay: [],
      resyncRequired: true
    })
    const view = render(<AgentTerminalPreview ptyId="pty-1" />)
    await vi.waitFor(() => expect(terminalHarness.instances).toHaveLength(1))
    const terminal = terminalHarness.instances[0]!
    expect(connect).toHaveBeenCalledTimes(1)

    act(() => terminal.writeCallbacks.splice(0).forEach((callback) => callback()))
    await vi.advanceTimersByTimeAsync(149)
    expect(connect).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(connect).toHaveBeenCalledTimes(2)

    act(() => terminal.writeCallbacks.splice(0).forEach((callback) => callback()))
    view.unmount()
    await vi.advanceTimersByTimeAsync(150)
    expect(connect).toHaveBeenCalledTimes(2)
  })

  it('keeps retrying a restored pane after a closed preview is activated', async () => {
    vi.useFakeTimers()
    const onClosedActivate = vi.fn()
    connect
      .mockResolvedValueOnce({ snapshot: null, replay: [] })
      .mockResolvedValueOnce({ snapshot: null, replay: [] })
      .mockResolvedValueOnce({
        snapshot: { data: 'restored', cols: 80, rows: 24, seq: 2 },
        replay: []
      })

    const view = render(
      <AgentTerminalPreview ptyId="pty-restore" onClosedActivate={onClosedActivate} />
    )
    await vi.waitFor(() => expect(view.getByRole('button', { name: /No live terminal/ })))

    fireEvent.click(view.getByRole('button', { name: /No live terminal/ }))
    await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(2))
    expect(onClosedActivate).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1_000)

    await vi.waitFor(() => expect(terminalHarness.instances).toHaveLength(1))
    await vi.waitFor(() =>
      expect(view.queryByRole('button', { name: /No live terminal/ })).not.toBeInTheDocument()
    )
    expect(connect).toHaveBeenCalledTimes(3)
  })
})
