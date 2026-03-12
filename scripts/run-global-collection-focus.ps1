$ErrorActionPreference = "Stop"

Write-Host "Starting Global collection=avionics focus pipeline..."
& .venv312\Scripts\python.exe scraper\avionics_global_scraper.py
& .venv312\Scripts\python.exe scraper\avionics_price_consolidator.py
& .venv312\Scripts\python.exe scraper\avionics_price_ingest.py
Write-Host "Global collection focus pipeline complete."

