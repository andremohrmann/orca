import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { PluginAgentPresentationVersion } from '../../../../shared/plugins/workers/plugin-host-api-agent-presentation'
import {
  PLUGIN_AGENT_PRESENTATION_MAX_FENCES,
  PLUGIN_AGENT_PRESENTATION_CONTINUATION_TTL_MS
} from '../../../../shared/plugins/workers/plugin-host-api-agent-presentation'
import { pluginAgentPresentationReaderSchema } from '../../../../shared/plugins/view/plugin-agent-presentation-relay'
import type { PluginAgentPresentationReader } from '../../../../shared/plugins/view/plugin-agent-presentation-pages'

export type PluginPresentationFence = {
  key: string
  id: string
  authorizationEpoch: string
  version: PluginAgentPresentationVersion | null
}
const cursorSchema = z.object({
  fence: z.string().max(128),
  expiresAt: z.number().int().nonnegative(),
  reader: pluginAgentPresentationReaderSchema
})

export class PluginAgentPresentationFences {
  private readonly secret = randomBytes(32)
  private readonly scopes = new Map<string, PluginPresentationFence>()

  begin(
    pluginId: string,
    workspaceId: string,
    authorizationEpoch: string
  ): PluginPresentationFence {
    const key = JSON.stringify([pluginId, workspaceId])
    const current = this.scopes.get(key)
    if (current?.authorizationEpoch === authorizationEpoch) {
      return current
    }
    return this.replace(key, authorizationEpoch, null)
  }

  private replace(
    key: string,
    authorizationEpoch: string,
    version: PluginAgentPresentationVersion | null
  ): PluginPresentationFence {
    this.scopes.delete(key)
    if (this.scopes.size >= PLUGIN_AGENT_PRESENTATION_MAX_FENCES) {
      const oldest = this.scopes.keys().next().value
      if (oldest !== undefined) {
        this.scopes.delete(oldest)
      }
    }
    const next = { key, id: randomUUID(), authorizationEpoch, version }
    this.scopes.set(key, next)
    return next
  }

  isCurrent(fence: PluginPresentationFence): boolean {
    return this.scopes.get(fence.key) === fence
  }

  retire(fence: PluginPresentationFence): void {
    if (this.isCurrent(fence)) {
      this.scopes.delete(fence.key)
    }
  }

  accept(
    fence: PluginPresentationFence,
    version: PluginAgentPresentationVersion,
    continuation: boolean
  ): PluginPresentationFence | null {
    if (!this.isCurrent(fence)) {
      return null
    }
    if (!fence.version) {
      return this.replace(fence.key, fence.authorizationEpoch, version)
    }
    if (JSON.stringify(fence.version) === JSON.stringify(version)) {
      return fence
    }
    if (continuation) {
      return null
    }
    const old = fence.version
    if (
      old.producerEpoch === version.producerEpoch &&
      old.scopeGeneration > version.scopeGeneration
    ) {
      return null
    }
    if (
      old.producerEpoch === version.producerEpoch &&
      old.scopeGeneration === version.scopeGeneration &&
      (old.scopeEpoch !== version.scopeEpoch ||
        old.ownerEpoch !== version.ownerEpoch ||
        old.revision > version.revision)
    ) {
      return null
    }
    return this.replace(fence.key, fence.authorizationEpoch, version)
  }

  decode(fence: PluginPresentationFence, token: string): PluginAgentPresentationReader | null {
    if (
      !this.isCurrent(fence) ||
      !fence.version ||
      token.length > 4096 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
    ) {
      return null
    }
    const [payload, signature] = token.split('.')
    const expected = createHmac('sha256', this.secret).update(payload!).digest()
    const supplied = Buffer.from(signature!, 'base64url')
    if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) {
      return null
    }
    let value: unknown
    try {
      value = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'))
    } catch {
      return null
    }
    const parsed = cursorSchema.safeParse(value)
    return parsed.success && parsed.data.fence === fence.id && parsed.data.expiresAt > Date.now()
      ? parsed.data.reader
      : null
  }

  mint(fence: PluginPresentationFence, reader: PluginAgentPresentationReader): string {
    if (!this.isCurrent(fence) || !fence.version) {
      throw new Error('Presentation version retired')
    }
    const payload = Buffer.from(
      JSON.stringify({
        fence: fence.id,
        reader,
        expiresAt: Date.now() + PLUGIN_AGENT_PRESENTATION_CONTINUATION_TTL_MS
      })
    ).toString('base64url')
    const token = `${payload}.${createHmac('sha256', this.secret).update(payload).digest('base64url')}`
    if (token.length > 4096) {
      throw new Error('Presentation continuation exceeds reservation')
    }
    return token
  }
}
