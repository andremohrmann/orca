import { translate } from '@/i18n/i18n'
import type { Translate } from '@/i18n/use-translate'

/** English sentinel from shortcut formatters; translate only at display sites. */
export const UNASSIGNED_SHORTCUT_SENTINEL = 'Unassigned'

export function translateUnassignedLabel(t: Translate = translate): string {
  return t('common.unassigned', 'Unassigned')
}

export function localizeUnassignedDisplay(value: string, t?: Translate): string {
  return value === UNASSIGNED_SHORTCUT_SENTINEL ? translateUnassignedLabel(t) : value
}

/** True when a shortcut label is the unbound sentinel (EN or localized). */
export function isUnassignedShortcutLabel(value: string): boolean {
  return value === UNASSIGNED_SHORTCUT_SENTINEL || value === translateUnassignedLabel()
}
