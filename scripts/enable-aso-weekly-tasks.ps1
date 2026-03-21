$ErrorActionPreference = "Stop"

$weeklyTasks = @(
  "FullHangar_ASO_NewOnly_Weekly",
  "FullHangar_ASO_RecentAware_Weekly"
)

$oneTimeTasks = @(
  "FullHangar_ASO_NewOnly_20260321",
  "FullHangar_ASO_RecentAware_20260321"
)

foreach ($taskName in $weeklyTasks) {
  Enable-ScheduledTask -TaskName $taskName | Out-Null
}

foreach ($taskName in $oneTimeTasks) {
  Disable-ScheduledTask -TaskName $taskName | Out-Null
}

Write-Output "Weekly ASO tasks enabled and one-time tasks disabled."

