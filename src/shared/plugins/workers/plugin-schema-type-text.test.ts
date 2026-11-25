import { expect, it } from 'vitest'
import { z } from 'zod'
import { zodTypeText } from './plugin-schema-type-text'

it('preserves discriminated result variants and nullable clock fields in generated SDK types', () => {
  const schema = z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('clock'),
      startedAt: z.object({ clockId: z.string(), ms: z.number() }).nullable()
    }),
    z.object({ kind: z.literal('empty') })
  ])
  expect(zodTypeText(schema, 'output', { json: 'JsonValue', emptyObject: '{}' })).toBe(
    '{ kind: "clock"; startedAt: { clockId: string; ms: number } | null } | { kind: "empty" }'
  )
})
