$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$logDir = Join-Path $repoRoot "scraper\logs"
$stateDir = Join-Path $repoRoot "scraper\state"
$alertLog = Join-Path $logDir "scheduled_task_alerts.log"
$stateFile = Join-Path $stateDir "scheduled_task_alert_digest_state.json"

New-Item -ItemType Directory -Path $logDir -Force | Out-Null
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null

if (!(Test-Path $alertLog)) {
  if (!(Test-Path $stateFile)) {
    @{ processed_line_count = 0; updated_at = (Get-Date).ToString("s") } |
      ConvertTo-Json |
      Set-Content -Path $stateFile -Encoding UTF8
  }
  exit 0
}

$lines = Get-Content -Path $alertLog -ErrorAction Stop
$total = $lines.Count

$processed = 0
if (Test-Path $stateFile) {
  try {
    $state = Get-Content -Path $stateFile -Raw | ConvertFrom-Json
    $processed = [int]($state.processed_line_count)
  } catch {
    $processed = 0
  }
}

if ($processed -gt $total) {
  $processed = 0
}

$newCount = $total - $processed
if ($newCount -le 0) {
  exit 0
}

$newLines = $lines[$processed..($total - 1)]
$preview = ($newLines | Select-Object -Last 3) -join "`n"
$title = "Full Hangar Scheduler Alerts"
$body = "$newCount new scheduled-task error alert(s) detected."

try {
  Import-Module BurntToast -ErrorAction Stop
  New-BurntToastNotification -Text $title, $body, $preview | Out-Null
} catch {
  try {
    msg * "$title`n$body`nCheck scraper\\logs\\scheduled_task_alerts.log"
  } catch {
    # Final fallback: event log only.
    try {
      eventcreate /T WARNING /ID 2110 /L APPLICATION /SO FullHangar /D "$body" | Out-Null
    } catch {
      # If all notification channels fail, silently continue and rely on file logging.
    }
  }
}

@{
  processed_line_count = $total
  updated_at = (Get-Date).ToString("s")
} | ConvertTo-Json | Set-Content -Path $stateFile -Encoding UTF8

