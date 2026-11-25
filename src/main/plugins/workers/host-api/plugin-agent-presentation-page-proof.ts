import type { PluginAgentPresentationResult } from '../../../../shared/plugins/workers/plugin-host-api-agent-presentation'
import type { PluginAgentPresentationReader } from '../../../../shared/plugins/view/plugin-agent-presentation-pages'
import type { PluginAgentPresentationRelayPage } from '../../../../shared/plugins/view/plugin-agent-presentation-relay'

export function pluginAgentPresentationPageProven(
  result: Exclude<PluginAgentPresentationResult, { status: 'unavailable' }>,
  proof: PluginAgentPresentationRelayPage,
  reader: PluginAgentPresentationReader
): boolean {
  const page = result.page
  if (
    page.kind !== reader.kind ||
    page.parentRowId !== reader.parentRowId ||
    page.offset !== reader.offset
  ) {
    return false
  }
  const invalid = reader.coverageInvalid || result.reason === 'row-validation'
  const parent = reader.kind === 'children' ? result.rows[0] : null
  if (
    reader.kind === 'children' &&
    (result.rows.length !== 1 || parent?.rowId !== reader.parentRowId)
  ) {
    return false
  }
  const total = parent ? parent.totalChildRows : result.totalRows
  const end = reader.offset + proof.consumed
  if (end > total || (proof.consumed === 0 && end < total)) {
    return false
  }
  if (page.complete !== (end === total) || Boolean(page.next) !== end < total) {
    return false
  }
  const emitted = parent ? parent.children.length : result.rows.length
  if (emitted > proof.consumed || (!invalid && emitted !== proof.consumed)) {
    return false
  }
  if (invalid && result.status !== 'partial') {
    return false
  }
  const next = proof.nextReader
  if (end < total !== Boolean(next)) {
    return false
  }
  if (
    next &&
    (next.kind !== reader.kind ||
      next.parentRowId !== reader.parentRowId ||
      next.offset !== end ||
      next.coverageInvalid !== invalid)
  ) {
    return false
  }
  if (parent) {
    return proof.childReaders.length === 0 && Boolean(parent.childrenContinuation) === Boolean(next)
  }
  if (new Set(result.rows.map((row) => row.rowId)).size !== result.rows.length) {
    return false
  }
  const entries = new Map(proof.childReaders.map((entry) => [entry.rowId, entry.reader]))
  if (entries.size !== proof.childReaders.length) {
    return false
  }
  for (const row of result.rows) {
    if (row.children.length > row.totalChildRows) {
      return false
    }
    const child = entries.get(row.rowId)
    const truncated = row.totalChildRows > row.children.length
    if (
      row.childrenTruncated !== truncated ||
      Boolean(row.childrenContinuation) !== truncated ||
      Boolean(child) !== truncated
    ) {
      return false
    }
    if (
      child &&
      (child.kind !== 'children' ||
        child.parentRowId !== row.rowId ||
        child.offset !== 0 ||
        child.coverageInvalid)
    ) {
      return false
    }
    entries.delete(row.rowId)
  }
  return entries.size === 0
}
