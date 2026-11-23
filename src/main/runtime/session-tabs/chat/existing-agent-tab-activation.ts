export function assertExistingAgentActivationTarget(
  expected: { sessionId: string; worktreeId?: string } | undefined,
  actual: { sessionId?: string; worktreeId: string }
): void {
  if (
    expected &&
    (actual.sessionId !== expected.sessionId ||
      (expected.worktreeId !== undefined && actual.worktreeId !== expected.worktreeId))
  ) {
    throw new Error('existing_agent_target_changed')
  }
}
