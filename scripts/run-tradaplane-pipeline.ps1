$ErrorActionPreference = "Stop"

.venv312\Scripts\python.exe scraper\tradaplane_scraper.py
.venv312\Scripts\python.exe scraper\enrich_faa.py --source trade_a_plane
.venv312\Scripts\python.exe scraper\backfill_scores.py --from-source trade_a_plane
.venv312\Scripts\python.exe scraper\compute_market_comps.py
