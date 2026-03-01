"""
Phase 4: Backfill Real Listings Into DB With Scores
Full-Hangar.com — Run after scraping and (optionally) FAA enrichment.

Reads listings from Supabase aircraft_listings, computes aircraft intelligence
for each, and saves:
  - engine_score, prop_score, llp_score, value_score
  - deferred_total, true_cost, risk_level

Then Supabase becomes queryable for:
  - Sort by highest deferred liability
  - Filter CRITICAL risk
  - Filter "engine under 25% life"
  - Surface hidden deal opportunities

Usage:
  python backfill_scores.py                  # Score all listings missing scores
  python backfill_scores.py --limit 500      # Cap at 500
  python backfill_scores.py --all            # Re-score every listing
  python backfill_scores.py --dry-run         # Compute only, no DB writes
  python backfill_scores.py --from-json sample_listings.json  # Backfill from file (then upsert)
"""

from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path

# Allow importing core when run from scraper/
_ROOT = Path(__file__).resolve().parent
if _ROOT.name == "scraper":
    sys.path.insert(0, str(_ROOT.parent))

from dotenv import load_dotenv

load_dotenv()

from core.intelligence.aircraft_intelligence import INTELLIGENCE_VERSION, aircraft_intelligence_score
from backfill_log import log_backfill_run, log_scoring_error
from controller_scraper import _STATE_ABBREV, _normalize_state

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# DB column names for intelligence (flat, queryable)
INTELLIGENCE_COLUMNS = [
    "engine_score",
    "prop_score",
    "llp_score",
    "value_score",
    "deferred_total",
    "true_cost",
    "risk_level",
    "intelligence_version",
]


def get_supabase():
    """Lazy Supabase client; requires SUPABASE_URL and SUPABASE_SERVICE_KEY in .env."""
    from supabase import create_client
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise EnvironmentError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env")
    return create_client(url, key)


def intelligence_to_row(intel: dict, listing: dict | None = None) -> dict:
    """Map aircraft_intelligence_score() result to flat DB row fields."""
    deferred = intel.get("deferred_maintenance") or {}
    row = {
        "engine_score": (intel.get("engine") or {}).get("score"),
        "prop_score": (intel.get("prop") or {}).get("score"),
        "llp_score": (intel.get("llp") or {}).get("score"),
        "value_score": intel.get("value_score"),
        "deferred_total": deferred.get("total"),
        "true_cost": deferred.get("true_cost"),
        "risk_level": intel.get("risk_level"),
        "intelligence_version": intel.get("intelligence_version"),
    }
    raw_state = (listing or {}).get("location_state")
    if isinstance(raw_state, str) and raw_state.strip():
        # Convert full state names (e.g. Texas) to abbreviations before upsert.
        clean = raw_state.strip()
        row["location_state"] = _STATE_ABBREV.get(clean.lower()) or _normalize_state(clean)
    return row


def listing_for_intelligence(row: dict) -> dict:
    """Build a listing dict suitable for aircraft_intelligence_score from a DB row."""
    # DB may use different keys; normalize to what intelligence expects
    return {
        "year": row.get("year"),
        "make": row.get("make"),
        "model": row.get("model"),
        "asking_price": row.get("asking_price"),
        "description": row.get("description"),
        "description_full": row.get("description_full"),
        "total_time_airframe": row.get("total_time_airframe"),
        "time_since_overhaul": row.get("time_since_overhaul"),
        "time_since_new_engine": row.get("time_since_new_engine"),
        "time_since_prop_overhaul": row.get("time_since_prop_overhaul"),
        "aircraft_type": row.get("aircraft_type"),
        "engine_model": row.get("engine_model"),
    }


def run_backfill_from_db(
    supabase,
    *,
    limit: int | None = None,
    score_only_missing: bool = True,
    dry_run: bool = False,
) -> tuple[int, int, int, int]:
    """
    Fetch listings from aircraft_listings, compute scores, update rows.
    Returns (attempted_count, scored_count, failed_count, updated_count).
    """
    select_cols = [
        "id", "year", "make", "model", "asking_price",
        "description", "description_full", "total_time_airframe",
        "time_since_overhaul", "time_since_new_engine", "time_since_prop_overhaul",
        "aircraft_type", "engine_model",
    ]
    query = supabase.table("aircraft_listings").select(",".join(select_cols))
    if score_only_missing:
        # Only rows that don't have value_score yet (or any one of the score columns)
        query = query.is_("value_score", "null")
    query = query.order("id", desc=False)
    if limit:
        query = query.limit(limit)
    result = query.execute()
    rows = result.data or []
    log.info(f"Found {len(rows)} listings to score (score_only_missing={score_only_missing}, limit={limit})")

    attempted = 0
    scored = 0
    failed = 0
    updated = 0
    for row in rows:
        attempted += 1
        listing = listing_for_intelligence(row)
        try:
            intel = aircraft_intelligence_score(listing)
        except Exception as e:
            failed += 1
            source_id = str(row.get("id") or "unknown")
            log_scoring_error(source_id, e)
            log.warning(f"Intelligence failed for id={source_id}: {e}")
            continue
        scored += 1
        update_payload = intelligence_to_row(intel)
        if dry_run:
            log.info(f"  [dry-run] id={row['id']} value_score={update_payload['value_score']} risk={update_payload['risk_level']} deferred=${update_payload['deferred_total'] or 0:,}")
            updated += 1
            continue
        try:
            supabase.table("aircraft_listings").update(update_payload).eq("id", row["id"]).execute()
            updated += 1
            if updated % 50 == 0:
                log.info(f"  Updated {updated} listings...")
        except Exception as e:
            source_id = str(row.get("id") or "unknown")
            failed += 1
            log_scoring_error(source_id, e)
            log.error(f"Update failed for id={source_id}: {e}")

    return attempted, scored, failed, updated


def run_backfill_from_json(
    json_path: Path,
    supabase,
    *,
    dry_run: bool = False,
) -> tuple[int, int, int, int]:
    """
    Load listings from a JSON file, compute scores, upsert into aircraft_listings
    with intelligence columns set. Use when you have sample_listings.json or an export.
    Expects array of listing objects with source, source_id (or source_url) and standard fields.
    """
    with open(json_path, encoding="utf-8") as f:
        listings = json.load(f)
    if not isinstance(listings, list):
        log.error("JSON root must be an array of listings")
        return 0, 0, 1, 0

    from datetime import datetime, timezone

    attempted = 0
    scored = 0
    failed = 0
    updated = 0
    for L in listings:
        if not L.get("source_id") and not L.get("source_url"):
            failed += 1
            log_scoring_error("unknown", ValueError("Missing source_id/source_url"))
            log.warning("Skipping listing without source_id/source_url")
            continue
        attempted += 1
        try:
            intel = aircraft_intelligence_score(L)
        except Exception as e:
            failed += 1
            source_id = str(L.get("source_id") or L.get("source_url") or "unknown")
            log_scoring_error(source_id, e)
            log.warning(f"Intelligence failed for {source_id}: {e}")
            continue
        scored += 1
        row = {
            **{k: v for k, v in L.items() if v is not None and k not in ("listing_quality", "intelligence")},
            **intelligence_to_row(intel, L),
            # Keep legacy/current aliases in sync when target schema uses alternate names.
            "source_listing_id": L.get("source_id"),
            "price_asking": L.get("asking_price"),
            "source": L.get("source") or "aerotrader",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if dry_run:
            log.info(f"  [dry-run] {row.get('source_id')} value_score={row['value_score']} risk={row['risk_level']} deferred=${row.get('deferred_total') or 0:,}")
            updated += 1
            continue
        try:
            supabase.table("aircraft_listings").upsert(row, on_conflict="source,source_id").execute()
            updated += 1
        except Exception as e:
            failed += 1
            source_id = str(row.get("source_id") or row.get("source_url") or "unknown")
            log_scoring_error(source_id, e)
            log.error(f"Upsert failed for {source_id}: {e}")

    return attempted, scored, failed, updated


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Backfill aircraft_listings with intelligence scores")
    parser.add_argument("--limit", type=int, default=None, help="Max number of DB rows to process")
    parser.add_argument("--all", action="store_true", help="Re-score all listings (ignore missing-scores filter)")
    parser.add_argument("--dry-run", action="store_true", help="Compute scores but do not write to DB")
    parser.add_argument("--from-json", type=str, metavar="PATH", help="Backfill from JSON file (upsert by source,source_id)")
    args = parser.parse_args()

    mode = "json" if args.from_json else "db"
    attempted = 0
    scored = 0
    failed = 0
    updated = 0
    run_error: Exception | None = None

    try:
        if args.from_json:
            path = Path(args.from_json)
            if not path.is_absolute():
                path = _ROOT / path
            if not path.exists():
                raise FileNotFoundError(f"File not found: {path}")
            supabase = get_supabase()
            attempted, scored, failed, updated = run_backfill_from_json(path, supabase, dry_run=args.dry_run)
        else:
            supabase = get_supabase()
            attempted, scored, failed, updated = run_backfill_from_db(
                supabase,
                limit=args.limit,
                score_only_missing=not args.all,
                dry_run=args.dry_run,
            )
    except Exception as e:
        run_error = e
        failed += 1
        log_scoring_error("__run__", e)
        log.error(f"Backfill run failed: {e}")
    finally:
        # Always emit a run audit record, including dry runs and partial failures.
        try:
            log_backfill_run(
                {
                    "mode": mode,
                    "intelligence_version": INTELLIGENCE_VERSION,
                    "listings_attempted": attempted,
                    "listings_scored": scored,
                    "listings_failed": failed,
                    "dry_run": args.dry_run,
                }
            )
        except Exception as e:
            log.error(f"Failed to write backfill audit log: {e}")
        log.info(
            f"Done: attempted={attempted}, scored={scored}, failed={failed}, updated={updated} (dry_run={args.dry_run})"
        )
        print(
            f"Backfill summary | mode={mode} | attempted={attempted} | scored={scored} | "
            f"failed={failed} | updated={updated} | dry_run={args.dry_run}"
        )
        if not args.dry_run and updated:
            log.info("Supabase is now queryable: sort by deferred_total, filter risk_level = 'CRITICAL', engine_score < 25, etc.")

    if run_error:
        raise run_error


if __name__ == "__main__":
    main()
