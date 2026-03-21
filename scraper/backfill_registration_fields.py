r"""
Backfill global registration fields on aircraft_listings.

Default mode is shadow write (registration_* columns only).
Use --promote-n-number to allow high-confidence US registrations to populate n_number.

Usage:
  .venv312\Scripts\python.exe scraper\backfill_registration_fields.py --dry-run
  .venv312\Scripts\python.exe scraper\backfill_registration_fields.py --apply
  .venv312\Scripts\python.exe scraper\backfill_registration_fields.py --apply --promote-n-number
"""

from __future__ import annotations

import argparse
import json
import os
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import Client, create_client

from registration_parser import derive_registration_fields

REPORT_PATH = Path("scraper/registration_backfill_latest.json")


def get_supabase() -> Client:
    load_dotenv("scraper/.env")
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not url or not key:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in scraper/.env")
    return create_client(url, key)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backfill registration fields for aircraft_listings")
    parser.add_argument("--apply", action="store_true", help="Persist updates")
    parser.add_argument("--dry-run", action="store_true", help="Preview updates (default)")
    parser.add_argument("--limit", type=int, default=0, help="Stop after N changed rows (0 = no limit)")
    parser.add_argument("--page-size", type=int, default=1000, help="Read page size")
    parser.add_argument("--promote-n-number", action="store_true", help="Allow n_number writes for high-confidence US registrations")
    return parser.parse_args()


def fetch_page(supabase: Client, from_idx: int, to_idx: int) -> list[dict[str, Any]]:
    columns_full = (
        "id,n_number,registration_raw,registration_normalized,registration_scheme,"
        "registration_country_code,registration_confidence,title,description,description_full"
    )
    columns_fallback = "id,n_number,title,description,description_full"
    try:
        response = supabase.table("aircraft_listings").select(columns_full).range(from_idx, to_idx).execute()
    except Exception:
        response = supabase.table("aircraft_listings").select(columns_fallback).range(from_idx, to_idx).execute()
    return response.data or []


def main() -> int:
    args = parse_args()
    supabase = get_supabase()

    dry_run = bool(args.dry_run or not args.apply)
    page_size = max(100, int(args.page_size))
    limit = max(0, int(args.limit))

    from_idx = 0
    scanned = 0
    changed = 0
    applied = 0
    source_breakdown: Counter[str] = Counter()
    scheme_breakdown: Counter[str] = Counter()

    while True:
        rows = fetch_page(supabase, from_idx, from_idx + page_size - 1)
        if not rows:
            break
        for row in rows:
            scanned += 1
            fallback_text = " ".join(str(row.get(k) or "") for k in ("title", "description", "description_full"))
            fields = derive_registration_fields(
                raw_value=str(row.get("registration_raw") or row.get("n_number") or ""),
                fallback_text=fallback_text,
            )

            update_payload: dict[str, Any] = {}
            for key in (
                "registration_raw",
                "registration_normalized",
                "registration_scheme",
                "registration_country_code",
                "registration_confidence",
            ):
                existing = str(row.get(key) or "").strip()
                incoming = str(fields.get(key) or "").strip()
                if incoming and incoming != existing:
                    update_payload[key] = incoming

            if args.promote_n_number:
                incoming_n = str(fields.get("n_number") or "").strip()
                if incoming_n and not str(row.get("n_number") or "").strip():
                    update_payload["n_number"] = incoming_n

            if not update_payload:
                continue

            changed += 1
            scheme_breakdown[str(update_payload.get("registration_scheme") or row.get("registration_scheme") or "UNKNOWN")] += 1

            if not dry_run:
                supabase.table("aircraft_listings").update(update_payload).eq("id", row["id"]).execute()
                applied += 1

            if limit and changed >= limit:
                break

        if limit and changed >= limit:
            break
        if len(rows) < page_size:
            break
        from_idx += page_size

    report = {
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": dry_run,
        "promote_n_number": bool(args.promote_n_number),
        "scanned": scanned,
        "changed": changed,
        "applied": applied,
        "scheme_breakdown": dict(scheme_breakdown),
        "source_breakdown": dict(source_breakdown),
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    print(f"Wrote {REPORT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

