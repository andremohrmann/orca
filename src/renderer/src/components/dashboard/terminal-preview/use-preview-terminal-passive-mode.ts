import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { Terminal } from '@xterm/xterm'
import { readBufferText } from '@/lib/agent-session/context/terminal-context-text'

export function usePreviewTerminalPassiveMode(
  passiveText: boolean,
  terminalRef: RefObject<Terminal | null>,
  ptyId: string,
  api?: typeof window.api.terminalPreview
) {
  const frameRef = useRef<HTMLDivElement>(null)
  const reclaimGridRef = useRef<() => void>(() => {})
  const interactiveRef = useRef(!passiveText)
  const [interactive, setInteractive] = useState(!passiveText)
  const textRef = useRef<HTMLPreElement>(null)
  const [text, setText] = useState('')
  useEffect(() => {
    if (!passiveText) {
      return
    }
    const sync = (): void => {
      const next =
        !passiveText ||
        (document.hasFocus() && !!frameRef.current?.contains(document.activeElement))
      if (interactiveRef.current && !next) {
        void api?.releaseFit?.(ptyId)
      }
      interactiveRef.current = next
      setInteractive(next)
      if (next) {
        reclaimGridRef.current()
        terminalRef.current?.focus()
      }
    }
    window.addEventListener('focus', sync)
    window.addEventListener('blur', sync)
    document.addEventListener('focusin', sync)
    document.addEventListener('focusout', sync)
    sync()
    return () => {
      window.removeEventListener('focus', sync)
      window.removeEventListener('blur', sync)
      document.removeEventListener('focusin', sync)
      document.removeEventListener('focusout', sync)
    }
  }, [passiveText, api, ptyId, terminalRef])
  useLayoutEffect(() => {
    if (textRef.current) {
      textRef.current.scrollTop = textRef.current.scrollHeight
    }
  }, [text, interactive])
  useLayoutEffect(() => {
    if (passiveText && interactive) {
      terminalRef.current?.focus()
    }
  }, [passiveText, interactive, terminalRef])
  const refreshText = useCallback((): void => {
    const terminal = terminalRef.current
    if (passiveText && terminal) {
      setText(readBufferText(terminal.buffer.active, terminal.buffer.active.baseY, terminal.cols))
    }
  }, [passiveText, terminalRef])
  return { frameRef, reclaimGridRef, interactiveRef, interactive, textRef, text, refreshText }
}
