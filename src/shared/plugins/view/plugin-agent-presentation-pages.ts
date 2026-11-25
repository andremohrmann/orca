import {
  PLUGIN_AGENT_PRESENTATION_MAX_BYTES,
  PLUGIN_AGENT_PRESENTATION_MAX_CHILDREN,
  PLUGIN_AGENT_PRESENTATION_MAX_ROWS,
  pluginAgentPresentationChildSchema,
  pluginAgentPresentationRowSchema,
  type PluginAgentPresentationResult,
  type PluginAgentPresentationRow
} from '../workers/plugin-host-api-agent-presentation'

export type PluginAgentPresentationSemanticRow = Omit<
  PluginAgentPresentationRow,
  'childrenContinuation'
>
export type PluginAgentPresentationReader = {
  kind: 'inventory' | 'children'
  parentRowId: string | null
  offset: number
  coverageInvalid: boolean
}
export type PluginAgentPresentationPageContext = Pick<
  Extract<PluginAgentPresentationResult, { status: 'complete' }>,
  'projectionVersion' | 'workspaceId' | 'requestKey' | 'scope' | 'version' | 'observation'
>
export type PluginAgentPresentationPageSelection = {
  result: PluginAgentPresentationResult
  consumed: number
  nextReader: PluginAgentPresentationReader | null
  childReaders: { rowId: string; reader: PluginAgentPresentationReader }[]
}

const encoder = new TextEncoder()
const identitySchema = pluginAgentPresentationRowSchema.pick({ rowId: true })
const orderable = (values: readonly unknown[]): boolean => {
  for (const value of values) {
    if (!identitySchema.safeParse(value).success) {
      return false
    }
  }
  return true
}
const ordinal = (a: { rowId: string }, b: { rowId: string }): number =>
  a.rowId < b.rowId ? -1 : a.rowId > b.rowId ? 1 : 0

export function selectPluginAgentPresentationPage(input: {
  context: PluginAgentPresentationPageContext
  rows: readonly PluginAgentPresentationSemanticRow[]
  reader: PluginAgentPresentationReader
  /** Pure: the renderer reserves full token bytes; main authenticates only selected positions. */
  mintContinuation: (reader: PluginAgentPresentationReader) => string
}): PluginAgentPresentationPageSelection {
  const { context, reader } = input
  const unavailable = (
    reason: Extract<PluginAgentPresentationResult, { status: 'unavailable' }>['reason']
  ): PluginAgentPresentationPageSelection => ({
    result: {
      ...context,
      status: 'unavailable',
      reason,
      totalRows: null,
      page: null,
      rows: [],
      truncated: false
    },
    consumed: 0,
    nextReader: null,
    childReaders: []
  })
  if (!Array.isArray(input.rows) || !orderable(input.rows)) {
    return unavailable('malformed-projection')
  }
  const rows = input.rows.toSorted(ordinal)
  if (
    !Number.isSafeInteger(reader.offset) ||
    reader.offset < 0 ||
    (reader.kind === 'inventory' ? reader.parentRowId !== null : !reader.parentRowId)
  ) {
    return unavailable('continuation-invalidated')
  }
  if (new Set(rows.map((row) => row.rowId)).size !== rows.length) {
    return unavailable('malformed-projection')
  }
  const parent =
    reader.kind === 'children' ? rows.find((row) => row.rowId === reader.parentRowId) : null
  if (reader.kind === 'children' && !parent) {
    return unavailable('continuation-invalidated')
  }
  if (parent && (!Array.isArray(parent.children) || !orderable(parent.children))) {
    return unavailable('malformed-projection')
  }
  const children = parent?.children.toSorted(ordinal)
  if (children && new Set(children.map((child) => child.rowId)).size !== children.length) {
    return unavailable('malformed-projection')
  }
  const total = children?.length ?? rows.length
  if (reader.offset > total) {
    return unavailable('continuation-invalidated')
  }
  const token = (next: PluginAgentPresentationReader): string => {
    const value = input.mintContinuation(next)
    if (!value || value.length > 4096) {
      throw new Error('Presentation continuation exceeds its wire bound')
    }
    return value
  }
  const limit = parent ? PLUGIN_AGENT_PRESENTATION_MAX_CHILDREN : PLUGIN_AGENT_PRESENTATION_MAX_ROWS
  let coverageInvalid = reader.coverageInvalid
  let consumed = 0
  const selected: PluginAgentPresentationRow[] = []
  const childReaders: PluginAgentPresentationPageSelection['childReaders'] = []

  const envelope = (
    output: PluginAgentPresentationRow[],
    count: number,
    invalid: boolean,
    stopReason: 'row-limit' | 'byte-limit'
  ): PluginAgentPresentationPageSelection => {
    const end = reader.offset + count
    const complete = end === total
    const nextReader = complete ? null : { ...reader, offset: end, coverageInvalid: invalid }
    const next = nextReader ? token(nextReader) : null
    const page =
      reader.kind === 'children'
        ? { kind: 'children' as const, parentRowId: reader.parentRowId!, offset: reader.offset }
        : { kind: 'inventory' as const, parentRowId: null, offset: reader.offset }
    const common = { ...context, totalRows: rows.length, rows: output }
    const result: PluginAgentPresentationResult =
      complete && !invalid
        ? {
            ...common,
            status: 'complete',
            reason: null,
            truncated: false,
            page: { ...page, complete: true, next: null }
          }
        : {
            ...common,
            status: 'partial',
            reason: invalid ? 'row-validation' : stopReason,
            truncated: true,
            page: { ...page, complete, next }
          }
    return { result, consumed: count, nextReader, childReaders }
  }
  const fits = (value: PluginAgentPresentationPageSelection): boolean => {
    const result = value.result
    const budget = {
      ...result,
      requestKey: '\0'.repeat(128),
      observation: result.observation
        ? {
            ...result.observation,
            evaluatedAt: { ...result.observation.evaluatedAt, ms: Number.MAX_SAFE_INTEGER },
            nextExpiryAfterMs: Number.MAX_SAFE_INTEGER
          }
        : null
    }
    return encoder.encode(JSON.stringify(budget)).byteLength <= PLUGIN_AGENT_PRESENTATION_MAX_BYTES
  }

  if (parent && children) {
    if (parent.totalChildRows !== children.length) {
      return unavailable('malformed-projection')
    }
    const selectedChildren: PluginAgentPresentationRow['children'] = []
    const childEnvelope = (
      output: PluginAgentPresentationRow['children'],
      count: number,
      invalid: boolean,
      reason: 'row-limit' | 'byte-limit'
    ): PluginAgentPresentationPageSelection | null => {
      const end = reader.offset + count
      const next = end < total ? { ...reader, offset: end, coverageInvalid: invalid } : null
      const parsed = pluginAgentPresentationRowSchema.safeParse({
        ...parent,
        children: output,
        childrenTruncated: invalid || end < total,
        childrenContinuation: next ? token(next) : null
      })
      return parsed.success ? envelope([parsed.data], count, invalid, reason) : null
    }
    let reason: 'row-limit' | 'byte-limit' = 'row-limit'
    while (reader.offset + consumed < total && consumed < limit) {
      const parsed = pluginAgentPresentationChildSchema.safeParse(
        children[reader.offset + consumed]
      )
      if (!parsed.success) {
        coverageInvalid = true
        consumed += 1
        continue
      }
      const candidate = childEnvelope(
        [...selectedChildren, parsed.data],
        consumed + 1,
        coverageInvalid,
        'byte-limit'
      )
      if (!candidate) {
        return unavailable('malformed-projection')
      }
      if (!fits(candidate)) {
        reason = 'byte-limit'
        if (!selectedChildren.length) {
          return unavailable('malformed-projection')
        }
        break
      }
      selectedChildren.push(parsed.data)
      consumed += 1
    }
    const result = childEnvelope(selectedChildren, consumed, coverageInvalid, reason)
    return result && fits(result) && (consumed > 0 || reader.offset === total)
      ? result
      : unavailable('malformed-projection')
  }

  let stopReason: 'row-limit' | 'byte-limit' = 'row-limit'
  while (reader.offset + consumed < total && consumed < limit) {
    const row = rows[reader.offset + consumed]!
    if (!Array.isArray(row.children) || !orderable(row.children)) {
      coverageInvalid = true
      consumed += 1
      continue
    }
    const orderedChildren = row.children.toSorted(ordinal)
    const childReader: PluginAgentPresentationReader | null =
      orderedChildren.length > PLUGIN_AGENT_PRESENTATION_MAX_CHILDREN
        ? { kind: 'children', parentRowId: row.rowId, offset: 0, coverageInvalid: false }
        : null
    const parsed = pluginAgentPresentationRowSchema.safeParse({
      ...row,
      children: orderedChildren.slice(0, PLUGIN_AGENT_PRESENTATION_MAX_CHILDREN),
      childrenTruncated: childReader !== null,
      childrenContinuation: childReader ? token(childReader) : null
    })
    if (
      !parsed.success ||
      row.totalChildRows !== orderedChildren.length ||
      new Set(orderedChildren.map((child) => child.rowId)).size !== orderedChildren.length
    ) {
      coverageInvalid = true
      consumed += 1
      continue
    }
    const candidate = envelope(
      [...selected, parsed.data],
      consumed + 1,
      coverageInvalid,
      'byte-limit'
    )
    if (!fits(candidate)) {
      stopReason = 'byte-limit'
      if (!selected.length) {
        coverageInvalid = true
        consumed += 1
        continue
      }
      break
    }
    selected.push(parsed.data)
    if (childReader) {
      childReaders.push({ rowId: row.rowId, reader: childReader })
    }
    consumed += 1
  }
  const result = envelope(selected, consumed, coverageInvalid, stopReason)
  if (!fits(result) || (consumed === 0 && reader.offset < total)) {
    return unavailable('malformed-projection')
  }
  return result
}
