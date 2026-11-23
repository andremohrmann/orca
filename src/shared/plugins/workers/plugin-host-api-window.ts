import { z } from 'zod'
import { ALL_SURFACES, spec } from './plugin-host-method-spec'
import { pluginIdSchema } from '../manifest/plugin-manifest-fields'

export const pluginWindowBoundsSchema = z.strictObject({
  x: z.number().int().min(-100_000).max(100_000),
  y: z.number().int().min(-100_000).max(100_000),
  width: z.number().int().min(480).max(7680),
  height: z.number().int().min(360).max(4320)
})
export const pluginWindowPresentationSchema = z.enum(['panel', 'popout'])
export const pluginWindowStateSchema = z.object({
  open: z.boolean(),
  opacity: z.number().min(0.2).max(1),
  opacitySupported: z.boolean(),
  bounds: pluginWindowBoundsSchema.nullable(),
  startup: pluginWindowPresentationSchema.nullable()
})
const panelParams = z.strictObject({ panelId: pluginIdSchema })
const common = {
  since: 11,
  customBuild: 'andre-dashboard-v1',
  scope: 'desktop',
  capability: 'window:own',
  surfaces: ALL_SURFACES
} as const
const changed = z.object({ status: z.enum(['applied', 'cancelled', 'consent-unavailable']) })

export const PLUGIN_WINDOW_API = {
  'window.read': spec({
    ...common,
    mutation: false,
    summary:
      'Reads this plugin panel’s native popout and host-owned startup preference. Desktop only; Linux opacity is unsupported.',
    params: panelParams,
    result: pluginWindowStateSchema
  }),
  'window.open': spec({
    ...common,
    mutation: true,
    summary:
      'After host confirmation, opens this plugin’s declared panel in Orca or a sandboxed native popout without activating Orca. A popout is revealed when Orca is active; background launches remain hidden. Reuses one popout per panel.',
    params: panelParams.extend({
      presentation: pluginWindowPresentationSchema,
      bounds: pluginWindowBoundsSchema.optional()
    }),
    result: changed
  }),
  'window.close': spec({
    ...common,
    mutation: true,
    summary:
      'Closes only this plugin panel’s native popout; does not change its startup preference or sidebar.',
    params: panelParams,
    result: z.object({ closed: z.boolean() })
  }),
  'window.setOpacity': spec({
    ...common,
    mutation: true,
    summary:
      'After host confirmation, sets this plugin’s open popout opacity (0.2–1). Unsupported on Linux. Never changes Orca’s main window.',
    params: panelParams.extend({ opacity: z.number().finite().min(0.2).max(1) }),
    result: changed
  }),
  'window.setStartup': spec({
    ...common,
    mutation: true,
    summary:
      'After host confirmation, remembers a panel or popout presentation for next desktop startup; null disables it. Bound to this approved install revision; hidden/background startup stays hidden.',
    params: panelParams.extend({ presentation: pluginWindowPresentationSchema.nullable() }),
    result: changed
  })
}
