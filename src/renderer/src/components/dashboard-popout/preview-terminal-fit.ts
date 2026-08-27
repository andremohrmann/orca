import type { Terminal } from '@xterm/xterm'

const LOCAL_FIT_MIN_COLS = 20
const LOCAL_FIT_MAX_COLS = 240
const LOCAL_FIT_MIN_ROWS = 8
const LOCAL_FIT_MAX_ROWS = 120

function clampLocalFitAxis(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function fitPreviewTerminalLocalGrid(args: {
  box: HTMLElement
  screen: HTMLElement
  terminal: Terminal
}): void {
  const cellWidth = args.screen.offsetWidth / Math.max(1, args.terminal.cols)
  const cellHeight = args.screen.offsetHeight / Math.max(1, args.terminal.rows)
  if (
    !Number.isFinite(cellWidth) ||
    !Number.isFinite(cellHeight) ||
    cellWidth <= 0 ||
    cellHeight <= 0 ||
    args.box.clientWidth <= 0 ||
    args.box.clientHeight <= 0
  ) {
    return
  }
  const cols = clampLocalFitAxis(
    Math.floor(args.box.clientWidth / cellWidth),
    LOCAL_FIT_MIN_COLS,
    LOCAL_FIT_MAX_COLS
  )
  const rows = clampLocalFitAxis(
    Math.floor(args.box.clientHeight / cellHeight),
    LOCAL_FIT_MIN_ROWS,
    LOCAL_FIT_MAX_ROWS
  )
  if (cols !== args.terminal.cols || rows !== args.terminal.rows) {
    args.terminal.resize(cols, rows)
  }
}

export function resetPreviewTerminalHorizontalScroll(container: HTMLElement): void {
  for (const element of container.querySelectorAll<HTMLElement>(
    '.xterm, .xterm-screen, .xterm-viewport, .xterm-scroll-area'
  )) {
    element.scrollLeft = 0
  }
}

export function fitPreviewTerminalToBox(args: {
  container: HTMLElement
  terminal: Terminal | null
  scaleToFit: boolean
  localResizeToFit?: boolean
  onUnscaledOverflow: () => void
}): void {
  const screen = args.container.querySelector<HTMLElement>('.xterm-screen')
  const box = args.container.parentElement
  if (!screen || !box || !args.terminal) {
    return
  }
  if (!args.scaleToFit && args.localResizeToFit === true) {
    fitPreviewTerminalLocalGrid({ box, screen, terminal: args.terminal })
  }
  const scale = args.scaleToFit ? Math.min(1, box.clientWidth / Math.max(1, screen.offsetWidth)) : 1
  args.container.style.transform = scale < 1 ? `scale(${scale})` : ''
  args.container.style.overflow = 'hidden'
  screen.style.overflow = 'hidden'
  if (
    !args.scaleToFit &&
    args.localResizeToFit !== true &&
    screen.offsetWidth > box.clientWidth + 1
  ) {
    args.onUnscaledOverflow()
  }
  const cellHeight = screen.offsetHeight / Math.max(1, args.terminal.rows)
  const cursorBottom = (args.terminal.buffer.active.cursorY + 1) * cellHeight * scale
  const anchorTop = cursorBottom <= box.clientHeight
  box.style.alignItems = anchorTop ? 'flex-start' : 'flex-end'
  args.container.style.transformOrigin = anchorTop ? 'top left' : 'bottom left'
}

export function createPreviewTerminalFitScheduler(args: {
  container: HTMLElement
  getTerminal: () => Terminal | null
  scaleToFit: boolean
  localResizeToFit: boolean
  onUnscaledOverflow: () => void
}): () => void {
  let fitScheduled = false
  return () => {
    if (fitScheduled) {
      return
    }
    fitScheduled = true
    requestAnimationFrame(() => {
      fitScheduled = false
      fitPreviewTerminalToBox({
        container: args.container,
        terminal: args.getTerminal(),
        scaleToFit: args.scaleToFit,
        localResizeToFit: args.localResizeToFit,
        onUnscaledOverflow: args.onUnscaledOverflow
      })
    })
  }
}
