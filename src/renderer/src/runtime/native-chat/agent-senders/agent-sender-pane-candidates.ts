import type { HostPart } from './agent-sender-host-part'
import type { LocatedAgentSender } from './agent-sender-index'

function agentSenderPaneCandidates(
  parts: ReadonlyMap<string, HostPart>,
  host: string,
  worktreeId: string,
  paneKey: string
): [string, string][] {
  const part = parts.get(host)
  const pane = JSON.stringify([worktreeId, paneKey])
  const candidates: [string, string][] = (part?.panes.get(pane) ?? []).map((id) => [host, id])
  for (const [principal, identity] of part?.attachedPanes.get(pane) ?? []) {
    for (const [home, homePart] of parts) {
      if (homePart.principals.has(principal)) {
        candidates.push([home, identity])
      }
    }
  }
  return candidates
}

export function locateAgentSendersForPane(
  parts: ReadonlyMap<string, HostPart>,
  host: string,
  worktreeId: string,
  paneKey: string,
  resolve: (home: string, identity: string) => LocatedAgentSender | null | undefined
): readonly LocatedAgentSender[] | null {
  const result: LocatedAgentSender[] = []
  for (const [home, identity] of agentSenderPaneCandidates(parts, host, worktreeId, paneKey)) {
    const row = resolve(home, identity)
    if (!row || row.host !== host || row.worktreeId !== worktreeId || row.paneKey !== paneKey) {
      return null
    }
    result.push(row)
  }
  return result
}
