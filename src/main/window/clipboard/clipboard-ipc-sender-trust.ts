import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { isTrustedMainRendererSender } from '../../ipc/renderer-requests/main-renderer-sender-trust'
import { isDashboardPopoutRenderer } from '../dashboard-popout-window'
import { isPluginPopoutRenderer } from '../../plugins/windows/plugin-window-service'

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
  // Owned terminal containers need text only; guests, images and files retain separate authority.
  if (
    !isTrustedClipboardRenderer(event.sender) &&
    !isDashboardPopoutRenderer(event.sender) &&
    !isPluginPopoutRenderer(event.sender)
  ) {
    throw new Error('Unauthorized clipboard IPC sender')
  }
}

function isTrustedClipboardRenderer(sender: WebContents): boolean {
  return isTrustedMainRendererSender(sender, trustedClipboardRendererWebContentsId)
}
