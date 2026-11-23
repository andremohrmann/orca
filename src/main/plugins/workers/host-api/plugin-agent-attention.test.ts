import { expect, test } from 'vitest'
import { projectPluginAgentAttention } from './plugin-agent-attention'

test('acknowledgement applies only to the same canonical turn and session boundaries retain displaced-turn identity', () => {
  const snapshot = { acknowledgedTurnStartedAt: { pane: 1000 }, observedAt: 4000 }
  const sameTurn = { state: 'working', stateStartedAt: 1000, sessionBoundary: false }
  expect(projectPluginAgentAttention('pane', sameTurn, snapshot)).toEqual({
    unread: false,
    unseen: false,
    acknowledged: true,
    basis: 'host-ui-snapshot',
    observedAt: 4000,
    turnStartedAt: 1000,
    acknowledgedTurnStartedAt: 1000
  })
  expect(
    projectPluginAgentAttention('pane', { ...sameTurn, stateStartedAt: 2000 }, snapshot).unseen
  ).toBe(true)
  expect(
    projectPluginAgentAttention('pane', sameTurn, {
      ...snapshot,
      acknowledgedTurnStartedAt: { pane: 999 }
    }).acknowledged
  ).toBe(false)
  expect(
    projectPluginAgentAttention(
      'pane',
      {
        state: 'done',
        stateStartedAt: 3000,
        sessionBoundary: true,
        stateHistory: [{ startedAt: 1000 }]
      },
      snapshot
    ).unseen
  ).toBe(false)
  expect(
    projectPluginAgentAttention(
      'pane',
      { state: 'done', stateStartedAt: 3000, sessionBoundary: true },
      snapshot
    ).acknowledged
  ).toBeNull()
  expect(projectPluginAgentAttention('pane', sameTurn, null).unseen).toBeNull()
})
