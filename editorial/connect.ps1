$ErrorActionPreference = 'Stop'
$env:PYTHONUTF8 = '1'
Set-Location -LiteralPath $PSScriptRoot
Write-Host 'Screener Editorial - private credential setup' -ForegroundColor Cyan
Write-Host 'Secret fields are hidden. Paste into this terminal only, never into chat.'
Write-Host ''
python setup.py
if ($LASTEXITCODE -eq 0) {
    Write-Host ''
    Write-Host 'Connection complete. Return to the chat and say: Connected.' -ForegroundColor Green
} else {
    Write-Host ''
    Write-Host 'Setup did not complete. Return to chat and describe the step that failed. Do not share tokens.' -ForegroundColor Yellow
}
Read-Host 'Press Enter to close this setup window'
