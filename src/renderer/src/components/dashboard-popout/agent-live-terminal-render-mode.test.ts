import { describe, expect, it } from 'vitest'
import type { DashboardCardDotState } from '../../../../shared/dashboard-snapshot'
import { liveTerminalUsesSourceGrid } from './agent-live-terminal-render-mode'

describe('liveTerminalUsesSourceGrid', () => {
  it.each([
    { state: 'working', expected: true },
    { state: 'waiting', expected: true },
    { state: 'blocked', expected: true },
    { state: 'done', expected: false },
    { state: 'idle', expected: false }
  ] satisfies { state: DashboardCardDotState; expected: boolean }[])(
    'returns $expected for $state agents',
    ({ state, expected }) => {
      expect(liveTerminalUsesSourceGrid(state)).toBe(expected)
    }
  )
})
