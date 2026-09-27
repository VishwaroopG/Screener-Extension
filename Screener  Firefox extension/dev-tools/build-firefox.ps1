# Builds the Firefox (AMO) package for Ticker Screener.
# Usage: powershell -ExecutionPolicy Bypass -File dev-tools/build-firefox.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src = $root

$manifest = Get-Content (Join-Path $src 'manifest.json') -Raw | ConvertFrom-Json
$version = $manifest.version

$stage = Join-Path ([System.IO.Path]::GetTempPath()) 'screener-firefox-build'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

$files = @('background.js','sidepanel.html','sidepanel.js','style.css','ticker_tape.js','ticker_tape.css','welcome.html','welcome.js','icon_16.png','icon_48.png','icon_128.png','bmc_qr.png','manifest.json')
foreach ($f in $files) {
  $p = Join-Path $src $f
  if (!(Test-Path $p)) { throw "Missing required file: $f" }
  Copy-Item $p (Join-Path $stage $f) -Force
}
$localesSrc = Join-Path $src '_locales'
if (!(Test-Path $localesSrc)) { throw 'Missing required dir: _locales' }
Copy-Item $localesSrc (Join-Path $stage '_locales') -Recurse -Force

# Minify locale files, JS, CSS, and HTML in the staged package (sources stay readable).
node (Join-Path $PSScriptRoot 'minify-package.cjs') $stage
if ($LASTEXITCODE -ne 0) { throw 'Package minification failed' }

# Validate Firefox manifest parses and has required keys
$m = Get-Content (Join-Path $stage 'manifest.json') -Raw | ConvertFrom-Json
foreach ($k in @('manifest_version','name','version','sidebar_action','background')) {
  if ($null -eq $m.$k) { throw "Firefox manifest missing key: $k" }
}
if ($null -eq $m.browser_specific_settings.gecko.id) { throw 'Firefox manifest missing gecko id' }

$dest = Join-Path $root "Screener-Extension-Firefox-v$version.zip"
if (Test-Path $dest) { Remove-Item $dest -Force }
# NOTE: Do NOT use Compress-Archive here — it stores Windows backslash paths
# (_locales\am\messages.json) which AMO rejects as "Invalid file name in archive".
# Build the zip via .NET with explicit forward-slash entry names instead.
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
