import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { isTrustedMainRendererSender } from '../../ipc/renderer-requests/main-renderer-sender-trust'
import { isDashboardPopoutRenderer } from '../dashboard-popout-window'

let trustedClipboardRendererWebContentsId: number | null = null

export function setTrustedClipboardRendererWebContentsId(webContentsId: number | null): void {
  trustedClipboardRendererWebContentsId = webContentsId
}

export function assertTrustedClipboardSender(event: IpcMainInvokeEvent): void {
  if (!isTrustedClipboardRenderer(event.sender)) {
    throw new Error('Unauthorized clipboard IPC sender')
  }
}

export function assertTrustedClipboardTextSender(event: IpcMainInvokeEvent): void {
  if (!isTrustedClipboardRenderer(event.sender) && !isDashboardPopoutRenderer(event.sender)) {
    throw new Error('Unauthorized clipboard IPC sender')
  }
}

export function assertTrustedClipboardImagePasteSender(
  event: IpcMainInvokeEvent,
  args: unknown
): void {
  if (isTrustedClipboardRenderer(event.sender)) {
    return
  }
  // Popouts may stage terminal images, but cannot name files or write chat attachments/drafts.
  const terminalTargetOnly =
    args === undefined ||
    (args !== null &&
      typeof args === 'object' &&
      !Array.isArray(args) &&
      Object.entries(args).every(
        ([key, value]) =>
          (key === 'connectionId' || key === 'runtimeEnvironmentId') &&
          (value == null || (typeof value === 'string' && value.length <= 4096))
      ))
  if (!isDashboardPopoutRenderer(event.sender) || !terminalTargetOnly) {
    throw new Error('Unauthorized clipboard IPC sender')
  }
}

function isTrustedClipboardRenderer(sender: WebContents): boolean {
  return isTrustedMainRendererSender(sender, trustedClipboardRendererWebContentsId)
}
