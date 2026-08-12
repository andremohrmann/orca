import type { GlobalSettings } from '../../../../shared/types'
import { translate } from '@/i18n/i18n'
import { Label } from '../ui/label'
import { SearchableSetting } from './SearchableSetting'
import {
  SettingsRow,
  SettingsSegmentedControl,
  SettingsSwitch,
  SettingsSwitchRow
} from './SettingsFormControls'
import { getExperimentalSearchEntry } from './experimental-search'
import {
  normalizeAgentDashboardView,
  type AgentDashboardView
} from '../../../../shared/agent-dashboard-view'

type AgentDashboardExperimentalSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}

export function AgentDashboardExperimentalSetting({
  settings,
  updateSettings
}: AgentDashboardExperimentalSettingProps): React.JSX.Element {
  const enabled = settings.experimentalAgentDashboardPopout === true
  const mode = settings.experimentalAgentDashboardMode ?? 'in-window'
  const defaultView = normalizeAgentDashboardView(settings.experimentalAgentDashboardDefaultView)
  const openLiveOnStartup = settings.experimentalAgentDashboardOpenLiveOnStartup === true

  return (
    <SearchableSetting
      title={translate(
        'auto.components.settings.ExperimentalPane.agentDashboard.title',
        'Agent Dashboard'
      )}
      description={translate(
        'auto.components.settings.ExperimentalPane.agentDashboard.description',
        'Kanban board for monitoring agents across worktrees, in-window or as a pop-out.'
      )}
      keywords={getExperimentalSearchEntry().agentDashboard.keywords}
      className="space-y-3 py-2"
      id="experimental-agent-dashboard"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 shrink space-y-0.5">
          <Label>
            {translate(
              'auto.components.settings.ExperimentalPane.agentDashboard.title',
              'Agent Dashboard'
            )}
          </Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'auto.components.settings.ExperimentalPane.agentDashboard.copy',
              'Adds an Agent Dashboard entry to the left sidebar. Monitor agents that need you, are working, or are done, with optional idle agents.'
            )}
          </p>
        </div>
        <SettingsSwitch
          checked={enabled}
          ariaLabel={translate(
            'auto.components.settings.ExperimentalPane.agentDashboard.toggleLabel',
            'Toggle Agent Dashboard'
          )}
          onChange={() => updateSettings({ experimentalAgentDashboardPopout: !enabled })}
        />
      </div>
      {enabled ? (
        <div className="ml-4 space-y-3 border-l border-border pl-4">
          <SettingsRow
            label={translate(
              'auto.components.settings.ExperimentalPane.agentDashboard.modeLabel',
              'Open as'
            )}
            description={translate(
              'auto.components.settings.ExperimentalPane.agentDashboard.modeCopy',
              'Show the dashboard as an in-window board beside the sidebar or a separate pop-out window.'
            )}
            control={
              <SettingsSegmentedControl
                value={mode}
                onChange={(next) => updateSettings({ experimentalAgentDashboardMode: next })}
                ariaLabel={translate(
                  'auto.components.settings.ExperimentalPane.agentDashboard.modeAriaLabel',
                  'Agent Dashboard open mode'
                )}
                size="sm"
                options={[
                  {
                    value: 'in-window',
                    label: translate(
                      'auto.components.settings.ExperimentalPane.agentDashboard.modeInWindow',
                      'In-window'
                    )
                  },
                  {
                    value: 'popout',
                    label: translate(
                      'auto.components.settings.ExperimentalPane.agentDashboard.modePopout',
                      'Pop-out'
                    )
                  }
                ]}
              />
            }
          />
          <SettingsRow
            label={translate(
              'auto.components.settings.ExperimentalPane.agentDashboard.defaultViewLabel',
              'Default view'
            )}
            description={translate(
              'auto.components.settings.ExperimentalPane.agentDashboard.defaultViewCopy',
              'Choose which Agent Dashboard view opens when you use the sidebar entry.'
            )}
            control={
              <SettingsSegmentedControl<AgentDashboardView>
                value={defaultView}
                onChange={(next) => updateSettings({ experimentalAgentDashboardDefaultView: next })}
                ariaLabel={translate(
                  'auto.components.settings.ExperimentalPane.agentDashboard.defaultViewAriaLabel',
                  'Default Agent Dashboard view'
                )}
                size="sm"
                options={[
                  {
                    value: 'board',
                    label: translate('dashboardPopout.view.board', 'Dashboard')
                  },
                  {
                    value: 'live',
                    label: translate('dashboardPopout.view.live', 'Live view')
                  },
                  {
                    value: 'map',
                    label: translate('dashboardPopout.view.map', 'Agent Map')
                  }
                ]}
              />
            }
          />
          <SettingsSwitchRow
            label={translate(
              'auto.components.settings.ExperimentalPane.agentDashboard.openLiveOnStartupLabel',
              'Open Live view on startup'
            )}
            description={translate(
              'auto.components.settings.ExperimentalPane.agentDashboard.openLiveOnStartupCopy',
              'Open the Agent Dashboard directly to Live view when Orca starts.'
            )}
            checked={openLiveOnStartup}
            onChange={() =>
              updateSettings({
                experimentalAgentDashboardOpenLiveOnStartup: !openLiveOnStartup
              })
            }
            ariaLabel={translate(
              'auto.components.settings.ExperimentalPane.agentDashboard.openLiveOnStartupLabel',
              'Open Live view on startup'
            )}
          />
        </div>
      ) : null}
    </SearchableSetting>
  )
}
