import { expect, it } from 'vitest'
import { createCanonicalPresentationFixture } from './plugin-agent-presentation.test-fixture'
import { createAgentPresentationReader } from './plugin-agent-presentation-reader'
import { readAgentSendersForPane } from '@/runtime/native-chat/agent-senders/agent-sender-index'

it('projects exact owner-qualified destinations without PTYs and refuses rival claims', () => {
  const { store, workspaceKey } = createCanonicalPresentationFixture(1)
  const paneKey = [...store.getState().agentStatusByPaneKey.keys()][0]!
  const publication = {
    associations: [
      { identity: 'term_exact', paneKey, worktreeId: workspaceKey },
      { identity: 'orca_session_id:exact-session', paneKey, worktreeId: workspaceKey }
    ],
    principals: [],
    attachments: [],
    revision: { epoch: 'publication', revision: 1 }
  }
  store.setState({ agentSenderPublicationsByHost: { local: { '*': publication } } })
  const reader = createAgentPresentationReader()
  const read = () =>
    reader.read(
      {
        params: { projectionVersion: 1, workspaceId: workspaceKey, requestKey: 'destination' },
        worktreeId: workspaceKey,
        hostId: 'local',
        kind: 'worktree',
        ownerEpoch: 'owner',
        selection: null
      },
      store,
      new Map()
    )
  const first = read()
  expect(first.rows[0]?.destinations).toEqual({
    terminal: { terminalId: 'term_exact' },
    chat: { orcaSessionId: 'exact-session' }
  })
  store.setState({
    agentSenderPublicationsByHost: {
      local: { '*': publication },
      'ssh:rival': {
        '*': {
          ...publication,
          associations: [{ identity: 'term_rival', paneKey, worktreeId: workspaceKey }]
        }
      }
    }
  })
  const rival = read()
  expect(rival.rows[0]?.destinations).toEqual({ terminal: null, chat: null })
  expect(rival.version).not.toEqual(first.version)
  store.setState({ agentSenderPublicationsByHost: {} })
  expect(read().rows[0]?.destinations).toEqual({ terminal: null, chat: null })
  const state = store.getState()
  store.setState({
    repos: state.repos.filter((repo) => repo.executionHostId === 'local'),
    worktreesByRepo: Object.fromEntries(
      Object.entries(state.worktreesByRepo).map(([id, rows]) => [
        id,
        rows.filter((row) => row.hostId === 'local')
      ])
    ),
    unifiedTabsByWorktree: {
      [workspaceKey]: state.unifiedTabsByWorktree[workspaceKey]!.map((tab) => ({
        ...tab,
        executionHostId: undefined
      }))
    },
    agentSenderPublicationsByHost: { local: { '*': publication } }
  })
  expect(read().rows[0]?.destinations.chat).toEqual({ orcaSessionId: 'exact-session' })
  store.setState({
    agentSenderPublicationsByHost: {
      local: {
        '*': {
          ...publication,
          associations: [],
          peerFingerprint: 'executing-peer',
          attachments: [
            {
              identity: 'term_attached',
              paneKey,
              worktreeId: workspaceKey,
              homePeerFingerprint: 'home-peer'
            }
          ]
        }
      },
      'runtime:home': {
        '*': {
          ...publication,
          associations: [],
          principals: [{ peerFingerprint: 'executing-peer', homePeerFingerprint: 'home-peer' }]
        }
      }
    }
  })
  expect(
    readAgentSendersForPane(store.getState(), 'local', workspaceKey, paneKey)?.map((sender) => [
      sender.host,
      sender.identity
    ])
  ).toEqual([['local', 'term_attached']])
  expect(readAgentSendersForPane(store.getState(), 'runtime:home', workspaceKey, paneKey)).toEqual(
    []
  )
})
