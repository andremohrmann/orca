import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { useTranslate } from '@/i18n/use-translate'
import { Label } from '../ui/label'
import { SearchableSetting } from '../settings/section-layout/SearchableSetting'
import {
  NumberField,
  SettingsRow,
  SettingsSegmentedControl,
  SettingsSwitchRow
} from '../settings/form-controls/SettingsFormControls'
import { Switch } from '@/components/ui/switch'
import { getExperimentalSearchEntry } from '../settings/advanced/experimental-search'
import { canOpenAgentDashboardPopout } from './agent-dashboard-open-mode'
import {
  normalizeAgentDashboardLiveLayout,
  type AgentDashboardLiveLayout
} from '../../../../shared/agent-dashboard-live-layout'
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
  const t = useTranslate()
  const enabled = settings.experimentalAgentDashboardPopout === true
  const mode = settings.experimentalAgentDashboardMode ?? 'in-window'
  const defaultView = normalizeAgentDashboardView(settings.experimentalAgentDashboardDefaultView)
  const openLiveOnStartup = settings.experimentalAgentDashboardOpenLiveOnStartup === true
  const liveLayout = normalizeAgentDashboardLiveLayout(
    settings.experimentalAgentDashboardLiveLayout
  )
  const updateLiveLayout = (updates: Partial<AgentDashboardLiveLayout>): void => {
    updateSettings({
      experimentalAgentDashboardLiveLayout: normalizeAgentDashboardLiveLayout({
        ...liveLayout,
        ...updates
      })
    })
  }

  return (
    <SearchableSetting
      title={t('auto.components.settings.ExperimentalPane.agentDashboard.title', 'Agent Dashboard')}
      description={t(
        'auto.components.settings.ExperimentalPane.agentDashboard.description',
        'Kanban board for monitoring agents across worktrees, in-window or as a pop-out.'
      )}
      keywords={getExperimentalSearchEntry(t).agentDashboard.keywords}
      className="space-y-3 py-3"
      id="experimental-agent-dashboard"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 shrink space-y-0.5">
          <Label>
            {t('auto.components.settings.ExperimentalPane.agentDashboard.title', 'Agent Dashboard')}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t(
              'auto.components.settings.ExperimentalPane.agentDashboard.copy',
              'Adds an Agent Dashboard entry to the left sidebar. Monitor agents that need you, are working, or are done, with optional idle agents.'
            )}
          </p>
        </div>
        <Switch
          checked={enabled}
          aria-label={t(
            'auto.components.settings.ExperimentalPane.agentDashboard.toggleLabel',
            'Toggle Agent Dashboard'
          )}
          onCheckedChange={() => updateSettings({ experimentalAgentDashboardPopout: !enabled })}
        />
      </div>
      {enabled && canOpenAgentDashboardPopout() ? (
        <div className="ml-4 space-y-3 border-l border-border pl-4">
          <SettingsRow
            label={t(
              'auto.components.settings.ExperimentalPane.agentDashboard.modeLabel',
              'Open as'
            )}
            description={t(
              'auto.components.settings.ExperimentalPane.agentDashboard.modeCopy',
              'Show the dashboard as an in-window board beside the sidebar or a separate pop-out window.'
            )}
            control={
              <SettingsSegmentedControl
                value={mode}
                onChange={(next) => updateSettings({ experimentalAgentDashboardMode: next })}
                ariaLabel={t(
                  'auto.components.settings.ExperimentalPane.agentDashboard.modeAriaLabel',
                  'Agent Dashboard open mode'
                )}
                size="sm"
                options={[
                  {
                    value: 'in-window',
                    label: t(
                      'auto.components.settings.ExperimentalPane.agentDashboard.modeInWindow',
                      'In-window'
                    )
                  },
                  {
                    value: 'popout',
                    label: t(
                      'auto.components.settings.ExperimentalPane.agentDashboard.modePopout',
                      'Pop-out'
                    )
                  }
                ]}
              />
            }
          />
          <SettingsRow
            label={t(
              'auto.components.settings.ExperimentalPane.agentDashboard.defaultViewLabel',
              'Default view'
            )}
            description={t(
              'auto.components.settings.ExperimentalPane.agentDashboard.defaultViewCopy',
              'Choose which Agent Dashboard view opens when you use the sidebar entry.'
            )}
            control={
              <SettingsSegmentedControl<AgentDashboardView>
                value={defaultView}
                onChange={(next) => updateSettings({ experimentalAgentDashboardDefaultView: next })}
                ariaLabel={t(
                  'auto.components.settings.ExperimentalPane.agentDashboard.defaultViewAriaLabel',
                  'Default Agent Dashboard view'
                )}
                size="sm"
                options={[
                  {
                    value: 'board',
                    label: t('dashboardPopout.view.board', 'Dashboard')
                  },
                  {
                    value: 'live',
                    label: t('dashboardPopout.view.live', 'Live view')
                  }
                ]}
              />
            }
          />
          <SettingsSwitchRow
            label={t(
              'auto.components.settings.ExperimentalPane.agentDashboard.openLiveOnStartupLabel',
              'Open Live view on startup'
            )}
            description={t(
              'auto.components.settings.ExperimentalPane.agentDashboard.openLiveOnStartupCopy',
              'Open the Agent Dashboard directly to Live view when Orca starts.'
            )}
            checked={openLiveOnStartup}
            onChange={() =>
              updateSettings({
                experimentalAgentDashboardOpenLiveOnStartup: !openLiveOnStartup
              })
            }
            ariaLabel={t(
              'auto.components.settings.ExperimentalPane.agentDashboard.openLiveOnStartupLabel',
              'Open Live view on startup'
            )}
          />
          <SettingsSwitchRow
            label={t('dashboardPopout.live.hideChildAgents', 'Hide child-agent terminals')}
            description={t(
              'dashboardPopout.live.hideChildAgentsDescription',
              'Hide terminals of agents spawned by another agent from Live view. The agents keep running.'
            )}
            checked={liveLayout.hideChildAgents === true}
            onChange={() => updateLiveLayout({ hideChildAgents: !liveLayout.hideChildAgents })}
            ariaLabel={t('dashboardPopout.live.hideChildAgents', 'Hide child-agent terminals')}
          />
          <NumberField
            label={t(
              'auto.components.settings.ExperimentalPane.agentDashboard.autoMinimizeLiveAfterLabel',
              'Auto-minimize inactive Live windows'
            )}
            description={t(
              'auto.components.settings.ExperimentalPane.agentDashboard.autoMinimizeLiveAfterCopy',
              'Minimize Live view windows after this many minutes without agent activity. Use 0 to keep every window visible.'
            )}
            value={liveLayout.autoMinimizeAfterMinutes ?? 0}
            defaultValue={0}
            min={0}
            max={1440}
            step={1}
            suffix={t(
              'auto.components.settings.ExperimentalPane.agentDashboard.autoMinimizeLiveAfterSuffix',
              'min'
            )}
            onChange={(autoMinimizeAfterMinutes) => updateLiveLayout({ autoMinimizeAfterMinutes })}
          />
        </div>
      ) : null}
    </SearchableSetting>
  )
}
