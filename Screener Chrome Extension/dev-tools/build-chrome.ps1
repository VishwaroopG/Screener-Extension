# Builds the Chrome Web Store package for Ticker Screener.
# Usage: powershell -ExecutionPolicy Bypass -File dev-tools/build-chrome.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'extension-code'

$manifest = Get-Content (Join-Path $src 'manifest.json') -Raw | ConvertFrom-Json
$version = $manifest.version

$stage = Join-Path ([System.IO.Path]::GetTempPath()) 'screener-chrome-build'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

Copy-Item (Join-Path $src '*') $stage -Recurse -Force

# Minify locale files in the package only (sources stay readable).
# NOTE: uses node on purpose — PowerShell ConvertTo-Json escapes all
# non-ASCII as \uXXXX, which makes CJK/Indic/Arabic files BIGGER.
node (Join-Path $PSScriptRoot 'minify-locales.cjs') $stage
if ($LASTEXITCODE -ne 0) { throw 'Locale minify failed' }

# Validate Chrome manifest parses and has required keys
$m = Get-Content (Join-Path $stage 'manifest.json') -Raw | ConvertFrom-Json
foreach ($k in @('manifest_version','name','version','side_panel','background')) {
  if ($null -eq $m.$k) { throw "Chrome manifest missing key: $k" }
}

$dest = Join-Path $root "Screener-Extension-v$version.zip"
if (Test-Path $dest) { Remove-Item $dest -Force }
# NOTE: Do NOT use Compress-Archive — it stores Windows backslash paths
# which violates the ZIP spec. Use .NET with forward-slash entry names.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($dest, 'Create')
try {
  Get-ChildItem -Path $stage -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($stage.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel, 'Optimal') | Out-Null
  }
} finally {
  $zip.Dispose()
}
$item = Get-Item $dest
Write-Host "Built $($item.Name) ($([math]::Round($item.Length/1KB,1)) KB)"
