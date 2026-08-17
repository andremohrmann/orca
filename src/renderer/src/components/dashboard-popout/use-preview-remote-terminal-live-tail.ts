import { useEffect, type MutableRefObject } from 'react'
import { useAppStore } from '@/store'
import {
  getRemoteRuntimePtyEnvironmentId,
  subscribeToRuntimeTerminalData
} from '@/runtime/runtime-terminal-stream'

let nextPreviewRemoteLiveClientId = 0

export function usePreviewRemoteTerminalLiveTail({
  ptyId,
  onDataRef
}: {
  ptyId: string
  onDataRef: MutableRefObject<(data: string) => void>
}): void {
  const settings = useAppStore((state) => state.settings)

  useEffect(() => {
    if (!getRemoteRuntimePtyEnvironmentId(ptyId)) {
      return
    }
    let disposed = false
    let disposeSubscription: (() => void) | null = null
    const clientId = `dashboard-preview:${++nextPreviewRemoteLiveClientId}`
    void subscribeToRuntimeTerminalData(
      settings,
      ptyId,
      clientId,
      (data) => {
        if (!disposed) {
          onDataRef.current(data)
        }
      },
      { startAtLiveTail: true }
    )
      .then((dispose) => {
        if (disposed) {
          dispose()
          return
        }
        disposeSubscription = dispose
      })
      .catch(() => undefined)

    return () => {
      disposed = true
      disposeSubscription?.()
    }
  }, [onDataRef, ptyId, settings])
}
