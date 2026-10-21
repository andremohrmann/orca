export type PreviewGonePtyRetry = {
  schedule: () => void
  retryNow: () => void
  dispose: () => void
}

export function createPreviewGonePtyRetry({
  retryDelayMs,
  requestReconnect,
  isDisposed
}: {
  retryDelayMs: number
  requestReconnect: () => void
  isDisposed: () => boolean
}): PreviewGonePtyRetry {
  let timer: ReturnType<typeof setTimeout> | null = null
  const clear = (): void => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  return {
    schedule: () => {
      if (timer || isDisposed()) {
        return
      }
      timer = setTimeout(() => {
        timer = null
        requestReconnect()
      }, retryDelayMs)
    },
    retryNow: () => {
      clear()
      requestReconnect()
    },
    dispose: clear
  }
}
