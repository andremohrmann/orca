import { describe, expect, it } from 'vitest'
import { UiUpdate, UiUpdateFields } from './rpc-contract/client-ui/client-ui-params'

describe('dashboard native UI persistence contract', () => {
  it('retains maximized state through the assembled lazy schema without accepting unknown fields', () => {
    const saved = { windowMaximized: false, dashboardPopoutMaximized: true }
    expect(UiUpdate.parse(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
    expect(UiUpdateFields.safeParse({ dashboardPopoutMaximized: 'true' }).success).toBe(false)
    expect(UiUpdate.safeParse({ unknownDashboardField: true }).success).toBe(false)
  })
})
