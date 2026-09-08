import type { Terminal } from '@xterm/xterm'
import { createPreviewGridClaim } from './preview-grid-claim'
import { installPreviewGridFocusOwnership } from './preview-grid-focus-ownership'

const noGridClaim = {
  requestNow: (): void => undefined,
  reclaim: (): void => undefined,
  release: (): void => undefined,
  schedule: (): void => undefined,
  dispose: (): void => undefined
}

export function createPreviewGridFocusHandoff(args: {
  claimGrid: boolean
  releaseOnWindowBlur: boolean
  ptyId: string
  container: HTMLElement
  getTerminal: () => Terminal | null
  transport?: Parameters<typeof createPreviewGridClaim>[0]['transport']
}): typeof noGridClaim {
  if (!args.claimGrid) {
    return noGridClaim
  }
  const claim = createPreviewGridClaim({
    ptyId: args.ptyId,
    container: args.container,
    getTerminal: args.getTerminal,
    transport: args.transport,
    // Keeping an existing hold on blur must not let background previews resize new sessions.
    isActive: () => document.hasFocus()
  })
  const disposeOwnership = installPreviewGridFocusOwnership({
    enabled: true,
    reclaim: claim.reclaim,
    release: args.releaseOnWindowBlur ? claim.release : noGridClaim.release
  })
  return {
    ...claim,
    dispose: (): void => {
      disposeOwnership()
      claim.dispose()
    }
  }
}
