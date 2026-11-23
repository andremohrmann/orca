import { z } from 'zod'
import { parseExecutionHostId } from '../../../shared/execution-host/execution-host'
import {
  listEnvironments,
  resolveEnvironment
} from '../../../shared/remote-runtime/host-store/runtime-environment-store'
import { callRuntimeEnvironment } from '../runtime-environments/requests/runtime-environment-transport-routing'
import { subscribeRuntimeEnvironment } from '../runtime-environments/requests/runtime-environment-subscription-routing'
import {
  getRuntimeEnvironmentCapabilityIncarnation,
  onRuntimeEnvironmentCapabilityIncarnationChanged
} from '../runtime-environments/connections/runtime-environment-capability-evidence'
import { terminalPreviewTargetSchema } from '../../../shared/terminal/stream/terminal-plugin-preview-contract'
import { toRemoteRuntimePtyId } from '../../../shared/remote-runtime/remote-runtime-pty-id'
import { PluginRemoteTerminalStream } from './plugin-remote-terminal-stream'
import type { WebContents } from 'electron'

export async function resolvePluginRemoteTerminalOwner(
  userDataPath: string,
  hostId: string,
  terminalId: string,
  signal?: AbortSignal
) {
  const host = parseExecutionHostId(hostId)
  if (host?.kind !== 'runtime') {
    return null
  }
  const matches = (await listEnvironments(userDataPath)).filter(
    (environment) => environment.id === host.environmentId
  )
  if (signal?.aborted || matches.length !== 1) {
    return null
  }
  const environment = matches[0]!
  const ownerRuntimeId = environment.runtimeId
  if (!ownerRuntimeId) {
    return null
  }
  const revision = environment.pairingRevision ?? environment.createdAt
  const epoch = getRuntimeEnvironmentCapabilityIncarnation(environment.id)
  const current = (): boolean =>
    getRuntimeEnvironmentCapabilityIncarnation(environment.id) === epoch
  const status = await callRuntimeEnvironment(
    userDataPath,
    environment.id,
    'status.get',
    {},
    15000,
    revision,
    undefined,
    { signal }
  )
  const capability = z
    .object({ runtimeId: z.literal(ownerRuntimeId), capabilities: z.array(z.string()) })
    .safeParse(status.ok ? status.result : null)
  if (
    !status.ok ||
    status._meta.runtimeId !== ownerRuntimeId ||
    !current() ||
    !capability.success ||
    !capability.data.capabilities.includes('terminal.plugin-preview.v1')
  ) {
    return null
  }
  const response = await callRuntimeEnvironment(
    userDataPath,
    environment.id,
    'terminal.previewTarget',
    { terminal: terminalId },
    15000,
    revision,
    undefined,
    { expectedEnvironmentRuntimeId: ownerRuntimeId, signal }
  )
  if (!response.ok || response._meta.runtimeId !== ownerRuntimeId || !current()) {
    return null
  }
  const parsed = terminalPreviewTargetSchema.safeParse(response.result)
  if (!parsed.success || parsed.data.terminal !== terminalId) {
    return null
  }
  const descriptor = parsed.data
  return {
    target: {
      ptyId: toRemoteRuntimePtyId(terminalId, environment.id),
      worktreeId: descriptor.worktreeId,
      paneKey: '',
      hostPlatform: descriptor.hostPlatform,
      launchAgent: null,
      input: descriptor.input
    },
    current,
    observe: (retire: () => void) =>
      onRuntimeEnvironmentCapabilityIncarnationChanged((id) => {
        if (id === environment.id) {
          retire()
        }
      }),
    create: (
      id: string,
      contents: WebContents,
      permitted: (interactive?: boolean) => boolean,
      retired: (reason?: 'profile_changed') => void
    ) =>
      new PluginRemoteTerminalStream({
        id,
        contents,
        runtimeId: ownerRuntimeId,
        target: descriptor,
        current: (interactive) => current() && permitted(interactive),
        retired,
        open: async (callbacks, signal) => {
          const now = await resolveEnvironment(userDataPath, environment.id)
          if (
            !current() ||
            now.runtimeId !== ownerRuntimeId ||
            (now.pairingRevision ?? now.createdAt) !== revision ||
            !permitted()
          ) {
            throw new Error('runtime_environment_changed')
          }
          const refreshed = await callRuntimeEnvironment(
            userDataPath,
            environment.id,
            'terminal.previewTarget',
            { terminal: terminalId },
            15000,
            revision,
            undefined,
            { expectedEnvironmentRuntimeId: ownerRuntimeId, signal }
          )
          const profile = terminalPreviewTargetSchema.safeParse(
            refreshed.ok ? refreshed.result : null
          )
          if (
            !refreshed.ok ||
            refreshed._meta.runtimeId !== ownerRuntimeId ||
            !profile.success ||
            profile.data.terminal !== terminalId ||
            profile.data.incarnationId !== descriptor.incarnationId ||
            profile.data.worktreeId !== descriptor.worktreeId ||
            !current() ||
            !permitted()
          ) {
            throw new Error('terminal_handle_stale')
          }
          if (profile.data.profileKey !== descriptor.profileKey) {
            retired('profile_changed')
            throw new Error('terminal_profile_changed')
          }
          descriptor.input = profile.data.input
          const subscription = await subscribeRuntimeEnvironment(
            userDataPath,
            environment.id,
            'terminal.multiplex',
            {},
            15000,
            {
              onEvent: (event) => {
                if (!current() || !permitted()) {
                  retired()
                  return
                }
                if (event.type === 'response') {
                  callbacks.response(event.response)
                } else if (event.type === 'binary') {
                  callbacks.binary(event.bytes)
                } else {
                  callbacks.close()
                }
              },
              onClose: callbacks.close
            },
            () => current() && permitted(),
            signal
          )
          if (!current() || !permitted()) {
            subscription.close()
            throw new Error('runtime_environment_changed')
          }
          return subscription
        }
      })
  }
}
