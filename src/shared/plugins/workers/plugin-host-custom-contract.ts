import { z } from 'zod'
import { ALL_SURFACES, spec } from './plugin-host-method-spec'

export const PLUGIN_CUSTOM_CONTRACT_ID = 'andre-dashboard-v1'
export const PLUGIN_CUSTOM_CONTRACT_VERSION = 1
export const PLUGIN_CUSTOM_CONTRACT = {
  id: PLUGIN_CUSTOM_CONTRACT_ID,
  version: PLUGIN_CUSTOM_CONTRACT_VERSION,
  distribution: 'personal-fork',
  officialRelease: null
} as const

export const PLUGIN_CUSTOM_CONTRACT_API = {
  'host.customContract': spec({
    summary:
      'Identifies this personal host extension and its contract revision; does not assert official Orca release availability. Feature-detect individual methods as well.',
    since: 11,
    customBuild: PLUGIN_CUSTOM_CONTRACT_ID,
    scope: 'desktop',
    capability: null,
    mutation: false,
    surfaces: ALL_SURFACES,
    params: z.strictObject({}).optional(),
    result: z.object({
      id: z.literal(PLUGIN_CUSTOM_CONTRACT_ID),
      version: z.literal(PLUGIN_CUSTOM_CONTRACT_VERSION),
      distribution: z.literal('personal-fork'),
      officialRelease: z.null()
    })
  })
}
