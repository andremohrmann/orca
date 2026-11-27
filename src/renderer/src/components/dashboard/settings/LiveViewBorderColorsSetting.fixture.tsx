import { useState } from 'react'
import { defineFixture } from '../../../component-fixtures/component-fixture'
import {
  normalizeAgentDashboardLiveBorderColors,
  type AgentDashboardLiveBorderColors
} from '../../../../../shared/agent-dashboard-live-layout'
import { LiveViewBorderColorsSetting } from './LiveViewBorderColorsSetting'
import { SettingsGroup } from '../../settings/section-layout/SettingsGroup'

function Preview({ initial }: { initial?: AgentDashboardLiveBorderColors }): React.JSX.Element {
  const [colors, setColors] = useState(initial)
  return (
    <div className="settings-view-shell p-5">
      <SettingsGroup>
        <div className="py-3">
          <LiveViewBorderColorsSetting
            colors={colors}
            onChange={(next) => setColors(normalizeAgentDashboardLiveBorderColors(next))}
          />
        </div>
      </SettingsGroup>
    </div>
  )
}

export const defaults = defineFixture({ width: 720, render: () => <Preview /> })
export const narrow = defineFixture({ width: 360, render: () => <Preview /> })
export const custom = defineFixture({
  width: 720,
  render: () => (
    <Preview
      initial={{ attention: '#3377cc', working: '#cc88ee', done: '#00aa88', failed: '#dd4488' }}
    />
  )
})
