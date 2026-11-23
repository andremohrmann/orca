import { expect, test } from 'vitest'
import {
  pluginDashboardAgentRowSchema,
  projectPluginAgentSummary
} from './plugin-agent-summary-projection'

test('missing host verdicts stay unknown and explicit canonical children suppress legacy children', () => {
  const row = pluginDashboardAgentRowSchema.parse({
    orcaSessionId: 'orca-conversation-1',
    address: 'term_unproven',
    paneKey: 'tab:73b07815-0f2c-45e9-8207-f4aec4d49709',
    parentPaneKey: null,
    state: 'done',
    stateStartedAt: 1000,
    updatedAt: 1000,
    agentType: 'codex',
    displayName: null,
    prompt: '',
    lastAssistantMessage: null,
    children: [],
    subagents: [{ id: 'legacy-child', state: 'working', startedAt: 1000 }]
  })
  const summary = projectPluginAgentSummary(row)
  expect(summary.terminalId).toBeNull()
  expect(summary.mainAgent).toBeNull()
  expect(summary.turnEndedAt).toBeNull()
  expect(summary.turnEndDisposition).toBeNull()
  expect(summary.attention).toEqual({
    status: null,
    unread: null,
    unseen: null,
    acknowledged: null,
    basis: 'unknown',
    observedAt: null,
    turnStartedAt: null,
    acknowledgedTurnStartedAt: null
  })
  expect(summary.freshness).toBe('unknown')
  expect(summary.children).toEqual([])
  expect(summary.childCount).toBe(0)
  expect(summary.childrenTruncated).toBe(false)
})
