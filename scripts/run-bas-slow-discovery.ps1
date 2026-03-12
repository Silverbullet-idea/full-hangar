$ErrorActionPreference = "Stop"

Write-Host "Starting BAS slow discovery (7-hour default)..."
& .venv312\Scripts\python.exe scraper\bas_slow_discovery.py `
  --hours 7 `
  --max-pages 2 `
  --max-details 35 `
  --request-sleep-min 0.8 `
  --request-sleep-max 2.2 `
  --cycle-pause-min-seconds 600 `
  --cycle-pause-max-seconds 1800

Write-Host "BAS slow discovery completed."

