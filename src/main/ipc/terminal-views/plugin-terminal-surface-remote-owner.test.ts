import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseRemoteRuntimePtyId } from '../../../shared/remote-runtime/remote-runtime-pty-id'
import {
  advanceRuntimeEnvironmentCapabilityIncarnation,
  resetRuntimeEnvironmentCapabilityEvidence
} from '../runtime-environments/connections/runtime-environment-capability-evidence'
import { resolvePluginRemoteTerminalOwner } from './plugin-terminal-surface-remote-owner'
const state = vi.hoisted(() => ({
  capabilities: ['terminal.plugin-preview.v1'],
  owner: 'owner',
  wrongTarget: false,
  changed: false
}))
vi.mock('../../../shared/remote-runtime/host-store/runtime-environment-store', () => ({
  listEnvironments: async () => [
    { id: 'environment', name: 'friendly', runtimeId: 'owner', pairingRevision: 7, createdAt: 1 }
  ],
  resolveEnvironment: async () => ({
    id: 'environment',
    runtimeId: 'owner',
    pairingRevision: 7,
    createdAt: 1
  })
}))
vi.mock('../runtime-environments/requests/runtime-environment-transport-routing', () => ({
  callRuntimeEnvironment: async (_path: string, _selector: string, method: string) => {
    if (method === 'status.get') {
      return {
        ok: true,
        _meta: { runtimeId: state.owner },
        result: { runtimeId: 'owner', capabilities: state.capabilities }
      }
    }
    if (!state.capabilities.includes('terminal.plugin-preview.v1')) {
      throw new Error('unnegotiated endpoint reached')
    }
    if (state.changed) {
      advanceRuntimeEnvironmentCapabilityIncarnation('environment')
    }
    return {
      ok: true,
      _meta: { runtimeId: state.owner },
      result: {
        contract: 'terminal.plugin-preview.v1',
        profileKey: 'profile-v1',
        terminal: state.wrongTarget ? 'other' : 'stable',
        worktreeId: 'workspace',
        incarnationId: 'incarnation',
        hostPlatform: 'linux',
        input: {
          hostPlatform: 'linux',
          localWindowsConpty: false,
          windowsShiftEnterEncoding: 'alt-enter',
          ctrlEnterCsiU: false,
          kittyKeyboardAdvertised: true
        }
      }
    }
  }
}))
vi.mock('../runtime-environments/requests/runtime-environment-subscription-routing', () => ({
  subscribeRuntimeEnvironment: async () => {
    throw new Error('not opened by identity resolution')
  }
}))
beforeEach(() => {
  resetRuntimeEnvironmentCapabilityEvidence()
  Object.assign(state, {
    capabilities: ['terminal.plugin-preview.v1'],
    owner: 'owner',
    wrongTarget: false,
    changed: false
  })
})

describe('paired terminal owner admission', () => {
  it('uses exact public environment IDs and never interprets labels, runtime UUIDs or endpoints as routes', async () => {
    const owner = await resolvePluginRemoteTerminalOwner(
      '/profile',
      'runtime:environment',
      'stable'
    )
    expect(parseRemoteRuntimePtyId(owner!.target.ptyId)).toEqual({
      environmentId: 'environment',
      handle: 'stable'
    })
    for (const host of [
      'owner',
      'runtime:friendly',
      'runtime:wss://endpoint',
      'local',
      'ssh:environment'
    ]) {
      expect(await resolvePluginRemoteTerminalOwner('/profile', host, 'stable')).toBeNull()
    }
  })
  it('refuses older owners before invoking the new endpoint and fences contradictory owner/terminal identities', async () => {
    state.capabilities = []
    expect(
      await resolvePluginRemoteTerminalOwner('/profile', 'runtime:environment', 'stable')
    ).toBeNull()
    state.capabilities = ['terminal.plugin-preview.v1']
    state.owner = 'another-owner'
    expect(
      await resolvePluginRemoteTerminalOwner('/profile', 'runtime:environment', 'stable')
    ).toBeNull()
    state.owner = 'owner'
    state.wrongTarget = true
    expect(
      await resolvePluginRemoteTerminalOwner('/profile', 'runtime:environment', 'stable')
    ).toBeNull()
  })
  it('refuses a re-pair during resolution and retires already admitted owners on the real incarnation event', async () => {
    state.changed = true
    expect(
      await resolvePluginRemoteTerminalOwner('/profile', 'runtime:environment', 'stable')
    ).toBeNull()
    state.changed = false
    const owner = (await resolvePluginRemoteTerminalOwner(
      '/profile',
      'runtime:environment',
      'stable'
    ))!
    let active = true
    const off = owner.observe(() => {
      active = false
    })
    expect(owner.current()).toBe(true)
    advanceRuntimeEnvironmentCapabilityIncarnation('environment')
    expect(owner.current()).toBe(false)
    expect(active).toBe(false)
    off()
  })
})
