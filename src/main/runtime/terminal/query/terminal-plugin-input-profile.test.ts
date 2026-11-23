import { expect, it } from 'vitest'
import { buildPluginTerminalPreviewTarget } from './terminal-plugin-input-profile'

const pty: Parameters<typeof buildPluginTerminalPreviewTarget>[1] = {
  connected: true,
  incarnationId: 'incarnation',
  worktreeId: 'workspace',
  connectionId: 'ssh-target',
  isWsl: false,
  foregroundAgent: null,
  launchAgent: null
}
it('uses the PTY owner platform for SSH paste policy instead of the descriptor process OS', () => {
  const linux = buildPluginTerminalPreviewTarget('stable', pty, { hostPlatform: 'linux' })!
  expect(linux.input).toEqual({
    hostPlatform: 'linux',
    localWindowsConpty: false,
    windowsShiftEnterEncoding: 'alt-enter',
    ctrlEnterCsiU: false,
    kittyKeyboardAdvertised: true
  })
  const windows = buildPluginTerminalPreviewTarget('stable', pty, { hostPlatform: 'win32' })!
  expect(windows.input).toEqual({
    hostPlatform: 'win32',
    localWindowsConpty: false,
    windowsShiftEnterEncoding: 'alt-enter',
    ctrlEnterCsiU: false,
    kittyKeyboardAdvertised: true,
    forceBracketedMultilineTextPaste: true
  })
  expect(buildPluginTerminalPreviewTarget('stable', pty, {})).toBeNull()
})
it('changes the immutable keyboard profile key when verified native ConPTY agent policy changes', () => {
  const native = { ...pty, connectionId: null }
  const shell = buildPluginTerminalPreviewTarget('stable', native, { hostPlatform: 'win32' })!
  const grok = buildPluginTerminalPreviewTarget(
    'stable',
    { ...native, foregroundAgent: 'grok' },
    { hostPlatform: 'win32' }
  )!
  expect(shell.input.localWindowsConpty).toBe(true)
  expect(shell.input.kittyKeyboardAdvertised).toBe(false)
  expect(grok.input.kittyKeyboardAdvertised).toBe(true)
  expect(grok.profileKey).not.toBe(shell.profileKey)
})
