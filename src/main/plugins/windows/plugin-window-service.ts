import { app, type BrowserWindow, type WebContents } from 'electron'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { z } from 'zod'
import type { PluginService } from '../plugin-service'
import type { PluginHostCallScope } from '../workers/host-api/plugin-host-call-scope'
import { PluginHostCallError } from '../workers/host-api/plugin-host-call-scope'
import type { pluginWindowPresentationSchema } from '../../../shared/plugins/workers/plugin-host-api-window'
import { pluginWindowBoundsSchema } from '../../../shared/plugins/workers/plugin-host-api-window'
import { PluginWindowPreferences, type PluginWindowPreference } from './plugin-window-preferences'
import {
  isBackgroundLaunch,
  showWhenAppActive
} from '../../window/activation/foreground-activation-policy'
import { createPluginPopoutWindow } from './plugin-popout-window'
import { trackPluginPopoutBounds } from './plugin-popout-bounds'
import { requestPluginViewFromRenderer } from '../view/plugin-view-renderer-relay'
import type { Store } from '../../persistence/loading-store/store'
import { getPluginWindowService } from './plugin-window-service-registry'
export { setPluginWindowService } from './plugin-window-service-registry'

type Bounds = z.infer<typeof pluginWindowBoundsSchema>
type Presentation = z.infer<typeof pluginWindowPresentationSchema>
type OwnedWindow = { window: BrowserWindow; revision: string }

export class PluginWindowService {
  private readonly windows = new Map<string, OwnedWindow>()
  private readonly preferences: PluginWindowPreferences
  private readonly stopChanged: () => void

  constructor(
    private readonly service: PluginService,
    private readonly getMainWindow: () => BrowserWindow | null,
    private readonly store: Pick<Store, 'getSettings' | 'updateSettings'>
  ) {
    this.preferences = new PluginWindowPreferences(service.options.userDataPath)
    this.stopChanged = service.onChanged(() => this.reconcile())
  }

  private key(pluginId: string, panelId: string): string {
    return `${pluginId}/${panelId}`
  }

  private revision(pluginId: string, panelId: string): string {
    const plugin = this.service.findApprovedPlugin(pluginId, true)
    if (
      !plugin ||
      !plugin.manifest.contributes.panels.some((panel) => panel.id === panelId) ||
      !plugin.manifest.capabilities.some((capability) => capability.kind === 'window:own')
    ) {
      throw new PluginHostCallError(
        'not_permitted',
        'panel is not declared by an approved plugin with window:own'
      )
    }
    return createHash('sha256')
      .update(
        JSON.stringify([
          plugin.rootDir,
          plugin.contentHash,
          plugin.consentFingerprint,
          plugin.manifest
        ])
      )
      .digest('hex')
  }

  private saved(pluginId: string, panelId: string): PluginWindowPreference {
    return this.preferences.get(this.key(pluginId, panelId), this.revision(pluginId, panelId))
  }

  private persist(
    pluginId: string,
    panelId: string,
    patch: Partial<Omit<PluginWindowPreference, 'revision'>>,
    scope?: PluginHostCallScope
  ): Promise<void> {
    const revision = this.revision(pluginId, panelId)
    return this.preferences.set(this.key(pluginId, panelId), revision, patch, () => {
      scope?.assertActive()
      if (this.revision(pluginId, panelId) !== revision) {
        throw new PluginHostCallError('consent_required', 'plugin install changed')
      }
    })
  }

  async read(pluginId: string, panelId: string) {
    await this.preferences.whenReady()
    const saved = this.saved(pluginId, panelId)
    const window = this.windows.get(this.key(pluginId, panelId))?.window
    return {
      open: !!window && !window.isDestroyed(),
      opacity: saved.opacity,
      opacitySupported: process.platform !== 'linux',
      bounds:
        window && !window.isDestroyed()
          ? pluginWindowBoundsSchema.parse(window.getNormalBounds())
          : saved.bounds,
      startup: saved.startup
    }
  }

  async open(
    pluginId: string,
    panelId: string,
    presentation: Presentation,
    scope: PluginHostCallScope,
    bounds?: Bounds
  ): Promise<void> {
    await this.preferences.whenReady()
    scope.assertActive()
    this.revision(pluginId, panelId)
    const parent = this.getMainWindow()
    if (!parent || parent.isDestroyed()) {
      throw new PluginHostCallError('unavailable', 'Orca has no desktop window')
    }
    if (presentation === 'panel') {
      const reply = await requestPluginViewFromRenderer(
        parent.webContents,
        { kind: 'open-panel', pluginKey: pluginId, panelId },
        10_000
      )
      scope.assertActive()
      if (!reply.ok) {
        throw new PluginHostCallError('unavailable', reply.message)
      }
      this.close(pluginId, panelId)
      return
    }
    const key = this.key(pluginId, panelId)
    const existing = this.windows.get(key)?.window
    if (existing && !existing.isDestroyed()) {
      return
    }
    const saved = this.saved(pluginId, panelId)
    const window = createPluginPopoutWindow({
      pluginId,
      title: `${this.service.findApprovedPlugin(pluginId, true)?.manifest.name ?? pluginId} · Orca`,
      bounds: bounds ?? saved.bounds,
      opacity: saved.opacity,
      store: this.store
    })
    this.windows.set(key, { window, revision: saved.revision })
    const rememberBounds = (): void => {
      if (window.isDestroyed() || window.isMinimized() || window.isFullScreen()) {
        return
      }
      const parsed = pluginWindowBoundsSchema.safeParse(window.getNormalBounds())
      if (parsed.success) {
        try {
          if (this.revision(pluginId, panelId) !== saved.revision) {
            return
          }
          void this.persist(pluginId, panelId, { bounds: parsed.data }).catch((error) => {
            this.service.captureLog(pluginId)('warn', String(error))
          })
        } catch (error) {
          this.service.captureLog(pluginId)('warn', String(error))
        }
      }
    }
    const closeWithOwner = trackPluginPopoutBounds(window, parent, rememberBounds, () => {
      if (this.windows.get(key)?.window === window) {
        this.windows.delete(key)
      }
    })
    const query = { pluginKey: pluginId, panelId }
    try {
      if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
        const url = new URL('plugin-popout.html', `${process.env.ELECTRON_RENDERER_URL}/`)
        url.search = new URLSearchParams(query).toString()
        await window.loadURL(url.toString())
      } else {
        await window.loadFile(join(__dirname, '../renderer/plugin-popout.html'), { query })
      }
      scope.assertActive()
      if (this.revision(pluginId, panelId) !== saved.revision) {
        throw new PluginHostCallError(
          'consent_required',
          'plugin install changed while opening its window'
        )
      }
      if (!isBackgroundLaunch()) {
        showWhenAppActive(window)
      }
    } catch (error) {
      closeWithOwner()
      throw error
    }
  }

  close(pluginId: string, panelId: string): boolean {
    this.revision(pluginId, panelId)
    const window = this.windows.get(this.key(pluginId, panelId))?.window
    if (!window || window.isDestroyed()) {
      return false
    }
    window.close()
    return true
  }

  async setOpacity(
    pluginId: string,
    panelId: string,
    opacity: number,
    scope: PluginHostCallScope
  ): Promise<void> {
    if (process.platform === 'linux') {
      throw new PluginHostCallError('unavailable', 'native window opacity is unsupported on Linux')
    }
    const window = this.windows.get(this.key(pluginId, panelId))?.window
    if (!window || window.isDestroyed()) {
      throw new PluginHostCallError('unavailable', 'this panel has no open popout')
    }
    await this.persist(pluginId, panelId, { opacity }, scope)
    scope.assertActive()
    if (window.isDestroyed()) {
      throw new PluginHostCallError('unavailable', 'this panel popout closed during the write')
    }
    window.setOpacity(opacity)
  }

  setStartup(
    pluginId: string,
    panelId: string,
    presentation: Presentation | null,
    scope: PluginHostCallScope
  ): Promise<void> {
    return this.persist(pluginId, panelId, { startup: presentation }, scope)
  }

  async restoreStartup(): Promise<void> {
    await this.service.whenReady()
    await this.preferences.whenReady()
    for (const [key, saved] of this.preferences.entries()) {
      const [pluginId, panelId] = key.split('/')
      if (!pluginId || !panelId || !saved.startup) {
        continue
      }
      try {
        if (this.revision(pluginId, panelId) !== saved.revision) {
          continue
        }
        await this.open(pluginId, panelId, saved.startup, {
          assertActive: () => {
            if (this.revision(pluginId, panelId) !== saved.revision) {
              throw new PluginHostCallError('consent_required', 'plugin install changed')
            }
          }
        })
      } catch (error) {
        this.service.captureLog(pluginId)(
          'warn',
          `startup presentation unavailable: ${String(error)}`
        )
      }
    }
  }

  private reconcile(): void {
    for (const [key, owned] of this.windows) {
      const [pluginId, panelId] = key.split('/')
      try {
        if (pluginId && panelId && this.revision(pluginId, panelId) === owned.revision) {
          continue
        }
      } catch {
        /* Approval was revoked. */
      }
      if (!owned.window.isDestroyed()) {
        owned.window.destroy()
      }
      this.windows.delete(key)
    }
  }

  isRenderer(contents: WebContents): boolean {
    if (contents.isDestroyed() || contents.getType() !== 'window') {
      return false
    }
    for (const [key, owned] of this.windows) {
      if (owned.window.isDestroyed() || owned.window.webContents !== contents) {
        continue
      }
      const [pluginId, panelId] = key.split('/')
      try {
        return !!pluginId && !!panelId && this.revision(pluginId, panelId) === owned.revision
      } catch {
        return false
      }
    }
    return false
  }

  dispose(): void {
    this.stopChanged()
    for (const { window } of this.windows.values()) {
      if (!window.isDestroyed()) {
        window.destroy()
      }
    }
    this.windows.clear()
  }
}

export function isPluginPopoutRenderer(contents: WebContents): boolean {
  return getPluginWindowService()?.isRenderer(contents) ?? false
}
