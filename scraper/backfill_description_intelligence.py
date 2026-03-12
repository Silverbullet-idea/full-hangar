"""
Backfill description_intelligence using the current parser version.

Usage:
  .venv312\\Scripts\\python.exe scraper\\backfill_description_intelligence.py --limit 500 --dry-run
  .venv312\\Scripts\\python.exe scraper\\backfill_description_intelligence.py --limit 500 --apply
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

try:
    from env_check import env_check
    from scraper_base import get_supabase, setup_logging
    from description_parser import PARSER_VERSION, parse_description
except ImportError:  # pragma: no cover
    from .env_check import env_check
    from .scraper_base import get_supabase, setup_logging
    from .description_parser import PARSER_VERSION, parse_description

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backfill aircraft_listings.description_intelligence")
    parser.add_argument("--limit", type=int, default=500, help="Max listings to process")
    parser.add_argument("--offset", type=int, default=0, help="Start offset in listing table")
    parser.add_argument("--batch-size", type=int, default=200, help="Select page size")
    parser.add_argument("--apply", action="store_true", help="Write updates to DB")
    parser.add_argument("--dry-run", action="store_true", help="Preview only (default if --apply omitted)")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logs")
    return parser.parse_args()


def _as_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return {}
        try:
            parsed = json.loads(text)
        except Exception:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _fallback_text_from_existing(existing: dict[str, Any]) -> str:
    chunks: list[str] = []
    avionics = existing.get("avionics")
    if isinstance(avionics, list):
        chunks.extend(str(item) for item in avionics if item)

    detailed = existing.get("avionics_detailed")
    if isinstance(detailed, list):
        for item in detailed:
            if not isinstance(item, dict):
                continue
            canonical_name = item.get("canonical_name")
            if canonical_name:
                chunks.append(str(canonical_name))
            matched_texts = item.get("matched_texts")
            if isinstance(matched_texts, list):
                chunks.extend(str(token) for token in matched_texts if token)

    unresolved = existing.get("avionics_unresolved")
    if isinstance(unresolved, list):
        chunks.extend(str(token) for token in unresolved if token)

    return " ".join(chunks).strip()


def main() -> int:
    args = parse_args()
    log = setup_logging(args.verbose)
    env_check()
    supabase = get_supabase()
    apply_mode = args.apply and not args.dry_run

    processed = 0
    updated = 0
    skipped_current = 0
    offset = max(0, args.offset)

    while processed < args.limit:
        page_size = min(args.batch_size, args.limit - processed)
        listings_resp = (
            supabase.table("aircraft_listings")
            .select("id,description,avionics_description,description_full,description_intelligence")
            .order("last_seen_date", desc=True)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = listings_resp.data or []
        if not rows:
            break

        for row in rows:
            listing_id = str(row.get("id") or "").strip()
            if not listing_id:
                continue
            text = " ".join(
                [
                    str(row.get("avionics_description") or ""),
                    str(row.get("description_full") or ""),
                    str(row.get("description") or ""),
                ]
            ).strip()
            existing = _as_dict(row.get("description_intelligence"))
            if len(text) < 12:
                text = _fallback_text_from_existing(existing)
            if len(text) < 12:
                continue
            existing_version = str(existing.get("avionics_parser_version") or "").strip()
            if existing_version == PARSER_VERSION:
                skipped_current += 1
                continue

            parsed = parse_description(text)
            if not apply_mode:
                updated += 1
                continue

            (
                supabase.table("aircraft_listings")
                .update({"description_intelligence": parsed})
                .eq("id", listing_id)
                .execute()
            )
            updated += 1

        processed += len(rows)
        offset += len(rows)
        if len(rows) < page_size:
            break

    log.info(
        "Description intelligence backfill complete: processed=%s updated=%s skipped_current=%s parser_version=%s apply=%s",
        processed,
        updated,
        skipped_current,
        PARSER_VERSION,
        apply_mode,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
