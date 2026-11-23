import { z } from 'zod'
import type { PluginHostResult } from '../../../../shared/plugins/workers/plugin-host-api'

const windowSchema = z.object({
  usedPercent: z.number().finite(),
  windowMinutes: z.number().finite(),
  resetsAt: z.number().finite().nullable()
})
const readingSchema = z.object({
  provider: z.string(),
  status: z.enum(['idle', 'fetching', 'ok', 'error', 'unavailable']),
  updatedAt: z.number().finite(),
  session: windowSchema.nullable(),
  weekly: windowSchema.nullable(),
  fableWeekly: windowSchema.nullable().optional(),
  monthly: windowSchema.nullable().optional(),
  buckets: z.array(windowSchema.extend({ name: z.string() })).optional(),
  usageMetadata: z
    .object({
      readingAccount: z.object({ accountId: z.string().min(1).max(4096) }).optional(),
      account: z.object({ id: z.string().min(1).max(4096).nullable() }).optional()
    })
    .optional()
})
const inactiveSchema = z.object({
  accountId: z.string().min(1).max(4096),
  rateLimits: z.unknown(),
  updatedAt: z.number(),
  isFetching: z.boolean()
})
const providers = [
  'claude',
  'codex',
  'gemini',
  'opencodeGo',
  'kimi',
  'antigravity',
  'minimax',
  'grok',
  'cursor',
  'zcode',
  'muse'
] as const
const answerSchema = z.object({ rateLimits: z.record(z.string(), z.unknown()) })
type Reading = z.infer<typeof readingSchema>
type PublicReading = PluginHostResult<'provider.usage'>['readings'][number]

export function projectPluginQuotaReading(
  provider: string,
  reading: Reading | null | undefined,
  accountId: string | null = null,
  fetching = false
): PublicReading {
  const candidates = reading
    ? [
        ['session', reading.session] as const,
        ['weekly', reading.weekly] as const,
        ['fableWeekly', reading.fableWeekly] as const,
        ['monthly', reading.monthly] as const,
        ...(reading.buckets ?? []).map((bucket) => [bucket.name, bucket] as const)
      ]
    : []
  const windows = candidates.flatMap(([name, window]) =>
    window && window.windowMinutes > 0 && window.usedPercent >= 0 && window.usedPercent <= 100
      ? [
          {
            name: name.slice(0, 256),
            usedPercent: window.usedPercent,
            windowMinutes: window.windowMinutes,
            resetsAt: window.resetsAt !== null && window.resetsAt >= 0 ? window.resetsAt : null
          }
        ]
      : []
  )
  const updatedAt = reading && reading.updatedAt > 0 ? reading.updatedAt : null
  return {
    provider: provider.slice(0, 128),
    accountId,
    status: fetching ? 'fetching' : (reading?.status ?? 'unavailable'),
    updatedAt,
    freshness:
      updatedAt === null ? 'unknown' : reading?.status === 'ok' && !fetching ? 'observed' : 'stale',
    windows: windows.slice(0, 64),
    truncated:
      candidates.filter(([, window]) => window != null).length > windows.length ||
      windows.length > 64
  }
}

function projectedReading(
  provider: string,
  value: unknown,
  accountId?: string,
  fetching = false
): PublicReading {
  const parsed = readingSchema.nullable().optional().safeParse(value)
  if (!parsed.success) {
    return {
      ...projectPluginQuotaReading(provider, null, accountId ?? null),
      status: 'error',
      truncated: true
    }
  }
  const reading = parsed.data
  return projectPluginQuotaReading(
    provider,
    reading,
    accountId ??
      reading?.usageMetadata?.readingAccount?.accountId ??
      reading?.usageMetadata?.account?.id ??
      null,
    fetching
  )
}

export function projectPluginQuotaReadings(answer: unknown): PluginHostResult<'provider.usage'> {
  const { rateLimits } = answerSchema.parse(answer)
  const readings: PublicReading[] = providers.map((provider) =>
    projectedReading(provider === 'opencodeGo' ? 'opencode-go' : provider, rateLimits[provider])
  )
  let omitted = false
  for (const [provider, key] of [
    ['claude', 'inactiveClaudeAccounts'],
    ['codex', 'inactiveCodexAccounts']
  ] as const) {
    const accounts = rateLimits[key]
    if (accounts !== undefined && !Array.isArray(accounts)) {
      omitted = true
      continue
    }
    for (const raw of Array.isArray(accounts) ? accounts : []) {
      const account = inactiveSchema.safeParse(raw)
      if (!account.success) {
        omitted = true
        continue
      }
      readings.push(
        projectedReading(
          provider,
          account.data.rateLimits,
          account.data.accountId,
          account.data.isFetching
        )
      )
    }
  }
  const antigravity = rateLimits.antigravityAccounts
  if (antigravity !== undefined && !Array.isArray(antigravity)) {
    omitted = true
  }
  for (const raw of Array.isArray(antigravity) ? antigravity : []) {
    const account = z
      .object({ accountId: z.string().min(1).max(4096), rateLimits: z.unknown() })
      .safeParse(raw)
    if (!account.success) {
      omitted = true
      continue
    }
    readings.push(projectedReading('antigravity', account.data.rateLimits, account.data.accountId))
  }
  return { readings: readings.slice(0, 128), truncated: omitted || readings.length > 128 }
}
