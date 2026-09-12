# Builds the Firefox (AMO) package for Screener Pro.
# Usage: powershell -ExecutionPolicy Bypass -File dev-tools/build-firefox.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src = $root

$manifest = Get-Content (Join-Path $src 'manifest.json') -Raw | ConvertFrom-Json
$version = $manifest.version

$stage = Join-Path ([System.IO.Path]::GetTempPath()) 'screener-firefox-build'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

$files = @('background.js','sidepanel.html','sidepanel.js','style.css','ticker_tape.js','ticker_tape.css','icon_16.png','icon_48.png','icon_128.png','bmc_qr.png','manifest.json')
foreach ($f in $files) {
  $p = Join-Path $src $f
  if (!(Test-Path $p)) { throw "Missing required file: $f" }
  Copy-Item $p (Join-Path $stage $f) -Force
}
$localesSrc = Join-Path $src '_locales'
if (!(Test-Path $localesSrc)) { throw 'Missing required dir: _locales' }
Copy-Item $localesSrc (Join-Path $stage '_locales') -Recurse -Force

# Validate Firefox manifest parses and has required keys
$m = Get-Content (Join-Path $stage 'manifest.json') -Raw | ConvertFrom-Json
foreach ($k in @('manifest_version','name','version','sidebar_action','background')) {
  if ($null -eq $m.$k) { throw "Firefox manifest missing key: $k" }
}
if ($null -eq $m.browser_specific_settings.gecko.id) { throw 'Firefox manifest missing gecko id' }

$dest = Join-Path $root "Screener-Extension-Firefox-v$version.zip"
if (Test-Path $dest) { Remove-Item $dest -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $dest -Force
$item = Get-Item $dest
Write-Host "Built $($item.Name) ($([math]::Round($item.Length/1KB,1)) KB)"
