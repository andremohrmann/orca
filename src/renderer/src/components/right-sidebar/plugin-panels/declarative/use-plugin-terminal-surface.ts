import { useAppStore } from '@/store'
import { collectActiveDashboardWorkspaces } from '@/components/dashboard/snapshot/dashboard-snapshot-workspaces'
import { resolveDashboardCardTerminalInput } from '@/components/dashboard/snapshot/dashboard-card-terminal-input'
import { resolveTerminalSurfaceWhenAvailable } from '../../../../../../shared/plugins/frames/plugin-terminal-surface-admission'
import { useCallback } from 'react'
import type { PluginTerminalSurfaceResolver } from '@/components/plugins/declarative/plugin-declarative-assets'

export function usePluginTerminalSurface(
  sessionToken: string | null
): PluginTerminalSurfaceResolver {
  return useCallback(
    async (terminalId, signal, hostId) => {
      const transport = window.api.terminalPreview.pluginSurface
      if (!sessionToken || !transport || signal.aborted) {
        return null
      }
      const target = await resolveTerminalSurfaceWhenAvailable(
        transport,
        sessionToken,
        terminalId,
        signal,
        hostId
      )
      if (!target) {
        return null
      }
      if (signal.aborted) {
        void transport.dispose(target.id)
        return null
      }
      const state = useAppStore.getState()
      const workspace = collectActiveDashboardWorkspaces(state, false).find(
        (entry) => entry.worktree.id === target.worktreeId
      )
      const platform = window.api.platform.get()
      const terminalInput =
        target.input ??
        resolveDashboardCardTerminalInput(state, {
          ptyId: target.ptyId,
          worktreeId: target.worktreeId,
          paneKey: target.paneKey,
          cwd: workspace?.worktree.path ?? '',
          shellOverride: undefined,
          launchAgent: target.launchAgent,
          hostPlatform: target.hostPlatform,
          clientPlatform: platform.platform,
          userAgent: navigator.userAgent,
          osRelease: platform.osRelease
        })
      if (target.hostPlatform && target.hostPlatform !== 'win32') {
        terminalInput.localWindowsConpty = false
        terminalInput.kittyKeyboardAdvertised = true
      }
      return {
        terminalInput,
        ptyId: target.ptyId,
        dispose: () => {
          void transport.dispose(target.id)
        },
        onRevoked: (callback) =>
          transport.onRevoked((payload) => {
            if (payload.id === target.id) {
              callback(payload.reason)
            }
          }),
        api: {
          releaseFit: () => transport.releaseFit(target.id),
          connect: (_ptyId, opts) => transport.connect(target.id, opts?.scrollbackRows),
          input: (_ptyId, data) => transport.input(target.id, data),
          fit: (_ptyId, cols, rows) => transport.fit(target.id, cols, rows),
          ack: (_ptyId, bytes) => transport.ack(target.id, bytes),
          unsubscribe: () => transport.unsubscribe(target.id),
          onData: (callback) =>
            transport.onData((payload) => {
              if (payload.ptyId === target.id) {
                callback({ ...payload, ptyId: target.ptyId })
              }
            })
        }
      }
    },
    [sessionToken]
  )
}
