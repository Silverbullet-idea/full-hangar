# Register a weekly local scheduled task to run ASO media refresh (current user).
# Requires: Task Scheduler permission; run PowerShell as needed.
$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runner = Join-Path $PSScriptRoot "run-aso-media-refresh.ps1"
$taskName = "FullHangar_ASO_MediaRefresh_Weekly"

$arg = "-NoProfile -ExecutionPolicy Bypass -File `"$runner`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arg -WorkingDirectory $RepoRoot
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 3:00AM
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

try {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
} catch {}

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Full Hangar: ASO media/gallery refresh" | Out-Null
Write-Host "Registered scheduled task: $taskName (Sundays 03:00)" -ForegroundColor Green
