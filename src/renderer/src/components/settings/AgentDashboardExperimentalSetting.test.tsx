// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import { AgentDashboardExperimentalSetting } from './AgentDashboardExperimentalSetting'
import { getExperimentalSearchEntry } from './experimental-search'
import { matchesSettingsSearch } from './settings-search'

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: { settingsSearchQuery: string }) => unknown) =>
    selector({ settingsSearchQuery: '' })
}))

afterEach(cleanup)

it('saves child-agent visibility without resetting other Live view preferences', () => {
  const updateSettings = vi.fn()
  render(
    <AgentDashboardExperimentalSetting
      settings={{
        ...getDefaultSettings('/tmp'),
        experimentalAgentDashboardPopout: true,
        experimentalAgentDashboardLiveLayout: { density: 'large', autoMinimizeAfterMinutes: 15 }
      }}
      updateSettings={updateSettings}
    />
  )

  const toggle = screen.getByRole('switch', { name: 'Hide child-agent terminals' })
  expect(toggle).toHaveAttribute('aria-checked', 'false')
  fireEvent.click(toggle)
  expect(updateSettings).toHaveBeenCalledWith({
    experimentalAgentDashboardLiveLayout: expect.objectContaining({
      hideChildAgents: true,
      density: 'large',
      autoMinimizeAfterMinutes: 15
    })
  })
  expect(matchesSettingsSearch('child agents', [getExperimentalSearchEntry().agentDashboard])).toBe(
    true
  )
})
