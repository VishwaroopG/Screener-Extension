# Releases a new extension version to both stores in one command.
#
#   powershell -ExecutionPolicy Bypass -File .github/scripts/release-extension.ps1 2.6.12
#   powershell -ExecutionPolicy Bypass -File .github/scripts/release-extension.ps1 -Bump patch
#
# Sets the version in the Chrome and Firefox manifests, commits, and pushes to
# main. The push triggers .github/workflows/publish-extension.yml, which builds,
# tests and submits the packages to the Chrome Web Store and Firefox Add-ons.
param(
  [Parameter(Position = 0)] [string] $Version,
  [ValidateSet('patch', 'minor', 'major')] [string] $Bump,
  [switch] $NoPush
)
$ErrorActionPreference = 'Stop'
$repo = (git rev-parse --show-toplevel).Trim()
$manifests = @(
  (Join-Path $repo 'Screener Chrome Extension/extension-code/manifest.json'),
  (Join-Path $repo 'Screener  Firefox extension/manifest.json')
)

$current = (Get-Content $manifests[0] -Raw | ConvertFrom-Json).version
$other = (Get-Content $manifests[1] -Raw | ConvertFrom-Json).version
if ($current -ne $other) { Write-Warning "Manifests currently differ (Chrome $current, Firefox $other); both will be set." }

if (-not $Version) {
  if (-not $Bump) { throw 'Give a version (e.g. 2.6.12) or -Bump patch|minor|major.' }
  $p = $current.Split('.') | ForEach-Object { [int]$_ }
  while ($p.Count -lt 3) { $p += 0 }
  switch ($Bump) {
    'major' { $p = @(($p[0] + 1), 0, 0) }
    'minor' { $p = @($p[0], ($p[1] + 1), 0) }
    'patch' { $p = @($p[0], $p[1], ($p[2] + 1)) }
  }
  $Version = ($p[0..2]) -join '.'
}
if ($Version -notmatch '^\d+(\.\d+){1,3}$') { throw "Not a valid extension version: $Version" }
if ([version]$Version -le [version]$current) { throw "New version $Version must be higher than $current." }

if (git status --porcelain -- $manifests) { throw 'A manifest has uncommitted changes; commit or revert them first.' }
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne 'main') { throw "Releases go from main (current branch: $branch)." }

$utf8 = New-Object System.Text.UTF8Encoding($false)
foreach ($m in $manifests) {
  $text = [System.IO.File]::ReadAllText($m)
  $updated = [regex]::new('"version"\s*:\s*"[^"]*"').Replace($text, "`"version`": `"$Version`"", 1)
  [System.IO.File]::WriteAllText($m, $updated, $utf8)
}

git add -- $manifests
git commit -m "Release extension v$Version" | Out-Null
Write-Host "Committed v$Version ($current -> $Version)."
if ($NoPush) {
  Write-Host 'Not pushed (-NoPush). Push main to publish.'
} else {
  git pull --rebase origin main
  git push origin main
  Write-Host "Pushed. Publishing runs in GitHub Actions: gh run watch, or the repo's Actions tab."
}
