"""
Hide listings by explicit ID approval list.

By default this script runs in dry-run mode.

Usage:
    .venv312\\Scripts\\python.exe scraper\\hide_listings_by_id.py --input scraper\\non_aircraft_hide_approved_ids.json
    .venv312\\Scripts\\python.exe scraper\\hide_listings_by_id.py --input scraper\\non_aircraft_hide_approved_ids.json --apply
    .venv312\\Scripts\\python.exe scraper\\hide_listings_by_id.py --input scraper\\non_aircraft_strict_candidates_latest.json --input-mode strict-report
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import date
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import create_client


def _load_approved_ids(path: Path, input_mode: str) -> list[str]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise SystemExit(f"Input file not found: {path}")
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Input file is not valid JSON: {path} ({exc})")

    if input_mode == "strict-report":
        if not isinstance(payload, dict) or not isinstance(payload.get("candidates"), list):
            raise SystemExit("Strict report input must be an object with `candidates` list.")
        ids = [candidate.get("id") for candidate in payload["candidates"] if isinstance(candidate, dict)]
    else:
        # approved mode accepts either:
        # - ["uuid1", "uuid2"]
        # - {"approved_ids": ["uuid1", "uuid2"]}
        if isinstance(payload, list):
            ids = payload
        elif isinstance(payload, dict) and isinstance(payload.get("approved_ids"), list):
            ids = payload["approved_ids"]
        else:
            raise SystemExit("Approved input must be a JSON list of IDs or an object with `approved_ids` list.")

    cleaned = [str(item).strip() for item in ids if str(item).strip()]
    deduped = sorted(set(cleaned))
    if not deduped:
        raise SystemExit("No approved IDs found in input file.")
    return deduped


def _fetch_rows(sb: Any, ids: list[str]) -> list[dict[str, Any]]:
    # Chunk to keep IN payload bounded.
    chunk_size = 100
    rows: list[dict[str, Any]] = []
    for i in range(0, len(ids), chunk_size):
        chunk = ids[i : i + chunk_size]
        batch = (
            sb.table("aircraft_listings")
            .select("id,source_site,source_id,title,is_active,inactive_date")
            .in_("id", chunk)
            .execute()
            .data
            or []
        )
        rows.extend(batch)
    return rows


def _apply_hide(sb: Any, ids: list[str]) -> tuple[int, list[str]]:
    today = date.today().isoformat()
    chunk_size = 100
    updated_total = 0
    failed_ids: list[str] = []
    for i in range(0, len(ids), chunk_size):
        chunk = ids[i : i + chunk_size]
        try:
            response = (
                sb.table("aircraft_listings")
                .update({"is_active": False, "inactive_date": today})
                .in_("id", chunk)
                .execute()
            )
            updated_total += len(response.data or [])
        except Exception:
            failed_ids.extend(chunk)
    return updated_total, failed_ids


def main() -> None:
    parser = argparse.ArgumentParser(description="Hide listings from an explicit approved ID file")
    parser.add_argument(
        "--input",
        default="scraper/non_aircraft_hide_approved_ids.json",
        help="Path to approval file or strict-report JSON",
    )
    parser.add_argument(
        "--input-mode",
        choices=["approved", "strict-report"],
        default="approved",
        help="Input parsing mode: explicit approved list or strict-report candidates",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply updates (default is dry-run only)",
    )
    args = parser.parse_args()

    load_dotenv(Path("scraper/.env"))
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_service_key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not supabase_url or not supabase_service_key:
        raise SystemExit("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in scraper/.env")

    sb = create_client(supabase_url, supabase_service_key)
    input_path = Path(args.input)
    approved_ids = _load_approved_ids(input_path, args.input_mode)
    rows = _fetch_rows(sb, approved_ids)

    found_ids = {str(row.get("id")) for row in rows}
    missing_ids = [listing_id for listing_id in approved_ids if listing_id not in found_ids]

    print("")
    print("Hide Listings By ID")
    print("===================")
    print(f"Input file          : {input_path}")
    print(f"Input mode          : {args.input_mode}")
    print(f"Approved IDs        : {len(approved_ids)}")
    print(f"Rows found in DB    : {len(rows)}")
    print(f"Missing IDs         : {len(missing_ids)}")
    if missing_ids:
        for missing_id in missing_ids:
            print(f"- missing: {missing_id}")

    would_hide_count = sum(1 for row in rows if bool(row.get("is_active")))
    already_hidden_count = len(rows) - would_hide_count
    print(f"Would hide          : {would_hide_count}")
    print(f"Already hidden      : {already_hidden_count}")

    if not args.apply:
        print("")
        print("Dry run only. No DB updates performed.")
        return

    update_targets = [str(row.get("id")) for row in rows if bool(row.get("is_active"))]
    if not update_targets:
        print("")
        print("No active rows to update. Nothing changed.")
        return

    updated_count, failed_ids = _apply_hide(sb, update_targets)
    print("")
    print("Apply mode complete.")
    print(f"Updated rows        : {updated_count}")
    print(f"Failed IDs          : {len(failed_ids)}")
    if failed_ids:
        for failed_id in failed_ids:
            print(f"- failed: {failed_id}")


if __name__ == "__main__":
    main()
