import { z } from 'zod'
export const TERMINAL_PLUGIN_PREVIEW_CAPABILITY = 'terminal.plugin-preview.v1'
export const terminalPreviewTargetParams = z
  .object({ terminal: z.string().min(1).max(4096) })
  .strict()
export const terminalPreviewTargetSchema = z.object({
  profileKey: z.string().min(1).max(2048),
  contract: z.literal(TERMINAL_PLUGIN_PREVIEW_CAPABILITY),
  terminal: z.string(),
  worktreeId: z.string(),
  incarnationId: z.string(),
  hostPlatform: z.enum([
    'aix',
    'darwin',
    'freebsd',
    'linux',
    'openbsd',
    'sunos',
    'win32',
    'android',
    'haiku',
    'cygwin',
    'netbsd'
  ]),
  input: z.object({
    hostPlatform: z.enum([
      'aix',
      'darwin',
      'freebsd',
      'linux',
      'openbsd',
      'sunos',
      'win32',
      'android',
      'haiku',
      'cygwin',
      'netbsd'
    ]),
    localWindowsConpty: z.boolean(),
    osRelease: z.string().optional(),
    windowsShiftEnterEncoding: z.enum(['alt-enter', 'csi-u']),
    ctrlEnterCsiU: z.boolean(),
    kittyKeyboardAdvertised: z.boolean(),
    forceBracketedMultilineTextPaste: z.literal(true).optional(),
    windowsInputRecordPasteNewline: z.enum(['alt-enter', 'csi-u']).optional()
  })
})
export type TerminalPluginPreviewTarget = z.infer<typeof terminalPreviewTargetSchema>
