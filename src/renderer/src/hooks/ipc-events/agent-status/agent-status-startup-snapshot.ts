type SnapshotSignal = {
  ready: boolean
  successful: boolean
  claimed: boolean
  promise: Promise<void>
  resolve: () => void
}

function createSignal(): SnapshotSignal {
  let resolve = (): void => undefined
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { ready: false, successful: false, claimed: false, promise, resolve }
}

let current = createSignal()

export function isAgentStatusStartupSnapshotReady(): boolean {
  return current.ready
}

export function isAgentStatusStartupSnapshotSuccessful(): boolean {
  return current.successful
}

/** Coordinates the bridge's existing replay; it retains no agent rows. */
export function registerAgentStatusStartupSnapshot(): {
  reset: () => void
  settle: (successful?: boolean) => void
  dispose: () => void
} {
  if (current.claimed) {
    current.resolve()
    current = createSignal()
  }
  let owned = current
  owned.claimed = true
  return {
    reset: () => {
      if (current !== owned) {
        return
      }
      owned.resolve()
      owned = createSignal()
      owned.claimed = true
      current = owned
    },
    settle: (successful = false) => {
      if (current !== owned) {
        return
      }
      owned.successful = successful
      owned.ready = true
      owned.resolve()
    },
    dispose: () => {
      if (current !== owned) {
        return
      }
      owned.resolve()
      current = createSignal()
    }
  }
}

export async function awaitAgentStatusStartupSnapshot(timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!current.ready) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      current.promise,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, remaining)
      })
    ])
    clearTimeout(timer)
  }
}
