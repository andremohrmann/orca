import { readFile } from 'node:fs/promises'

export function localeCatalogModule(catalog) {
  const counts = new Map()
  function count(value) {
    if (typeof value === 'string') {
      counts.set(value, (counts.get(value) ?? 0) + 1)
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(count)
    }
  }
  count(catalog)
  const aliases = new Map(
    [...counts]
      .filter(([value, count]) => count > 1 && value.length >= 20)
      .map(([value], index) => [value, `c${index}`])
  )
  function render(value) {
    if (typeof value === 'string') {
      return aliases.get(value) ?? JSON.stringify(value)
    }
    if (Array.isArray(value)) {
      return `[${value.map(render).join(',')}]`
    }
    if (value && typeof value === 'object') {
      return `{${Object.entries(value)
        .map(([key, child]) => `[${JSON.stringify(key)}]:${render(child)}`)
        .join(',')}}`
    }
    return JSON.stringify(value)
  }
  const declarations = [...aliases]
    .map(([value, name]) => `const ${name}=${JSON.stringify(value)};`)
    .join('')
  return `${declarations}export default ${render(catalog)};`
}

export const localeCatalogPlugin = {
  name: 'orca-locale-catalog-strings',
  setup(build) {
    build.onLoad(
      { filter: /[\\/]src[\\/]i18n[\\/]locales[\\/][^\\/]+\.json$/ },
      async ({ path }) => ({
        contents: localeCatalogModule(JSON.parse(await readFile(path, 'utf8'))),
        loader: 'js'
      })
    )
  }
}
