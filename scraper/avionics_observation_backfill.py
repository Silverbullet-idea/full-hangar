"""
Backfill per-listing avionics observations from listing descriptions.

Phase 2 scope:
- Parse listing text with description_parser v2.x
- Persist matched avionics rows and unresolved tokens
- Link canonical units where possible

Usage:
  .venv312\\Scripts\\python.exe scraper\\avionics_observation_backfill.py --limit 200 --dry-run
  .venv312\\Scripts\\python.exe scraper\\avionics_observation_backfill.py --limit 200 --apply
"""

from __future__ import annotations

import argparse
import re
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


def _norm_token(value: str | None) -> str:
    lowered = (value or "").lower()
    alnum_spaces = re.sub(r"[^a-z0-9]+", " ", lowered)
    return re.sub(r"\s+", " ", alnum_spaces).strip()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backfill avionics listing observation rows")
    parser.add_argument("--limit", type=int, default=500, help="Max listings to process")
    parser.add_argument("--offset", type=int, default=0, help="Start offset in listing table")
    parser.add_argument("--batch-size", type=int, default=200, help="Select page size")
    parser.add_argument("--apply", action="store_true", help="Write observations to DB")
    parser.add_argument("--dry-run", action="store_true", help="Preview only (default if --apply omitted)")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logs")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    log = setup_logging(args.verbose)
    env_check()
    supabase = get_supabase()

    apply_mode = args.apply and not args.dry_run

    units_resp = supabase.table("avionics_units").select("id,canonical_name").eq("is_active", True).execute()
    unit_rows = units_resp.data or []
    unit_id_by_canonical = {str(row.get("canonical_name")): row.get("id") for row in unit_rows if row.get("id")}

    processed = 0
    inserted = 0
    matched_rows = 0
    unresolved_rows = 0
    offset = max(0, args.offset)

    while processed < args.limit:
        page_size = min(args.batch_size, args.limit - processed)
        listings_resp = (
            supabase.table("aircraft_listings")
            .select("id,description,description_full,avionics_description")
            .order("last_seen_date", desc=True)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = listings_resp.data or []
        if not rows:
            break

        obs_rows: list[dict[str, Any]] = []
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
            if len(text) < 12:
                continue

            parsed = parse_description(text)
            detailed = parsed.get("avionics_detailed", []) if isinstance(parsed, dict) else []
            unresolved = parsed.get("avionics_unresolved", []) if isinstance(parsed, dict) else []

            for item in detailed if isinstance(detailed, list) else []:
                if not isinstance(item, dict):
                    continue
                canonical_name = str(item.get("canonical_name") or "").strip()
                if not canonical_name:
                    continue
                qty = int(item.get("quantity") or 1)
                confidence = float(item.get("confidence") or 0.9)
                matched_texts = item.get("matched_texts", [])
                raw_token = canonical_name
                if isinstance(matched_texts, list) and matched_texts:
                    raw_token = str(matched_texts[0])

                obs_rows.append(
                    {
                        "listing_id": listing_id,
                        "unit_id": unit_id_by_canonical.get(canonical_name),
                        "canonical_name": canonical_name,
                        "raw_token": raw_token,
                        "normalized_token": _norm_token(raw_token),
                        "quantity": max(1, qty),
                        "extractor_version": str(parsed.get("avionics_parser_version") or PARSER_VERSION),
                        "match_confidence": confidence,
                        "match_type": "regex_alias",
                        "source_field": "description_intelligence",
                    }
                )
                matched_rows += 1

            for token in unresolved if isinstance(unresolved, list) else []:
                token_text = str(token or "").strip()
                if not token_text:
                    continue
                obs_rows.append(
                    {
                        "listing_id": listing_id,
                        "unit_id": None,
                        "canonical_name": None,
                        "raw_token": token_text,
                        "normalized_token": _norm_token(token_text),
                        "quantity": 1,
                        "extractor_version": str(parsed.get("avionics_parser_version") or PARSER_VERSION),
                        "match_confidence": 0.35,
                        "match_type": "unresolved",
                        "source_field": "description_intelligence",
                    }
                )
                unresolved_rows += 1

        if obs_rows:
            deduped: dict[tuple[str, str, str, str], dict[str, Any]] = {}
            for item in obs_rows:
                dedupe_key = (
                    str(item.get("listing_id") or ""),
                    str(item.get("normalized_token") or ""),
                    str(item.get("source_field") or ""),
                    str(item.get("match_type") or ""),
                )
                existing = deduped.get(dedupe_key)
                if existing is None:
                    deduped[dedupe_key] = item
                    continue
                # Keep strongest signal when duplicate conflict keys occur in same batch.
                existing["quantity"] = max(int(existing.get("quantity") or 1), int(item.get("quantity") or 1))
                existing_conf = float(existing.get("match_confidence") or 0.0)
                item_conf = float(item.get("match_confidence") or 0.0)
                if item_conf > existing_conf:
                    existing["match_confidence"] = item_conf
                    if item.get("canonical_name"):
                        existing["canonical_name"] = item.get("canonical_name")
                        existing["unit_id"] = item.get("unit_id")
                    if item.get("raw_token"):
                        existing["raw_token"] = item.get("raw_token")

            upsert_rows = list(deduped.values())
            if apply_mode:
                supabase.table("avionics_listing_observations").upsert(
                    upsert_rows,
                    on_conflict="listing_id,normalized_token,source_field,match_type",
                ).execute()
                inserted += len(upsert_rows)
            else:
                inserted += len(upsert_rows)
                preview = upsert_rows[:3]
                for item in preview:
                    log.info(
                        "[dry-run] listing_id=%s match_type=%s token=%s canonical=%s qty=%s",
                        item["listing_id"],
                        item["match_type"],
                        item["raw_token"],
                        item.get("canonical_name"),
                        item["quantity"],
                    )

        processed += len(rows)
        offset += len(rows)
        if len(rows) < page_size:
            break

    log.info(
        "Observation backfill complete: processed_listings=%s rows=%s matched=%s unresolved=%s apply=%s",
        processed,
        inserted,
        matched_rows,
        unresolved_rows,
        apply_mode,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
