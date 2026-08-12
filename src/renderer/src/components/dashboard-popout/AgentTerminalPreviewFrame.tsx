import type { Terminal, ITheme } from '@xterm/xterm'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'

export function AgentTerminalPreviewFrame({
  className,
  containerRef,
  terminalRef,
  ptyGone,
  terminalTheme
}: {
  className?: string
  containerRef: React.RefObject<HTMLDivElement | null>
  terminalRef: React.MutableRefObject<Terminal | null>
  ptyGone: boolean
  terminalTheme: ITheme | null
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'relative h-[calc(100vh-140px)] w-full overflow-hidden bg-background p-1.5',
        className
      )}
      style={terminalTheme?.background ? { backgroundColor: terminalTheme.background } : undefined}
      onPointerDownCapture={() => {
        terminalRef.current?.focus()
      }}
    >
      {ptyGone ? (
        <div className="absolute inset-0 flex items-center justify-center px-2.5 py-8 text-center text-[11px] text-muted-foreground">
          {translate(
            'dashboardPopout.terminal.closed',
            "No live terminal — this agent's pane has closed."
          )}
        </div>
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
    </div>
  )
}
