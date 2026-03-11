# run-extension-bridge-globalair.ps1
# Starts the Full Hangar GlobalAir bridge server for the browser extension harvester
param([switch]$DryRun)

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $ProjectRoot ".venv312\Scripts\python.exe"
$Script = Join-Path $ProjectRoot "scraper\bridge_server_globalair.py"
$LogDir = Join-Path $ProjectRoot "scraper\logs"

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }

Write-Host "Starting Full Hangar GlobalAir Extension Bridge Server..." -ForegroundColor Cyan
Write-Host "Logs: scraper/logs/bridge_server_globalair.log" -ForegroundColor Gray
Write-Host "Press Ctrl+C to stop." -ForegroundColor Gray

if ($DryRun) {
    & $Python $Script --dry-run
} else {
    & $Python $Script
}
