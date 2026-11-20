import type { Terminal, ITheme } from '@xterm/xterm'
import type { ReactNode } from 'react'
import { cn } from '@/lib/class-names'
import { terminalPreviewUnavailableMessage } from '../dashboard/terminal-preview/terminal-preview-unavailable-message'
import type { usePreviewTerminalTextMode } from './use-preview-terminal-text-mode'

export function AgentTerminalPreviewFrame({
  className,
  containerRef,
  terminalRef,
  ptyId,
  ptyGone,
  onActivate,
  onClosedActivate,
  terminalTheme,
  contextMenu,
  textPreview
}: {
  className?: string
  containerRef: React.RefObject<HTMLDivElement | null>
  terminalRef: React.MutableRefObject<Terminal | null>
  ptyId?: string
  ptyGone: boolean
  onActivate?: () => void
  onClosedActivate?: () => void
  terminalTheme: ITheme | null
  contextMenu?: ReactNode
  textPreview?: ReturnType<typeof usePreviewTerminalTextMode>
}): React.JSX.Element {
  const { frameRef, textRef, focused, text } = textPreview ?? {}
  return (
    <div
      ref={frameRef}
      tabIndex={textPreview ? 0 : undefined}
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
        if (textPreview && !focused) {
          frameRef?.current?.focus({ preventScroll: true })
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
          {terminalPreviewUnavailableMessage({ ptyId })}
        </button>
      ) : null}
      {textPreview && !focused && !ptyGone ? (
        <pre
          ref={textRef}
          className="scrollbar-sleek h-full w-full overflow-auto whitespace-pre-wrap break-words bg-background font-mono text-xs text-foreground"
          style={{
            backgroundColor: terminalTheme?.background,
            color: terminalTheme?.foreground
          }}
        >
          {text}
        </pre>
      ) : null}
      <div
        aria-hidden={ptyGone || (textPreview && !focused) || undefined}
        className={cn(
          'flex h-full min-w-0 w-full items-end overflow-hidden [contain:paint]',
          ptyGone && 'invisible',
          textPreview && !focused && 'invisible absolute inset-1.5 pointer-events-none'
        )}
      >
        <div ref={containerRef} className="max-w-full origin-bottom-left" />
      </div>
      {contextMenu}
    </div>
  )
}
