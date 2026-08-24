import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const CUSTOM_VERSION = /^\d+\.\d+\.\d+-custom\.\d{14}$/

export function collectCustomWindowsPackagingProblems({ config, env }) {
  const problems = []
  const version = env.ORCA_LOCAL_BUILD_VERSION ?? ''

  if (!CUSTOM_VERSION.test(version)) {
    problems.push(`ORCA_LOCAL_BUILD_VERSION is not a stamped custom version: "${version}".`)
  }
  if (config.extraMetadata?.version !== version) {
    problems.push(
      `extraMetadata.version is "${config.extraMetadata?.version}" but the custom build version is "${version}".`
    )
  }
  if (env.ORCA_UPDATE_OWNER && config.publish?.owner !== env.ORCA_UPDATE_OWNER) {
    problems.push(
      `publish.owner is "${config.publish?.owner}" but ORCA_UPDATE_OWNER is "${env.ORCA_UPDATE_OWNER}".`
    )
  }
  if (env.ORCA_UPDATE_REPO && config.publish?.repo !== env.ORCA_UPDATE_REPO) {
    problems.push(
      `publish.repo is "${config.publish?.repo}" but ORCA_UPDATE_REPO is "${env.ORCA_UPDATE_REPO}".`
    )
  }
  if (config.win?.verifyUpdateCodeSignature !== false) {
    problems.push(
      'win.verifyUpdateCodeSignature must be false because custom Windows installers are unsigned.'
    )
  }
  if (config.win?.signtoolOptions?.publisherName != null) {
    problems.push(
      `win.signtoolOptions.publisherName is set to "${config.win.signtoolOptions.publisherName}" on an unsigned custom build.`
    )
  }

  return problems
}

function main() {
  const require = createRequire(import.meta.url)
  const config = require(resolve(import.meta.dirname, '../electron-builder.config.cjs'))
  const problems = collectCustomWindowsPackagingProblems({ config, env: process.env })
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(`::error::${problem}`)
    }
    process.exit(1)
  }
  console.log(
    `Custom Windows packaging verified: ${config.publish.owner}/${config.publish.repo} @ ${config.extraMetadata.version}`
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
