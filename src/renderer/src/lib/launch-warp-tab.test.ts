import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppState } from '@/store/types'
import { toast } from 'sonner'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runProcess } from '../../../shared/child-process/run-process'
import { launchWarpTab, WINDOWS_WARP_AGENT_COMMAND } from './launch-warp-tab'

const mocks = vi.hoisted(() => ({
  launch: vi.fn(() => ({ tabId: 'warp-tab' })),
  platform: vi.fn((): NodeJS.Platform => 'win32')
}))
let state: AppState & { settings: NonNullable<AppState['settings']> }
vi.mock('@/store', () => ({ useAppStore: { getState: () => state } }))
vi.mock('./run-quick-command-in-new-tab', () => ({ runQuickCommandInNewTab: mocks.launch }))
vi.mock('./renderer-app-platform', () => ({ getRendererAppPlatform: mocks.platform }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

function setHost(hostId: string, platform?: NodeJS.Platform): void {
  state.repos = [{ id: 'repo', path: 'C:\\repo', executionHostId: hostId } as never]
  if (hostId.startsWith('runtime:') && platform) {
    state.runtimeStatusByEnvironmentId.set(hostId.slice(8), {
      status: { hostPlatform: platform }
    } as never)
  }
  if (hostId.startsWith('ssh:') && platform) {
    state.sshConnectionStates.set(hostId.slice(4), { remotePlatform: platform } as never)
  }
}

function expectLaunch(windows: boolean): void {
  launchWarpTab('repo::C:\\repo', 'pane-2')
  expect(mocks.launch).toHaveBeenCalledWith(
    expect.objectContaining({
      worktreeId: 'repo::C:\\repo',
      groupId: 'pane-2',
      historyId: null,
      shellOverride: windows ? 'powershell.exe' : undefined,
      command: expect.objectContaining({
        command: windows ? WINDOWS_WARP_AGENT_COMMAND : 'warp',
        appendEnter: true
      })
    })
  )
}

describe('launchWarpTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.platform.mockReturnValue('win32')
    state = {
      repos: [],
      projects: [],
      worktreesByRepo: {},
      detectedWorktreesByRepo: {},
      folderWorkspaces: [],
      projectGroups: [],
      settings: { activeRuntimeEnvironmentId: null, terminalWindowsShell: 'powershell.exe' },
      sshConnectionStates: new Map(),
      sshStateByEnvironment: new Map(),
      runtimeStatusByEnvironmentId: new Map(),
      restoredRuntimeHostIdByWorkspaceSessionKey: {}
    } as unknown as typeof state
    setHost('local')
  })

  it.each(['powershell.exe', 'cmd.exe', 'git-bash'])(
    'avoids desktop PATH resolution with %s selected',
    (shell) => {
      state.settings.terminalWindowsShell = shell
      expectLaunch(true)
      expect(WINDOWS_WARP_AGENT_COMMAND).toContain(
        "Join-Path $env:LOCALAPPDATA 'Warp/bin/warp.cmd'"
      )
      expect(WINDOWS_WARP_AGENT_COMMAND).toContain('Test-Path -LiteralPath')
      expect(WINDOWS_WARP_AGENT_COMMAND).toContain('Install the Warp Agent CLI on this host')
    }
  )

  it.each(['darwin', 'linux'] as const)('preserves the native CLI on %s', (platform) => {
    mocks.platform.mockReturnValue(platform)
    expectLaunch(false)
  })

  it('preserves the WSL shell default', () => {
    state.settings.terminalWindowsShell = 'wsl.exe'
    expectLaunch(false)
  })

  it('preserves the project WSL runtime with a native shell default', () => {
    state.worktreesByRepo = {
      repo: [{ id: 'repo::C:\\repo', repoId: 'repo', path: 'C:\\repo' } as never]
    }
    state.projects = [
      { id: 'repo', localWindowsRuntimePreference: { kind: 'wsl', distro: 'Ubuntu' } } as never
    ]
    expectLaunch(false)
  })

  it.each(['runtime:server', 'ssh:server'])(
    'uses Linux on %s even from a Windows client',
    (host) => {
      setHost(host, 'linux')
      expectLaunch(false)
    }
  )

  it.skipIf(process.platform !== 'win32')(
    'runs the Agent CLI despite a desktop launcher on PATH and reports a missing CLI',
    async () => {
      const fixture = mkdtempSync(join(tmpdir(), 'orca warp launch '))
      const cliDirectory = join(fixture, 'Warp', 'bin')
      mkdirSync(cliDirectory, { recursive: true })
      writeFileSync(join(fixture, 'warp.cmd'), '@echo off\r\necho DESKTOP_LAUNCHED\r\n')
      const cliPath = join(cliDirectory, 'warp.cmd')
      writeFileSync(cliPath, '@echo off\r\necho AGENT_CLI_STARTED\r\n')
      const spec = {
        program: 'powershell.exe',
        args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', WINDOWS_WARP_AGENT_COMMAND],
        env: {
          ...process.env,
          LOCALAPPDATA: fixture,
          Path: `${fixture};${process.env.Path ?? process.env.PATH}`
        },
        timeoutMs: 30_000
      }
      try {
        const installed = await runProcess(spec)
        expect(installed.code).toBe(0)
        expect(installed.stdout).toContain('AGENT_CLI_STARTED')
        expect(installed.stdout).not.toContain('DESKTOP_LAUNCHED')
        rmSync(cliPath)
        const missing = await runProcess(spec)
        expect(missing.stderr).toContain('Install the Warp Agent CLI on this host')
        expect(missing.stdout).not.toContain('DESKTOP_LAUNCHED')
      } finally {
        rmSync(fixture, { recursive: true, force: true })
      }
    }
  )

  it.each(['runtime:server', 'ssh:server'])(
    'uses Windows on %s even from a Linux client',
    (host) => {
      mocks.platform.mockReturnValue('linux')
      setHost(host, 'win32')
      expectLaunch(true)
    }
  )

  it('does not apply the client WSL preference to a Windows server', () => {
    state.settings.terminalWindowsShell = 'wsl.exe'
    setHost('runtime:server', 'win32')
    expectLaunch(true)
  })

  it('returns the created tab for menu focus restoration', () => {
    const onCreated = vi.fn()
    launchWarpTab('repo::C:\\repo', 'pane-2', onCreated)
    expect(onCreated).toHaveBeenCalledWith('warp-tab')
  })

  it.each(['runtime:server', 'ssh:server'])(
    'waits for the platform of %s instead of guessing from the client',
    (host) => {
      setHost(host)
      launchWarpTab('repo::C:\\repo')
      expect(mocks.launch).not.toHaveBeenCalled()
      expect(toast.error).toHaveBeenCalledWith(
        'Connect to the workspace host before opening a Warp tab.'
      )
    }
  )

  it.each([
    ['local', 'C:\\folder', true],
    ['local', '\\\\wsl.localhost\\Ubuntu\\home\\user', false],
    ['runtime:server', '/folder', false]
  ] as const)('launches a %s folder workspace at %s', (host, folderPath, windows) => {
    state.folderWorkspaces = [{ id: 'folder-1', folderPath, executionHostId: host } as never]
    if (host === 'runtime:server') {
      state.runtimeStatusByEnvironmentId.set('server', {
        status: { hostPlatform: 'linux' }
      } as never)
    }
    launchWarpTab('folder:folder-1')
    expect(mocks.launch).toHaveBeenCalledWith(
      expect.objectContaining({
        worktreeId: 'folder:folder-1',
        shellOverride: windows ? 'powershell.exe' : undefined,
        command: expect.objectContaining({ command: windows ? WINDOWS_WARP_AGENT_COMMAND : 'warp' })
      })
    )
  })
})
