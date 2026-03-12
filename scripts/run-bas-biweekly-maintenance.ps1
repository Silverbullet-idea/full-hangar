$ErrorActionPreference = "Stop"

Write-Host "Starting BAS biweekly maintenance pass..."
& .venv312\Scripts\python.exe scraper\avionics_bas_scraper.py `
  --categories all `
  --max-pages 2 `
  --max-details 40 `
  --sleep-min 0.8 `
  --sleep-max 2.2 `
  --out scraper\data\avionics\inventory_extracts\bas_part_sales.json

Write-Host "BAS biweekly maintenance pass complete."

