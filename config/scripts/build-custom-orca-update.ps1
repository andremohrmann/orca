param(
  [string]$Branch = 'custom/orca-dashboard-live-view',
  [string]$Upstream = 'origin/main',
  [string]$OutputDir = (Join-Path $env:TEMP 'orca-installer-build-custom-latest'),
  [string]$UpdateOwner = '',
  [string]$UpdateRepo = '',
  [switch]$StampCustomVersion,
  [switch]$SkipValidation,
  [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Native {
  param(
    [string]$Label,
    [string]$FilePath,
    [string[]]$Arguments
  )
  Write-Host "`n==> $Label"
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE."
  }
}

function Invoke-NativeOutput {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )
  $output = & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
  }
  return ($output | Out-String).Trim()
}

function Enable-Node24IfAvailable {
  $candidates = @()
  if ($env:ORCA_NODE24_BIN) {
    $candidates += $env:ORCA_NODE24_BIN
  }
  $candidates += 'C:\Program Files (x86)\Nodist\v-x64\24.6.0'
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath (Join-Path $candidate 'node.exe')) {
      $env:Path = "$candidate;$env:Path"
      return
    }
  }
  Write-Warning 'Node 24 was not found. Set ORCA_NODE24_BIN to a Node 24 directory if pnpm reports an engine mismatch.'
}

function Assert-CleanWorktree {
  $status = Invoke-NativeOutput git @('status', '--porcelain')
  if ($status.Length -gt 0) {
    throw "Worktree has uncommitted changes. Commit or stash them before rebasing your custom Orca patch.`n$status"
  }
}

function Rebase-CustomBranch {
  param(
    [string]$BranchName,
    [string]$UpstreamRef
  )
  $remoteParts = $UpstreamRef.Split('/')
  $remoteName = if ($remoteParts.Length -gt 1) { $remoteParts[0] } else { 'origin' }
  if ($remoteParts.Length -gt 1) {
    $remoteBranch = ($remoteParts | Select-Object -Skip 1) -join '/'
    Invoke-Native "Fetch $remoteName/$remoteBranch" git @(
      'fetch',
      $remoteName,
      "+refs/heads/$remoteBranch`:refs/remotes/$remoteName/$remoteBranch"
    )
  } else {
    Invoke-Native "Fetch $remoteName updates" git @('fetch', $remoteName)
  }
  $currentBranch = Invoke-NativeOutput git @('branch', '--show-current')
  if ($currentBranch -ne $BranchName) {
    Invoke-Native "Switch to $BranchName" git @('switch', $BranchName)
  }
  Invoke-NativeOutput git @('rev-parse', '--verify', $UpstreamRef) | Out-Null
  & git merge-base --is-ancestor $UpstreamRef HEAD
  if ($LASTEXITCODE -eq 0) {
    Write-Host "`n==> Custom branch already contains $UpstreamRef"
    return
  }
  if ($LASTEXITCODE -ne 1) {
    throw "Could not compare $BranchName with $UpstreamRef."
  }
  Write-Host "`n==> Rebase $BranchName onto $UpstreamRef"
  & git rebase $UpstreamRef
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Rebase stopped. Resolve conflicts, run 'git rebase --continue', then rerun this script."
    exit $LASTEXITCODE
  }
}

function Set-CustomBuildVersion {
  $package = Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json
  $match = [regex]::Match($package.version, '^(\d+)\.(\d+)\.(\d+)')
  if (!$match.Success) {
    throw "package.json version '$($package.version)' is not a supported semver base."
  }
  $patch = [int]$match.Groups[3].Value + 1
  $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss')
  $version = "$($match.Groups[1].Value).$($match.Groups[2].Value).$patch-custom.$stamp"
  $env:ORCA_LOCAL_BUILD_VERSION = $version
  Write-Host "`n==> Custom update version $version"
}

function Build-Installer {
  param([string]$TargetDir)
  New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
  Invoke-Native 'Build release artifacts' pnpm @('run', 'build:release')
  Invoke-Native 'Package Windows installer' pnpm @(
    'exec',
    'electron-builder',
    '--config',
    'config/electron-builder.config.cjs',
    '--win',
    '--publish',
    'never',
    '--config.npmRebuild=false',
    "--config.directories.output=$TargetDir"
  )
  $installer = Join-Path $TargetDir 'orca-windows-setup.exe'
  if (!(Test-Path -LiteralPath $installer)) {
    throw "Installer was not created at $installer."
  }
  $stream = [System.IO.File]::OpenRead($installer)
  try {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $hashBytes = $sha256.ComputeHash($stream)
    $hash = [System.BitConverter]::ToString($hashBytes).Replace('-', '')
  } finally {
    $stream.Dispose()
  }
  $length = (Get-Item -LiteralPath $installer).Length
  Write-Host "`nInstaller: $installer"
  Write-Host "SHA-256: $hash"
  Write-Host "Bytes: $length"
  $verifyArgs = @(
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    'config/scripts/verify-custom-orca-update.ps1',
    '-OutputDir',
    $TargetDir
  )
  if ($env:ORCA_UPDATE_OWNER -and $env:ORCA_UPDATE_REPO) {
    $verifyArgs += @('-UpdateOwner', $env:ORCA_UPDATE_OWNER, '-UpdateRepo', $env:ORCA_UPDATE_REPO)
  }
  Invoke-Native 'Verify custom installer update metadata' powershell $verifyArgs
}

$repoRoot = Invoke-NativeOutput git @('rev-parse', '--show-toplevel')
Set-Location -LiteralPath $repoRoot
Enable-Node24IfAvailable
Assert-CleanWorktree
Rebase-CustomBranch -BranchName $Branch -UpstreamRef $Upstream

if ($StampCustomVersion) {
  Set-CustomBuildVersion
}
if ($UpdateOwner.Length -gt 0) {
  $env:ORCA_UPDATE_OWNER = $UpdateOwner
}
if ($UpdateRepo.Length -gt 0) {
  $env:ORCA_UPDATE_REPO = $UpdateRepo
}

if (!$SkipValidation) {
  Invoke-Native 'Validate web types' pnpm @('run', 'typecheck:web')
  Invoke-Native 'Run dashboard focused tests' pnpm @(
    'exec',
    'vitest',
    'run',
    '--config',
    'config/vitest.config.ts',
    'src/main/ipc/dashboard-popout.test.ts',
    'src/renderer/src/components/dashboard-popout/AgentKanbanBoard.test.tsx',
    'src/renderer/src/components/dashboard-popout/AgentKanbanCard.test.tsx',
    'src/renderer/src/components/dashboard/AgentDashboardDrawer.test.tsx',
    'src/renderer/src/components/dashboard/useDashboardPopoutBridge.test.tsx'
  )
}

if (!$SkipBuild) {
  Build-Installer -TargetDir $OutputDir
}
