param(
  [string]$OutputDir = (Join-Path $env:TEMP 'orca-installer-build-custom-latest'),
  [string]$UpdateOwner = '',
  [string]$UpdateRepo = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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

function Assert-File {
  param([string]$Path)
  if (!(Test-Path -LiteralPath $Path)) {
    throw "Expected file was not created: $Path"
  }
}

$installer = Join-Path $OutputDir 'orca-windows-setup.exe'
$blockMap = "$installer.blockmap"
$manifest = Join-Path $OutputDir 'latest.yml'

Assert-File -Path $installer
Assert-File -Path $blockMap
Assert-File -Path $manifest

$manifestText = Get-Content -LiteralPath $manifest -Raw
$versionMatch = [regex]::Match($manifestText, '(?m)^version:\s*(.+)$')
if (!$versionMatch.Success) {
  throw "latest.yml does not contain a version."
}
$version = $versionMatch.Groups[1].Value.Trim()
if ($version -notmatch '^\d+\.\d+\.\d+-custom\.\d{14}$') {
  throw "latest.yml version is not a stamped custom version: $version"
}
if ($manifestText -notmatch '(?m)^path:\s*orca-windows-setup\.exe\s*$') {
  throw "latest.yml does not point at orca-windows-setup.exe."
}

if ($UpdateOwner.Length -gt 0 -or $UpdateRepo.Length -gt 0) {
  if ($UpdateOwner.Length -eq 0 -or $UpdateRepo.Length -eq 0) {
    throw 'UpdateOwner and UpdateRepo must be provided together.'
  }
  $env:ORCA_UPDATE_OWNER = $UpdateOwner
  $env:ORCA_UPDATE_REPO = $UpdateRepo
  $actualRepo = Invoke-NativeOutput node @(
    '-e',
    "const c=require('./config/electron-builder.config.cjs'); console.log(c.publish.owner + '/' + c.publish.repo)"
  )
  $expectedRepo = "$UpdateOwner/$UpdateRepo"
  if ($actualRepo -ne $expectedRepo) {
    throw "Electron-builder publish repo is $actualRepo, expected $expectedRepo."
  }
}

$stream = [System.IO.File]::OpenRead($installer)
try {
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  $hashBytes = $sha256.ComputeHash($stream)
  $hash = [System.BitConverter]::ToString($hashBytes).Replace('-', '')
} finally {
  $stream.Dispose()
}

Write-Host "Verified custom installer metadata"
Write-Host "Version: $version"
if ($UpdateOwner.Length -gt 0) {
  Write-Host "Update feed: $UpdateOwner/$UpdateRepo"
}
Write-Host "SHA-256: $hash"
