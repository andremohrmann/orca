import { PLUGIN_DASHBOARD_API } from './plugin-host-api-dashboard'
import { PLUGIN_AGENT_PRESENTATION_API } from './plugin-host-api-agent-presentation'

export const PLUGIN_PERSONAL_DASHBOARD_API = {
  ...PLUGIN_DASHBOARD_API,
  ...PLUGIN_AGENT_PRESENTATION_API
}
