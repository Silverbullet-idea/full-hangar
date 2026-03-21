$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot
$logDir = Join-Path $repoRoot "scraper\logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$logFile = Join-Path $logDir "aso_new_only_$timestamp.log"
$alertFile = Join-Path $logDir "scheduled_task_alerts.log"

function Write-Alert([string]$message) {
  $line = "$(Get-Date -Format s) [ASO_NEW_ONLY][ERROR] $message"
  Add-Content -Path $alertFile -Value $line
  try {
    eventcreate /T ERROR /ID 2101 /L APPLICATION /SO FullHangar /D "$message" | Out-Null
  } catch {
    # Fallback to file-only alerting when event log write is unavailable.
  }
}

try {
  Start-Transcript -Path $logFile -Force | Out-Null
  Write-Host "Starting ASO new-only maintenance pass..."
  & .venv312\Scripts\python.exe scraper\aso_scraper.py `
    --detail `
    --only-new `
    --delay-min 3 `
    --delay-max 6 `
    --page-delay-min 5 `
    --page-delay-max 10 `
    --detail-delay-min 4 `
    --detail-delay-max 9
  if ($LASTEXITCODE -ne 0) {
    throw "ASO new-only run exited with code $LASTEXITCODE"
  }
  Write-Host "ASO new-only maintenance pass complete."
} catch {
  $msg = "ASO new-only scheduled task failed. $_"
  Write-Error $msg
  Write-Alert $msg
  exit 1
} finally {
  try { Stop-Transcript | Out-Null } catch {}
}

