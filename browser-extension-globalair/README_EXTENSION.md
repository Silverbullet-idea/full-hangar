# Full Hangar Harvester - GlobalAir Extension

## What This Does
Harvests aircraft listings from GlobalAir using your real logged-in browser
session and posts extracted payloads to a dedicated local bridge server
(`bridge_server_globalair.py`) for Supabase ingestion.

This extension is intentionally separate from the existing Controller extension.

## Installation (Chrome/Brave)
1. Open browser extensions page (`chrome://extensions/`)
2. Enable Developer mode
3. Click Load unpacked
4. Select `browser-extension-globalair/`

## Before Using
1. Start bridge: `.venv312\Scripts\python.exe scraper\bridge_server_globalair.py`
2. Visit/log into GlobalAir normally in your browser
3. Open extension popup and verify bridge status is green

## Harvest Modes
- Cards Only: expands load-more and ingests list-card fields quickly
- Cards + Details: also opens each detail page for fuller spec extraction

## Notes
- Default bridge port is `8766` (kept separate from Controller bridge `8765`)
- Progress is stored in `chrome.storage.local` under `globalAirHarvestState`
