import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectCustomWindowsPackagingProblems } from './verify-custom-windows-packaging.mjs'

const require = createRequire(import.meta.url)
const CONFIG_PATH = resolve(import.meta.dirname, '../electron-builder.config.cjs')
const CUSTOM_ENV = {
  ORCA_LOCAL_BUILD_VERSION: '1.4.179-custom.20260824093000',
  ORCA_UPDATE_OWNER: 'andremohrmann',
  ORCA_UPDATE_REPO: 'orca'
}

function loadConfigWithEnv(env) {
  const saved = { ...process.env }
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('ORCA_')) {
      delete process.env[key]
    }
  }
  Object.assign(process.env, env)
  try {
    delete require.cache[require.resolve(CONFIG_PATH)]
    return require(CONFIG_PATH)
  } finally {
    process.env = saved
    delete require.cache[require.resolve(CONFIG_PATH)]
  }
}

afterEach(() => {
  delete require.cache[require.resolve(CONFIG_PATH)]
})

describe('custom Windows packaging identity', () => {
  it('drops the official publisher requirement from unsigned custom builds', () => {
    const config = loadConfigWithEnv(CUSTOM_ENV)

    expect(config.win.verifyUpdateCodeSignature).toBe(false)
    expect(config.win.signtoolOptions?.publisherName).toBeUndefined()
    expect(config.publish.owner).toBe('andremohrmann')
    expect(config.publish.repo).toBe('orca')
    expect(config.extraMetadata.version).toBe(CUSTOM_ENV.ORCA_LOCAL_BUILD_VERSION)
  })

  it('accepts the corrected custom build identity', () => {
    const config = loadConfigWithEnv(CUSTOM_ENV)

    expect(collectCustomWindowsPackagingProblems({ config, env: CUSTOM_ENV })).toEqual([])
  })

  it('rejects an unsigned build that still claims the official publisher', () => {
    const config = {
      publish: { owner: 'andremohrmann', repo: 'orca' },
      extraMetadata: { version: CUSTOM_ENV.ORCA_LOCAL_BUILD_VERSION },
      win: { signtoolOptions: { publisherName: 'SignPath Foundation' } }
    }

    const problems = collectCustomWindowsPackagingProblems({ config, env: CUSTOM_ENV }).join('\n')
    expect(problems).toContain('verifyUpdateCodeSignature must be false')
    expect(problems).toContain('publisherName is set to "SignPath Foundation"')
  })

  it('rejects a mismatched update feed and version', () => {
    const config = {
      publish: { owner: 'stablyai', repo: 'orca' },
      extraMetadata: { version: '1.4.179' },
      win: { verifyUpdateCodeSignature: false }
    }

    const problems = collectCustomWindowsPackagingProblems({ config, env: CUSTOM_ENV }).join('\n')
    expect(problems).toContain('extraMetadata.version')
    expect(problems).toContain('publish.owner')
  })
})
