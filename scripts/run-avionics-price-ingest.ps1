# Avionics price ingest pipeline
# Run this periodically (monthly) to refresh used-inventory pricing.
Write-Host "Starting avionics price ingest pipeline..."
& .venv312\Scripts\python.exe scraper\avionics_pdf_extractor.py
& .venv312\Scripts\python.exe scraper\avionics_global_scraper.py
& .venv312\Scripts\python.exe scraper\avionics_bennett_scraper.py
& .venv312\Scripts\python.exe scraper\avionics_pacific_scraper.py
& .venv312\Scripts\python.exe scraper\avionics_price_consolidator.py
& .venv312\Scripts\python.exe scraper\avionics_price_ingest.py
Write-Host "Avionics price ingest complete."
