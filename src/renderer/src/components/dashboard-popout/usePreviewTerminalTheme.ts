import { useMemo } from 'react'
import type { ITheme } from '@xterm/xterm'
import { useShallow } from 'zustand/react/shallow'
import { composeActiveTerminalTheme } from '@/components/terminal-pane/terminal-appearance'
import { useSystemPrefersDark } from '@/components/terminal-pane/use-system-prefers-dark'
import { useEffectiveMacOptionAsAlt } from '@/lib/keyboard-layout/use-effective-mac-option-as-alt'
import { getBuiltinTheme, resolveEffectiveTerminalAppearance } from '@/lib/terminal-theme'
import { useAppStore } from '@/store'

export function usePreviewTerminalTheme(): {
  settings: ReturnType<typeof useAppStore.getState>['settings']
  macOptionAsAlt: ReturnType<typeof useEffectiveMacOptionAsAlt>
  terminalTheme: ReturnType<typeof composeActiveTerminalTheme> | null
  terminalMode: 'dark' | 'light'
} {
  const settings = useAppStore((state) => state.settings)
  const systemPrefersDark = useSystemPrefersDark()
  const macOptionAsAlt = useEffectiveMacOptionAsAlt(settings?.terminalMacOptionAsAlt)
  const { terminalTheme: composedTheme, terminalMode } = useMemo(() => {
    if (!settings) {
      return { terminalTheme: null, terminalMode: 'dark' as const }
    }
    const appearance = resolveEffectiveTerminalAppearance(settings, systemPrefersDark)
    const theme = composeActiveTerminalTheme(
      appearance.theme ?? getBuiltinTheme(appearance.themeName),
      settings
    )
    return { terminalTheme: theme, terminalMode: appearance.mode }
  }, [settings, systemPrefersDark])
  // Settings arrive as cloned snapshots; compare theme values before reconnecting.
  const retainTheme = useShallow((theme: ITheme | null) => theme)
  const terminalTheme = retainTheme(composedTheme)
  return { settings, macOptionAsAlt, terminalTheme, terminalMode }
}
