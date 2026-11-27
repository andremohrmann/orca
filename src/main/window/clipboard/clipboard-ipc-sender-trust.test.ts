import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { afterEach, expect, test, vi } from 'vitest'
import {
  assertTrustedClipboardImagePasteSender,
  assertTrustedClipboardSender,
  setTrustedClipboardRendererWebContentsId
} from './clipboard-ipc-sender-trust'

const { popout } = vi.hoisted(() => {
  const popout: { current: WebContents | null } = { current: null }
  return { popout }
})
vi.mock('../dashboard-popout-window', () => ({
  isDashboardPopoutRenderer: (sender: WebContents) => sender === popout.current
}))

function sender(id: number): IpcMainInvokeEvent {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: The guard reads only sender identity, id, liveness, type and URL, all supplied by this IPC fixture.
  return {
    sender: { id, isDestroyed: () => false, getType: () => 'window', getURL: () => '' }
  } as unknown as IpcMainInvokeEvent
}

afterEach(() => {
  setTrustedClipboardRendererWebContentsId(null)
  popout.current = null
})

test('only the registered popout gains terminal image staging, never general clipboard authority', () => {
  setTrustedClipboardRendererWebContentsId(1)
  const main = sender(1)
  const liveView = sender(2)
  const other = sender(3)
  popout.current = liveView.sender

  for (const target of [
    undefined,
    {},
    { connectionId: null, runtimeEnvironmentId: null },
    { connectionId: 'ssh-host', runtimeEnvironmentId: 'paired-host' }
  ]) {
    expect(() => assertTrustedClipboardImagePasteSender(liveView, target)).not.toThrow()
    expect(() => assertTrustedClipboardImagePasteSender(other, target)).toThrow('Unauthorized')
  }
  for (const target of [
    null,
    [],
    'invalid',
    { fileName: '../image.png' },
    { forNativeChatDraft: true },
    { forStructuredChat: true },
    { agentSessionAttachment: { sessionId: 'another-session' } },
    { runtimeEnvironmentId: {} },
    { connectionId: 'x'.repeat(4097) }
  ]) {
    expect(() => assertTrustedClipboardImagePasteSender(liveView, target)).toThrow('Unauthorized')
  }
  expect(() => assertTrustedClipboardSender(liveView)).toThrow('Unauthorized')
  expect(() => assertTrustedClipboardSender(other)).toThrow('Unauthorized')
  expect(() => assertTrustedClipboardSender(main)).not.toThrow()
  expect(() =>
    assertTrustedClipboardImagePasteSender(main, { forNativeChatDraft: true })
  ).not.toThrow()

  popout.current = null
  expect(() => assertTrustedClipboardImagePasteSender(liveView, undefined)).toThrow('Unauthorized')
})
