import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { Terminal } from '@xterm/xterm'
import { readBufferText } from '@/lib/agent-session/context/terminal-context-text'

export function usePreviewTerminalTextMode(
  enabled: boolean,
  terminalRef: RefObject<Terminal | null>,
  reclaimGridRef: RefObject<() => void>
) {
  const frameRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLPreElement>(null)
  const interactiveRef = useRef(!enabled)
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState('')

  useEffect(() => {
    const syncFocus = (): void => {
      const next = document.hasFocus() && !!frameRef.current?.contains(document.activeElement)
      interactiveRef.current = !enabled || next
      setFocused(next)
    }
    window.addEventListener('focus', syncFocus)
    window.addEventListener('blur', syncFocus)
    document.addEventListener('focusin', syncFocus)
    document.addEventListener('focusout', syncFocus)
    syncFocus()
    return () => {
      window.removeEventListener('focus', syncFocus)
      window.removeEventListener('blur', syncFocus)
      document.removeEventListener('focusin', syncFocus)
      document.removeEventListener('focusout', syncFocus)
    }
  }, [enabled])

  useLayoutEffect(() => {
    if (enabled && focused) {
      reclaimGridRef.current()
      terminalRef.current?.focus()
    }
  }, [enabled, focused, reclaimGridRef, terminalRef])

  useLayoutEffect(() => {
    if (textRef.current) {
      textRef.current.scrollTop = textRef.current.scrollHeight
    }
  }, [text, focused])

  const refreshText = useCallback(
    (afterParsed?: () => void) => {
      const terminal = terminalRef.current
      if (enabled && terminal) {
        const buffer = terminal.buffer.active
        setText(readBufferText(buffer, buffer.baseY, terminal.cols))
      }
      afterParsed?.()
    },
    [enabled, terminalRef]
  )

  return { frameRef, textRef, interactiveRef, focused, text, refreshText }
}
