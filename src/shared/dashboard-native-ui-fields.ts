import * as z from 'zod'

export function dashboardNativeUiFields() {
  return { dashboardPopoutMaximized: z.boolean().optional() }
}
