export const PLUGIN_EXTERNAL_URL_PROTOCOLS: readonly string[] = ['http:', 'https:', 'mailto:']

export function isPluginExternalUrl(url: string): boolean {
  try {
    return PLUGIN_EXTERNAL_URL_PROTOCOLS.includes(new URL(url).protocol)
  } catch {
    return false
  }
}
