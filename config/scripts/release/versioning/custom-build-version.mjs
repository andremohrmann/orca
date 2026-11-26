import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveDevChannelBaseVersion } from './dev-channel-base-version.mjs'

export function createCustomBuildVersion(packageVersion, upstreamRelease, date = new Date()) {
  if (!/^v?\d+\.\d+\.\d+$/.test(upstreamRelease)) {
    throw new Error(`Expected an upstream stable release tag, received ${upstreamRelease}`)
  }
  const base = resolveDevChannelBaseVersion(packageVersion, [upstreamRelease])
  const stamp = date.toISOString().replace(/\D/g, '').slice(0, 14)
  return `${base}-custom.${stamp}`
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(createCustomBuildVersion(process.argv[2], process.argv[3]))
}
