export function installPreviewGridFocusOwnership(args: {
  enabled: boolean
  reclaim: () => void
  release: () => void
  target?: Window
  isFocused?: () => boolean
}): () => void {
  if (!args.enabled) {
    return () => undefined
  }
  const target = args.target ?? window
  const isFocused = args.isFocused ?? (() => document.hasFocus())
  const onFocus = (): void => args.reclaim()
  const onBlur = (): void => args.release()
  target.addEventListener('focus', onFocus)
  target.addEventListener('blur', onBlur)
  if (!isFocused()) {
    args.release()
  }
  return () => {
    target.removeEventListener('focus', onFocus)
    target.removeEventListener('blur', onBlur)
  }
}
