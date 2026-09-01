import type { Terminal, ITheme } from '@xterm/xterm'
import type { ReactNode } from 'react'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'

export function AgentTerminalPreviewFrame({
  className,
  containerRef,
  terminalRef,
  ptyGone,
  onActivate,
  onClosedActivate,
  terminalTheme,
  contextMenu
}: {
  className?: string
  containerRef: React.RefObject<HTMLDivElement | null>
  terminalRef: React.MutableRefObject<Terminal | null>
  ptyGone: boolean
  onActivate?: () => void
  onClosedActivate?: () => void
  terminalTheme: ITheme | null
  contextMenu?: ReactNode
}): React.JSX.Element {
  return (
    <div
      data-preview-terminal-frame="true"
      className={cn(
        'relative h-[calc(100vh-140px)] w-full overflow-hidden bg-background p-1.5',
        className
      )}
      style={terminalTheme?.background ? { backgroundColor: terminalTheme.background } : undefined}
      onPointerDownCapture={() => {
        if (ptyGone) {
          return
        }
        onActivate?.()
        terminalRef.current?.focus()
      }}
    >
      {ptyGone ? (
        <button
          type="button"
          className="absolute inset-0 flex items-center justify-center px-2.5 py-8 text-center text-[11px] text-muted-foreground transition-colors hover:bg-accent/35 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none"
          onClick={onClosedActivate}
        >
          {translate(
            'dashboardPopout.terminal.closed',
            'No live terminal — click to restore this workspace.'
          )}
        </button>
      ) : null}
      <div
        aria-hidden={ptyGone || undefined}
        className={cn(
          'flex h-full min-w-0 w-full items-end overflow-hidden [contain:paint]',
          ptyGone && 'invisible'
        )}
      >
        <div ref={containerRef} className="max-w-full origin-bottom-left" />
      </div>
      {contextMenu}
    </div>
  )
}
