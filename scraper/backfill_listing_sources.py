r"""
Backfill canonical source attribution fields on existing aircraft_listings rows.

Usage:
  .venv312\Scripts\python.exe scraper\backfill_listing_sources.py --dry-run
  .venv312\Scripts\python.exe scraper\backfill_listing_sources.py --apply
"""

from __future__ import annotations

import argparse
import os
from collections import Counter
from urllib.parse import urlparse

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv("scraper/.env")

DOMAIN_SOURCE_HINTS: list[tuple[str, str]] = [
    ("aerotrader", "aerotrader"),
    ("controller", "controller"),
    ("trade-a-plane", "tradaplane"),
    ("tradeaplane", "tradaplane"),
    ("barnstormers", "barnstormers"),
    ("globalair", "globalair"),
    ("aircraftforsale", "afs"),
    ("aso", "aso"),
    ("avbuyer", "avbuyer"),
]


def get_supabase() -> Client:
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not url or not key:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in scraper/.env")
    return create_client(url, key)


def normalize_source(value: object) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return "unknown"
    if raw in {"tap", "trade-a-plane", "tradeaplane", "trade_a_plane"}:
        return "tradaplane"
    if raw.startswith("controller"):
        return "controller"
    if raw == "aircraftforsale":
        return "afs"
    if raw == "aero_trader":
        return "aerotrader"
    if raw == "global_air":
        return "globalair"
    return raw


def parse_domain(url_value: object) -> str:
    raw = str(url_value or "").strip()
    if not raw:
        return ""
    if not raw.startswith(("http://", "https://")):
        raw = f"https://{raw}"
    try:
        return (urlparse(raw).hostname or "").lower().replace("www.", "")
    except Exception:
        return ""


def infer_source(row: dict[str, object]) -> str:
    for candidate in (row.get("source_site"), row.get("listing_source"), row.get("source")):
        normalized = normalize_source(candidate)
        if normalized != "unknown":
            return normalized

    domain = parse_domain(row.get("source_url") or row.get("url"))
    if domain:
        for needle, source in DOMAIN_SOURCE_HINTS:
            if needle in domain:
                return source
    return "unknown"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backfill source attribution fields for aircraft_listings")
    parser.add_argument("--apply", action="store_true", help="Persist changes to database")
    parser.add_argument("--dry-run", action="store_true", help="Preview only (default behavior if --apply is omitted)")
    parser.add_argument("--page-size", type=int, default=1000, help="Page size for list/update operations")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    supabase = get_supabase()

    page_size = max(100, int(args.page_size))
    from_idx = 0
    total_rows = 0
    changed_rows = 0
    applied_rows = 0
    skipped_rows = 0
    changed_by_source: Counter[str] = Counter()

    while True:
        to_idx = from_idx + page_size - 1
        result = (
            supabase.table("aircraft_listings")
            .select("id,source_id,source,source_site,listing_source,source_url,url")
            .range(from_idx, to_idx)
            .execute()
        )
        page_rows = result.data or []
        if not page_rows:
            break

        updates: list[dict[str, object]] = []
        for row in page_rows:
            total_rows += 1
            inferred = infer_source(row)
            current_source = normalize_source(row.get("source"))
            current_site = normalize_source(row.get("source_site"))
            current_listing_source = normalize_source(row.get("listing_source"))

            needs_update = current_site != inferred or current_listing_source != inferred
            if not needs_update:
                continue

            changed_rows += 1
            changed_by_source[inferred] += 1
            updates.append(
                {
                    "id": row["id"],
                    "source_site": inferred,
                    "listing_source": inferred,
                }
            )

        if updates and args.apply:
            for update in updates:
                row_id = update.get("id")
                payload = {k: v for k, v in update.items() if k != "id"}
                try:
                    supabase.table("aircraft_listings").update(payload).eq("id", row_id).execute()
                    applied_rows += 1
                except Exception:
                    skipped_rows += 1

        if len(page_rows) < page_size:
            break
        from_idx += page_size

    mode = "APPLY" if args.apply else "DRY RUN"
    print(f"[{mode}] scanned={total_rows} changed={changed_rows} applied={applied_rows} skipped={skipped_rows}")
    for source, count in sorted(changed_by_source.items(), key=lambda kv: kv[1], reverse=True):
        print(f"  {source}: {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
