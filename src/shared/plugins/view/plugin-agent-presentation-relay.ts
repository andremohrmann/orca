import { z } from 'zod'
import type {
  PluginAgentPresentationReader,
  PluginAgentPresentationPageSelection
} from './plugin-agent-presentation-pages'
import type {
  PluginAgentPresentationParams,
  PluginAgentPresentationResult,
  PluginAgentPresentationVersion
} from '../workers/plugin-host-api-agent-presentation'

export type PluginAgentPresentationSelection = PluginAgentPresentationReader & {
  version: PluginAgentPresentationVersion
}

export type PluginAgentPresentationRead = {
  params: PluginAgentPresentationParams
  worktreeId: string
  executionHostId: string
  selection: PluginAgentPresentationSelection | null
}
export type PluginAgentPresentationReply = PluginAgentPresentationResult

export type PluginAgentPresentationRelayPage = Pick<
  PluginAgentPresentationPageSelection,
  'consumed' | 'nextReader' | 'childReaders'
>

export const pluginAgentPresentationReaderSchema = z.object({
  kind: z.enum(['inventory', 'children']),
  parentRowId: z.string().min(1).max(128).nullable(),
  offset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  coverageInvalid: z.boolean()
})
export const pluginAgentPresentationRelayPageSchema = z.object({
  consumed: z.number().int().nonnegative().max(100),
  nextReader: pluginAgentPresentationReaderSchema.nullable(),
  childReaders: z
    .array(
      z.object({ rowId: z.string().min(1).max(128), reader: pluginAgentPresentationReaderSchema })
    )
    .max(100)
})
