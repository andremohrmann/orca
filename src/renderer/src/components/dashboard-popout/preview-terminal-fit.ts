import type { Terminal } from '@xterm/xterm'

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
  onUnscaledOverflow: () => void
}): void {
  const screen = args.container.querySelector<HTMLElement>('.xterm-screen')
  const box = args.container.parentElement
  if (!screen || !box || !args.terminal) {
    return
  }
  const scale = args.scaleToFit ? Math.min(1, box.clientWidth / Math.max(1, screen.offsetWidth)) : 1
  args.container.style.transform = scale < 1 ? `scale(${scale})` : ''
  args.container.style.overflow = 'hidden'
  screen.style.overflow = 'hidden'
  if (!args.scaleToFit && screen.offsetWidth > box.clientWidth + 1) {
    args.onUnscaledOverflow()
  }
  const cellHeight = screen.offsetHeight / Math.max(1, args.terminal.rows)
  const cursorBottom = (args.terminal.buffer.active.cursorY + 1) * cellHeight * scale
  const anchorTop = cursorBottom <= box.clientHeight
  box.style.alignItems = anchorTop ? 'flex-start' : 'flex-end'
  args.container.style.transformOrigin = anchorTop ? 'top left' : 'bottom left'
}
