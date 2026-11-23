import { expect, test } from 'vitest'
import { assertExistingAgentActivationTarget } from './existing-agent-tab-activation'

test('existing-agent activation cannot admit a terminal or a replaced session/workspace', () => {
  const expected = { sessionId: 'session-1', worktreeId: 'workspace-1' }
  expect(() =>
    assertExistingAgentActivationTarget(expected, { worktreeId: 'workspace-1' })
  ).toThrow('existing_agent_target_changed')
  expect(() =>
    assertExistingAgentActivationTarget(expected, {
      worktreeId: 'workspace-1',
      sessionId: 'session-2'
    })
  ).toThrow('existing_agent_target_changed')
  expect(() =>
    assertExistingAgentActivationTarget(expected, {
      worktreeId: 'workspace-2',
      sessionId: 'session-1'
    })
  ).toThrow('existing_agent_target_changed')
  expect(() =>
    assertExistingAgentActivationTarget(expected, {
      worktreeId: 'workspace-1',
      sessionId: 'session-1'
    })
  ).not.toThrow()
})
