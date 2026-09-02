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
}): typeof noGridClaim {
  if (!args.claimGrid) {
    return noGridClaim
  }
  const claim = createPreviewGridClaim({
    ptyId: args.ptyId,
    container: args.container,
    getTerminal: args.getTerminal,
    isActive: () => !args.releaseOnWindowBlur || document.hasFocus()
  })
  const disposeOwnership = installPreviewGridFocusOwnership({
    enabled: args.releaseOnWindowBlur,
    reclaim: claim.reclaim,
    release: claim.release
  })
  return {
    ...claim,
    dispose: (): void => {
      disposeOwnership()
      claim.dispose()
    }
  }
}
