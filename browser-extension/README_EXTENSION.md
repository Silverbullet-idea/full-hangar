# Full Hangar Harvester - Browser Extension

## What This Does
Harvests aircraft listings from Controller.com using your real logged-in browser
session, completely bypassing Distil Networks bot protection. Data is POSTed to
a local bridge server (`bridge_server.py`) which feeds the existing Supabase pipeline.

## Installation (Chrome/Brave)
1. Open Chrome/Brave -> Settings -> Extensions (or navigate to `chrome://extensions/`)
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked"
4. Select this `browser-extension/` folder
5. The Full Hangar Harvester extension will appear in your toolbar

## Before Using
1. Start the bridge server: `.venv312\Scripts\python.exe scraper\bridge_server.py`
2. Log into Controller.com in your browser (normal login, once)
3. Click the extension icon - the bridge status dot should turn green

## Harvest Modes
- **Cards Only**: Fast. Extracts data from search result cards (year, make, model,
  price, location, image). ~200+ listings per hour. Good for initial database population.
- **Cards + Details**: Thorough. Also visits each individual listing page to extract
  engine hours, avionics, serial number, full gallery. Slower (~40-80 listings/hr)
  but maximum data quality.

## Checkpoint & Resume
The extension saves progress to `chrome.storage`. If the browser closes mid-harvest,
click Resume in the popup to continue from the last make/page.

## Bridge Server
The bridge server (`bridge_server.py`) receives POSTed listings and runs them through
the existing Full Hangar pipeline:
- `parse_description()` for intelligence enrichment
- `validate_listing()` for schema validation
- `safe_upsert_with_fallback()` to Supabase

Check bridge logs at: `scraper/logs/bridge_server.log`
