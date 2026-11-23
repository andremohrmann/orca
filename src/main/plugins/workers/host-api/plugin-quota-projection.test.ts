import { expect, test } from 'vitest'
import { projectPluginQuotaReadings } from './plugin-quota-projection'

test('quota projection admits only display fields and never forwards account credentials or raw diagnostics', () => {
  const result = projectPluginQuotaReadings({
    claude: { accounts: [{ email: 'private@example.invalid', managedAuthPath: '/private/auth' }] },
    rateLimits: {
      codex: 'malformed-provider-reading',
      claude: {
        provider: 'claude',
        status: 'error',
        updatedAt: 1000,
        session: {
          usedPercent: 25,
          windowMinutes: 300,
          resetsAt: 2000,
          resetDescription: 'private reset text'
        },
        weekly: { usedPercent: 101, windowMinutes: 10080, resetsAt: null },
        error: 'credential token secret-value',
        usageMetadata: {
          credentialSource: '/private/auth',
          authProvenance: 'secret-value',
          readingAccount: { accountId: 'account-1', runtime: 'host', wslDistro: null }
        }
      }
    }
  })
  expect(result.readings[0]).toEqual({
    provider: 'claude',
    accountId: 'account-1',
    status: 'error',
    updatedAt: 1000,
    freshness: 'stale',
    windows: [{ name: 'session', usedPercent: 25, windowMinutes: 300, resetsAt: 2000 }],
    truncated: true
  })
  expect(JSON.stringify(result)).not.toMatch(
    /private|secret-value|credential|authProvenance|resetDescription/
  )
  expect(result.readings[1]).toEqual({
    provider: 'codex',
    accountId: null,
    status: 'error',
    updatedAt: null,
    freshness: 'unknown',
    windows: [],
    truncated: true
  })
  expect(result.readings[2]).toEqual({
    provider: 'gemini',
    accountId: null,
    status: 'unavailable',
    updatedAt: null,
    freshness: 'unknown',
    windows: [],
    truncated: false
  })
})
