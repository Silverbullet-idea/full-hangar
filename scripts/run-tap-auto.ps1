# run-tap-auto.ps1
# Full Hangar — TAP Auto Scraper Runner
param(
    [string]$Category = "",
    [switch]$DryRun,
    [switch]$Resume,
    [switch]$CardsOnly,
    [switch]$RefreshScores,
    [int]$Limit = 0
)

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $ProjectRoot ".venv312\Scripts\python.exe"
$Script = Join-Path $ProjectRoot "scraper\tap_auto_scraper.py"
$LogDir = Join-Path $ProjectRoot "scraper\logs"

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }

$Args = @()
if ($Category) { $Args += "--category"; $Args += $Category }
if ($DryRun) { $Args += "--dry-run" }
if ($Resume) { $Args += "--resume" }
if ($CardsOnly) { $Args += "--cards-only" }
if ($RefreshScores) { $Args += "--refresh-scores" }
if ($Limit -gt 0) { $Args += "--limit"; $Args += $Limit }

$LogFile = Join-Path $LogDir "tap_auto_$(Get-Date -Format 'yyyyMMdd_HHmmss').log"
Write-Host "Starting TAP Auto Scraper..." -ForegroundColor Cyan
Write-Host "Log: $LogFile" -ForegroundColor Gray

& $Python $Script @Args 2>&1 | Tee-Object -FilePath $LogFile
