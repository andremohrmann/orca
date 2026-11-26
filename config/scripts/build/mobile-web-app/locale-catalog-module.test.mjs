import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { localeCatalogModule } from './locale-catalog-module.mjs'

it('round-trips catalog values and special keys through executable modules', () => {
  const catalog = JSON.parse(
    '{"__proto__":{"safe":true},"values":[null,2,false,"Repeated translation: \\"ä 中文\\"","Repeated translation: \\"ä 中文\\""]}'
  )
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(localeCatalogModule(catalog)).toString('base64')}`
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      'const module = await import(process.argv[1]); process.stdout.write(JSON.stringify(module.default))',
      moduleUrl
    ],
    { encoding: 'utf8' }
  )
  expect(result.status).toBe(0)
  expect(JSON.parse(result.stdout)).toStrictEqual(catalog)
})
