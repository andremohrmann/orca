import type { agentHookServer } from '../../agent-hooks/server/agent-hook-server'
import type { Store } from '../../persistence/loading-store/store'
import type { PluginService } from '../plugin-service'
import type { PluginRuntimeDelegate } from '../workers/host-api/plugin-host-service-bindings'
import { projectPluginAgentStatusChangedPayload } from '../events/plugin-agent-status-event'
import {
  createPluginAgentStatusForwarder,
  watchPluginWorkspaceContext
} from './plugin-runtime-binding'

export function installPluginRuntimeObservers(
  service: PluginService,
  delegate: PluginRuntimeDelegate,
  store: Store,
  hooks: Pick<typeof agentHookServer, 'subscribeEnrichedStatus'>
): void {
  const forward = createPluginAgentStatusForwarder(delegate, service)
  hooks.subscribeEnrichedStatus((enriched) => {
    const payload = projectPluginAgentStatusChangedPayload(enriched, store)
    if (payload) {
      forward(payload, enriched.terminalHandle)
    }
  })
  watchPluginWorkspaceContext({
    delegate,
    events: service,
    onSessionWritten: (listener) => store.onWorkspaceSessionWritten(listener),
    onStateWritten: (listener) => store.onStateWritten(listener),
    onUIChanged: (listener) => store.onUIChanged(listener)
  })
}
