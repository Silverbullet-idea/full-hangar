# One-time registration of the weekly ASO new-listings scheduled task.
# Run in an elevated (Administrator) PowerShell if required by your machine policy.

$ErrorActionPreference = "Stop"

$root = "D:\Documents\Full Hangar\2.0\CursorReposity\full-hangar"
$scriptPath = Join-Path $root "scripts\run_aso_newonly.ps1"
$taskName = "FullHangar_ASO_Weekly"

$argLine = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argLine -WorkingDirectory $root

# Weekly, Wednesday 9:00 AM (local time)
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Wednesday -At "9:00AM"

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

Write-Host "Scheduled tasks that run whether the user is logged on or not require stored credentials."
$cred = Get-Credential -Message "Enter the Windows account and password for FullHangar_ASO_Weekly (same box as 'Run whether user is logged on or not')."

$principal = New-ScheduledTaskPrincipal -UserId $cred.UserName -LogonType Password -RunLevel Highest

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Weekly ASO new aircraft listings scrape for FullHangar" `
    -User $cred.UserName `
    -Password $cred.GetNetworkCredential().Password

Write-Host ""
Write-Host "Task registered. To verify: Open Task Scheduler > Task Scheduler Library > FullHangar_ASO_Weekly. To test immediately: Right-click > Run."
