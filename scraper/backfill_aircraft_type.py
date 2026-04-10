"""
One-off backfill: set aircraft_listings.aircraft_type when missing, using URL/raw_data heuristics.

  .venv312\\Scripts\\python.exe scraper\\backfill_aircraft_type.py --dry-run
  .venv312\\Scripts\\python.exe scraper\\backfill_aircraft_type.py --apply

See listing_category_infer.py for inference rules (Controller Category=, /listings/for-sale/ slugs,
GlobalAir /aircraft-for-sale/{slug}/, TAP category_level1 query + tap_category_level1 in raw_data).

Rows with no inferable signal are skipped (logged in summary).
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from listing_category_infer import infer_aircraft_type_from_listing_fields
from scraper_base import get_supabase, setup_logging

log = logging.getLogger(__name__)

DEFAULT_BATCH = 400
TARGET_SITES = ("controller", "globalair", "trade_a_plane")


def run_backfill(
    *,
    dry_run: bool,
    apply: bool,
    source_site: str | None,
    limit: int | None,
    batch_size: int,
) -> None:
    supabase = get_supabase()
    site_filter = (source_site or "").strip().lower() or None
    if site_filter and site_filter not in TARGET_SITES:
        raise SystemExit(f"--source-site must be one of: {', '.join(TARGET_SITES)}")

    scanned = 0
    inferred = 0
    updated = 0
    skipped_no_signal = 0
    last_id: Any = None

    while True:
        if limit is not None and inferred >= limit:
            break
        q = supabase.table("aircraft_listings").select("id,source_site,url,source_url,raw_data,aircraft_type")
        if site_filter:
            q = q.eq("source_site", site_filter)
        else:
            q = q.in_("source_site", list(TARGET_SITES))
        q = q.is_("aircraft_type", "null").order("id").limit(batch_size)
        if last_id is not None:
            q = q.gt("id", last_id)
        resp = q.execute()
        rows = resp.data or []
        if not rows:
            break
        last_id = rows[-1].get("id")

        for row in rows:
            if limit is not None and inferred >= limit:
                break
            scanned += 1

            site = row.get("source_site")
            inferred_type = infer_aircraft_type_from_listing_fields(
                source_site=site,
                url=row.get("url"),
                source_url=row.get("source_url"),
                raw_data=row.get("raw_data"),
            )
            if not inferred_type:
                skipped_no_signal += 1
                continue

            inferred += 1
            if dry_run or not apply:
                log.info(
                    "would_set id=%s site=%s -> %s",
                    row.get("id"),
                    site,
                    inferred_type,
                )
                continue

            try:
                supabase.table("aircraft_listings").update({"aircraft_type": inferred_type}).eq("id", row["id"]).execute()
                updated += 1
            except Exception as exc:
                log.warning("update_failed id=%s: %s", row.get("id"), exc)

        if limit is not None and inferred >= limit:
            break
        if len(rows) < batch_size:
            break

    log.info(
        "done scanned=%s inferred=%s updated=%s skipped_no_signal=%s dry_run=%s",
        scanned,
        inferred,
        updated,
        skipped_no_signal,
        dry_run or not apply,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill aircraft_type from URLs / raw_data.")
    parser.add_argument("--dry-run", action="store_true", help="Log would-be updates only (default if neither flag).")
    parser.add_argument("--apply", action="store_true", help="Write updates to aircraft_listings.")
    parser.add_argument("--source-site", default="", help=f"Limit to one site: {', '.join(TARGET_SITES)}")
    parser.add_argument("--limit", type=int, default=None, help="Max rows to infer/update (missing type only).")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH)
    parser.add_argument("--verbose", action="store_true", help="DEBUG logs (HTTP trace).")
    args = parser.parse_args()

    setup_logging(verbose=args.verbose)
    if not args.apply and not args.dry_run:
        args.dry_run = True
        log.info("No --apply: running as --dry-run")

    run_backfill(
        dry_run=args.dry_run,
        apply=args.apply,
        source_site=args.source_site or None,
        limit=args.limit,
        batch_size=max(50, args.batch_size),
    )


if __name__ == "__main__":
    main()
