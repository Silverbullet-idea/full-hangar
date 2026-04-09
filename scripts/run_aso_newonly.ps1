# Weekly ASO new-listings scrape wrapper for Task Scheduler.
Set-Location "D:\Documents\Full Hangar\2.0\CursorReposity\full-hangar"

$python = "D:\Documents\Full Hangar\2.0\CursorReposity\full-hangar\.venv312\Scripts\python.exe"
$root = "D:\Documents\Full Hangar\2.0\CursorReposity\full-hangar"
$logDir = Join-Path $root "logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$date = Get-Date -Format "yyyy-MM-dd"
$logFile = Join-Path $logDir "aso_newonly_$date.log"

& $python scraper\aso_scraper.py --newonly --verbose 2>&1 | Out-File -FilePath $logFile -Encoding utf8
$code = $LASTEXITCODE

$summary = "ASO new listings run finished. Exit code: $code. Log: logs\aso_newonly_$date.log"
Add-Content -Path $logFile -Value $summary
Write-Output $summary

exit $code
