import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { closeApp, launchInstalledApp } from './app-driver.mjs'
import { findDaemonProcesses } from './daemon-processes.mjs'

const executablePath = process.argv[2] ? path.resolve(process.argv[2]) : ''
if (!executablePath || !existsSync(executablePath)) {
  throw new Error('Usage: node packaged-startup-smoke.mjs <path-to-Orca.exe>')
}

const userDataDir = mkdtempSync(path.join(tmpdir(), 'orca-packaged-startup-'))
let app

try {
  const launched = await launchInstalledApp({ exePath: executablePath, userDataDir })
  app = launched.app
  const page = launched.page
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  try {
    await page.waitForFunction(
      () => (document.querySelector('#root')?.childElementCount ?? 0) > 0,
      undefined,
      { timeout: 30_000 }
    )
  } catch (error) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    const renderer = await page
      .evaluate(() => ({
        bodyText: (document.body?.innerText ?? '').slice(0, 1_000),
        rootChildren: document.querySelector('#root')?.childElementCount ?? 0,
        scripts: Array.from(document.scripts).map((script) => script.src)
      }))
      .catch(() => ({ bodyText: '', rootChildren: 0, scripts: [] }))
    throw new Error(
      `Packaged renderer did not mount: ${error.message}\n${JSON.stringify(
        { renderer, pageErrors },
        null,
        2
      )}`
    )
  }

  console.log('[packaged-startup-smoke] renderer mounted successfully')
} finally {
  await closeApp(app)
  try {
    for (const processInfo of findDaemonProcesses(userDataDir)) {
      try {
        execFileSync('taskkill', ['/pid', String(processInfo.pid), '/T', '/F'], { stdio: 'ignore' })
      } catch {
        // The isolated daemon may already have exited with the app.
      }
    }
  } catch {
    // Cleanup must not hide the renderer startup failure.
  }
  rmSync(userDataDir, { recursive: true, force: true })
}
