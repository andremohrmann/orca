import { randomUUID } from 'node:crypto'
import type { WebContents } from 'electron'
import type { OrcaRuntimeService } from '../../runtime/orca-runtime'
import { abortWhenRendererGone } from '../renderer-requests/renderer-lifetime-abort'
import { PluginTerminalSurfaceCapacity } from './plugin-terminal-surface-capacity'
import {
  terminalSurfacePermitted,
  terminalSurfaceUserDataPath,
  observeTerminalSurfaceApproval
} from './plugin-terminal-surface-approval'
import { resolvePluginRemoteTerminalOwner } from './plugin-terminal-surface-remote-owner'
import type { PluginRemoteTerminalStream } from './plugin-remote-terminal-stream'
import type { TerminalPreviewOutputStream } from './terminal-preview-output-stream'
import type { PluginTerminalSurfaceTarget } from '../../../shared/plugins/frames/plugin-terminal-surface'

type RemoteOwner = NonNullable<Awaited<ReturnType<typeof resolvePluginRemoteTerminalOwner>>>
export type PluginTerminalSurfaceLease = {
  id: string
  contents: WebContents
  sessionToken: string
  terminalId: string
  hostId?: string
  ptyId: string
  stream: TerminalPreviewOutputStream | null
  remote: PluginRemoteTerminalStream | null
  owner: RemoteOwner | null
  viewerKey: string | null
  fitEpoch: number
  release: () => void
  profileKey: string | null
  dispose: (reason?: 'profile_changed') => void
}
export class PluginTerminalSurfaceLeases {
  readonly surfaces = new Map<string, PluginTerminalSurfaceLease>()
  private readonly capacity = new PluginTerminalSurfaceCapacity()
  private readonly pendingControllers = new Set<AbortController>()
  dispose(): void {
    for (const controller of this.pendingControllers) {
      controller.abort()
    }
    for (const surface of this.surfaces.values()) {
      surface.dispose()
    }
  }
  private readonly pending = new Map<string, number>()
  constructor(private readonly runtime: OrcaRuntimeService) {}
  current(surface: PluginTerminalSurfaceLease, interactive = false): boolean {
    try {
      if (!terminalSurfacePermitted(surface.contents, surface.sessionToken, interactive)) {
        return false
      }
      if (surface.owner) {
        return surface.owner.current()
      }
      const profile = this.runtime.describePluginTerminalSurface?.(surface.terminalId)
      if ((profile?.profileKey ?? null) !== surface.profileKey) {
        surface.dispose('profile_changed')
        return false
      }
      return (
        this.runtime.resolvePluginTerminalSurface(surface.terminalId, surface.hostId)?.ptyId ===
          surface.ptyId &&
        (!interactive ||
          this.runtime.getPtyExecutionHostMetadata(surface.ptyId).hostPlatform !== undefined)
      )
    } catch {
      return false
    }
  }
  get(contents: WebContents, id: unknown, interactive = false): PluginTerminalSurfaceLease | null {
    const surface = typeof id === 'string' ? this.surfaces.get(id) : null
    if (!surface || surface.contents !== contents) {
      return null
    }
    if (!this.current(surface, interactive)) {
      if (!this.current(surface)) {
        surface.dispose()
      }
      return null
    }
    return surface
  }
  private full(contents: WebContents, token: string): boolean {
    const key = `${contents.id}:${token}`
    const owned = [...this.surfaces.values()].filter(
      (surface) => surface.contents === contents && surface.sessionToken === token
    ).length
    return (
      this.surfaces.size + [...this.pending.values()].reduce((a, b) => a + b, 0) >= 128 ||
      owned + (this.pending.get(key) ?? 0) >= 16
    )
  }
  resolve(
    contents: WebContents,
    args: { sessionToken?: unknown; terminalId?: unknown; hostId?: unknown }
  ) {
    if (
      typeof args?.sessionToken !== 'string' ||
      typeof args.terminalId !== 'string' ||
      args.terminalId.length > 4096 ||
      (args.hostId !== undefined &&
        (typeof args.hostId !== 'string' || args.hostId.length > 4096)) ||
      !terminalSurfacePermitted(contents, args.sessionToken, false)
    ) {
      return null
    }
    const token = args.sessionToken
    const terminalId = args.terminalId
    const hostId = typeof args.hostId === 'string' ? args.hostId : undefined
    if (this.full(contents, token)) {
      return this.capacity.wait(contents)
    }
    const target = this.runtime.resolvePluginTerminalSurface(terminalId, hostId)
    if (target) {
      return this.install(
        contents,
        token,
        terminalId,
        {
          ...target,
          ...this.runtime.getPtyExecutionHostMetadata(target.ptyId),
          input: this.runtime.describePluginTerminalSurface?.(terminalId)?.input
        },
        null,
        hostId
      )
    }
    const path = terminalSurfaceUserDataPath(contents, token)
    if (!hostId || !path) {
      return null
    }
    const key = `${contents.id}:${token}`
    this.pending.set(key, (this.pending.get(key) ?? 0) + 1)
    const lifetime = abortWhenRendererGone(contents)
    const controller = new AbortController()
    this.pendingControllers.add(controller)
    lifetime.signal.addEventListener('abort', () => controller.abort(), { once: true })
    const off = observeTerminalSurfaceApproval(() => {
      if (!terminalSurfacePermitted(contents, token, false)) {
        controller.abort()
      }
    })
    return resolvePluginRemoteTerminalOwner(path, hostId, terminalId, controller.signal)
      .then((owner) => {
        if (
          !owner ||
          controller.signal.aborted ||
          !terminalSurfacePermitted(contents, token, false)
        ) {
          return null
        }
        return this.install(contents, token, terminalId, owner.target, owner, hostId)
      })
      .catch(() => null)
      .finally(() => {
        off()
        this.pendingControllers.delete(controller)
        lifetime.dispose()
        const count = (this.pending.get(key) ?? 1) - 1
        if (count) {
          this.pending.set(key, count)
        } else {
          this.pending.delete(key)
        }
        this.capacity.release()
      })
  }
  private install(
    contents: WebContents,
    token: string,
    terminalId: string,
    target: Omit<PluginTerminalSurfaceTarget, 'id'>,
    owner: RemoteOwner | null,
    hostId?: string
  ): PluginTerminalSurfaceTarget {
    const id = randomUUID()
    const lifetime = abortWhenRendererGone(contents)
    let stopOwner = (): void => {}
    let stopProfile = (): void => {}
    const surface: PluginTerminalSurfaceLease = {
      id,
      contents,
      sessionToken: token,
      terminalId,
      hostId,
      ptyId: target.ptyId,
      owner,
      profileKey: owner
        ? null
        : (this.runtime.describePluginTerminalSurface?.(terminalId)?.profileKey ?? null),
      remote: null,
      stream: null,
      viewerKey: null,
      fitEpoch: 0,
      release: () => {
        if (surface.remote) {
          void surface.remote.releaseFit()
          return
        }
        const key = surface.viewerKey
        surface.viewerKey = null
        if (key) {
          void this.runtime.unregisterRemoteDesktopViewer(surface.ptyId, key).catch(() => undefined)
        }
      },
      dispose: (reason) => {
        if (!this.surfaces.delete(id)) {
          return
        }
        stopOwner()
        stopProfile()
        surface.remote?.dispose()
        surface.stream?.dispose()
        surface.release()
        lifetime.dispose()
        this.capacity.release()
        if (!contents.isDestroyed()) {
          try {
            contents.send('pluginTerminalSurface:revoked', { id, ...(reason ? { reason } : {}) })
          } catch {
            /* Retirement cannot stop sibling cleanup. */
          }
        }
      }
    }
    this.surfaces.set(id, surface)
    if (owner) {
      surface.remote = owner.create(
        id,
        contents,
        (interactive) => this.current(surface, interactive),
        surface.dispose
      )
      stopOwner = owner.observe(surface.dispose)
    }
    if (!owner) {
      stopProfile =
        this.runtime.onAgentListChanged?.(() => {
          this.current(surface)
        }) ?? (() => {})
    }
    lifetime.signal.addEventListener('abort', () => surface.dispose(), { once: true })
    return { id, ...target }
  }
}
