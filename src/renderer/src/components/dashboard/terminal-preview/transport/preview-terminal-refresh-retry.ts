export function createPreviewTerminalRefreshRetry(delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    schedule(callback: () => void): void {
      if (timer === null) {
        timer = setTimeout(() => {
          timer = null
          callback()
        }, delayMs)
      }
    },
    cancel(): void {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    }
  }
}
