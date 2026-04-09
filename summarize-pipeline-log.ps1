# npm run pipeline:summary — tail recent scraper logs and highlight KPI-style lines.
param(
  [string] $LogPath = "",
  [int] $TailLines = 120
)

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot
$logDir = Join-Path $RepoRoot "scraper\logs"

if (-not (Test-Path $logDir)) {
  Write-Warning "No scraper\logs directory at $logDir"
  exit 0
}

if (-not $LogPath) {
  $latest = Get-ChildItem -Path $logDir -File -Filter "*.log" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $latest) {
    Write-Host "No log files in $logDir"
    exit 0
  }
  $LogPath = $latest.FullName
}

Write-Host "Log: $LogPath" -ForegroundColor Cyan
Get-Content -LiteralPath $LogPath -Tail $TailLines -ErrorAction Stop

Write-Host "`n--- Pattern highlights ---" -ForegroundColor DarkCyan
Select-String -LiteralPath $LogPath -Pattern "Backfill summary|ERROR|WARNING|Done:|Saved:|matched=" -ErrorAction SilentlyContinue |
  Select-Object -Last 40 |
  ForEach-Object { $_.Line }
