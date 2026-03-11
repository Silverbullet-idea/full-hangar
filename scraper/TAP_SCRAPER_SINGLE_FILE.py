from __future__ import annotations

"""
TAP_SCRAPER_SINGLE_FILE.py
==========================

Single-file TAP handoff artifact.

What this file provides:
1) Executable scraper entrypoint (delegates to `tradaplane_scraper.py`).
2) Consolidated TAP operational knowledge/playbook via `--playbook`.

Usage:
  # Show TAP learnings and operational guidance
  .venv312\\Scripts\\python.exe scraper\\TAP_SCRAPER_SINGLE_FILE.py --playbook

  # Run scraper exactly like tradaplane_scraper.py
  .venv312\\Scripts\\python.exe scraper\\TAP_SCRAPER_SINGLE_FILE.py --dry-run --category "Multi-Engine Piston" --limit 10

  # Probe live URL
  .venv312\\Scripts\\python.exe scraper\\TAP_SCRAPER_SINGLE_FILE.py --dry-run --probe-url "https://www.trade-a-plane.com/search?listing_id=2444404&s-type=aircraft"

  # Probe saved HTML fallback
  .venv312\\Scripts\\python.exe scraper\\TAP_SCRAPER_SINGLE_FILE.py --probe-html "scraper/state/tap_probe_good.html" --probe-write
"""

import asyncio
import sys

from tradaplane_scraper import main as tap_main


TAP_PLAYBOOK = """
Trade-A-Plane (TAP) Scraping Playbook
=====================================

Current observed behavior
-------------------------
- TAP list pages are usually reachable; detail pages are intermittently hard-blocked by anti-bot.
- Account login can succeed while detail fetch is still blocked.
- Cookie reuse helps but does not guarantee detail access.

Implemented anti-bot and resiliency controls
--------------------------------------------
- Playwright-based browsing context with realistic UA and viewport.
- Optional TAP login before scrape:
  --tap-login + --tap-username/--tap-password
  (or TAP_USERNAME / TAP_PASSWORD env vars).
- Human-like warmup interactions:
  randomized mouse movement, scrolls, and pauses.
- Adaptive block handling:
  --block-retry-seconds
  --max-block-streak
  --page-delay-min
  --page-delay-max
- Resume/chunk controls:
  --start-page
  --max-pages

Detail extraction implemented
-----------------------------
- Canonical fields:
  engine_count
  time_since_overhaul
  time_since_prop_overhaul
  second_engine_time_since_overhaul
  second_time_since_prop_overhaul
  engines_raw (JSON payload)
  props_raw (JSON payload)

- Parsing sources:
  1) Engine/prop spec tables (TSO/TSN/SPOH style).
  2) Fallback from #general_specs labels:
     Engine 1 Time / Engine 2 Time
     Prop 1 Time / Prop 2 Time
     including values like "428 HOURS" or "850 SNEW".

Fallback workflow for blocked detail pages
------------------------------------------
- If live detail is blocked, save browser page source and ingest via:
  --probe-html <file>

- Batch ingest manual saved files:
  --probe-html-dir <dir>
  --probe-html-glob <glob>
  --probe-batch-limit <n>
  --probe-write

- Batch mode deduplicates by listing_id/source_id in each run to avoid repeated writes.

Known-good command patterns
---------------------------
1) Login + single listing probe dry-run:
   .venv312\\Scripts\\python.exe scraper\\TAP_SCRAPER_SINGLE_FILE.py --dry-run --tap-login --probe-url "https://www.trade-a-plane.com/search?listing_id=2444404&s-type=aircraft"

2) Manual HTML probe write:
   .venv312\\Scripts\\python.exe scraper\\TAP_SCRAPER_SINGLE_FILE.py --probe-html "scraper/state/tap_probe_good.html" --probe-write

3) Manual HTML batch write:
   .venv312\\Scripts\\python.exe scraper\\TAP_SCRAPER_SINGLE_FILE.py --probe-html-dir "scraper/state" --probe-html-glob "tap_probe_*.html" --probe-batch-limit 5 --probe-write

Operational guidance
--------------------
- Preferred path remains direct detail scraping (fully automated).
- Current practical path during anti-bot pressure is mixed-mode:
  list sweep + targeted manual HTML detail ingestion for multi-engine rows.
- Rotate session/cookies/IP window when prolonged detail blocking persists.
"""


def run() -> None:
    if "--playbook" in sys.argv:
        print(TAP_PLAYBOOK.strip())
        return
    asyncio.run(tap_main())


if __name__ == "__main__":
    run()

