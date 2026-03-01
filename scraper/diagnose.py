"""
CLI diagnostic tool for a single listing's intelligence scoring.

Usage:
  python diagnose.py <source_id>
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

try:
    from dotenv import load_dotenv
except ImportError:  # Optional dependency; env vars may already be set.
    load_dotenv = None

# Allow importing core when run from scraper/
_ROOT = Path(__file__).resolve().parent
if _ROOT.name == "scraper":
    sys.path.insert(0, str(_ROOT.parent))

from core.intelligence.aircraft_intelligence import aircraft_intelligence_score
from core.intelligence.model_normalizer import (
    extract_engine_canonical_from_listing,
    extract_prop_canonical_from_listing,
)
from core.intelligence.reference_service import get_engine_reference, get_prop_reference


def _get_supabase_client():
    from supabase import create_client

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise EnvironmentError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env")
    return create_client(url, key)


def _normalize_pattern(raw: str | None) -> str:
    if not raw:
        return ""
    s = str(raw).upper().strip()
    s = re.sub(r"[\s\-_]+", "", s)
    s = re.sub(r"[^A-Z0-9]", "", s)
    return s


def _best_pattern_match(normalized_input: str, rows: list[dict]) -> dict | None:
    if not normalized_input:
        return None
    best = None
    best_len = 0
    for row in rows:
        pattern = _normalize_pattern(row.get("pattern"))
        if not pattern or pattern == "DEFAULT":
            if best is None:
                best = row
            continue
        if pattern in normalized_input or normalized_input.startswith(pattern):
            if len(pattern) > best_len:
                best_len = len(pattern)
                best = row
    return best


def _fetch_engine_reference_match(client: Any, canonical_engine: str) -> dict | None:
    rows = client.table("engine_tbo_reference").select("*").execute().data or []
    rows = [r for r in rows if r.get("pattern")]
    match = _best_pattern_match(canonical_engine, rows) if canonical_engine else (rows[0] if rows else None)
    if not match and rows:
        match = next((r for r in rows if (r.get("pattern") or "").upper() == "DEFAULT"), rows[0])
    return match


def _fetch_prop_reference_match(client: Any, canonical_prop: str, raw_text: str) -> dict | None:
    rows = client.table("propeller_tbo_reference").select("*").execute().data or []
    rows = [r for r in rows if r.get("pattern")]
    match = _best_pattern_match(canonical_prop, rows) if canonical_prop else None

    raw_upper = (raw_text or "").upper()
    if not match and raw_upper:
        for row in sorted(rows, key=lambda x: -len(x.get("pattern") or "")):
            if (row.get("pattern") or "").upper() in raw_upper:
                match = row
                break

    if not match and rows:
        match = next((r for r in rows if (r.get("pattern") or "").upper() == "DEFAULT"), rows[0])
    return match


def _listing_for_intelligence(row: dict) -> dict:
    """Normalize DB row keys to what aircraft_intelligence_score expects."""
    return {
        "year": row.get("year"),
        "make": row.get("make"),
        "model": row.get("model"),
        "asking_price": row.get("asking_price"),
        "description": row.get("description"),
        "description_full": row.get("description_full"),
        "total_time_airframe": row.get("total_time_airframe") or row.get("total_time"),
        "time_since_overhaul": row.get("time_since_overhaul") or row.get("engine_smoh"),
        "time_since_new_engine": row.get("time_since_new_engine"),
        "time_since_prop_overhaul": row.get("time_since_prop_overhaul") or row.get("prop_smoh"),
        "aircraft_type": row.get("aircraft_type"),
        "engine_model": row.get("engine_model"),
        "prop_model": row.get("prop_model"),
        "source": row.get("source"),
        "source_id": row.get("source_id"),
    }


def _fmt_money(value: Any) -> str:
    if value is None:
        return "N/A"
    try:
        return f"${float(value):,.0f}"
    except (TypeError, ValueError):
        return str(value)


def _fmt_value(value: Any, *, max_len: int | None = None) -> str:
    if value is None:
        return "N/A"
    text = str(value)
    if max_len and len(text) > max_len:
        return text[:max_len] + "...(truncated)"
    return text


def _print_section(title: str):
    print("\n" + "=" * 88)
    print(title)
    print("=" * 88)


def _print_json_block(value: Any):
    print(json.dumps(value, indent=2, default=str))


def main():
    parser = argparse.ArgumentParser(
        description="Inspect one listing's canonicalization, reference matching, and score"
    )
    parser.add_argument("source_id", help="Listing source_id in aircraft_listings")
    args = parser.parse_args()

    if load_dotenv is not None:
        load_dotenv(_ROOT / ".env")
        load_dotenv()

    source_id = str(args.source_id).strip()
    if not source_id:
        raise SystemExit("source_id is required")

    supabase = _get_supabase_client()
    query = (
        supabase.table("aircraft_listings")
        .select("*")
        .eq("source_id", source_id)
        .order("updated_at", desc=True)
        .limit(5)
        .execute()
    )
    rows = query.data or []
    if not rows:
        raise SystemExit(f"No listing found in aircraft_listings for source_id='{source_id}'")

    row = rows[0]
    listing = _listing_for_intelligence(row)
    raw_text = ((row.get("description") or "") + " " + (row.get("description_full") or "")).strip()

    engine_canonical = extract_engine_canonical_from_listing(listing)
    prop_canonical = extract_prop_canonical_from_listing(listing)

    engine_match = _fetch_engine_reference_match(supabase, engine_canonical)
    prop_match = _fetch_prop_reference_match(supabase, prop_canonical, raw_text)

    engine_ref = get_engine_reference(engine_canonical, listing.get("aircraft_type"))
    prop_ref = get_prop_reference(prop_canonical, raw_text=raw_text)
    intelligence = aircraft_intelligence_score(listing)

    _print_section("FULL-HANGAR LISTING DIAGNOSTIC")
    print(f"Lookup source_id: {source_id}")
    print(f"Matched records by source_id: {len(rows)} (using latest row)")
    print(f"Row id: {row.get('id', 'N/A')} | Source: {row.get('source', 'N/A')}")

    _print_section("RAW LISTING FIELDS")
    raw_fields = [
        "make",
        "model",
        "year",
        "asking_price",
        "aircraft_type",
        "engine_model",
        "engine_smoh",
        "time_since_overhaul",
        "time_since_new_engine",
        "prop_model",
        "prop_smoh",
        "time_since_prop_overhaul",
        "total_time_airframe",
        "total_time",
        "source_url",
    ]
    for field in raw_fields:
        value = row.get(field)
        if "price" in field:
            value = _fmt_money(value)
        print(f"{field:26}: {_fmt_value(value)}")
    print(f"{'description':26}: {_fmt_value(row.get('description'), max_len=220)}")
    print(f"{'description_full':26}: {_fmt_value(row.get('description_full'), max_len=220)}")

    _print_section("CANONICAL LOOKUP STRINGS")
    print(f"{'engine_canonical':26}: {_fmt_value(engine_canonical)}")
    print(f"{'prop_canonical':26}: {_fmt_value(prop_canonical)}")

    _print_section("REFERENCE LOOKUP MATCHES")
    print("Engine reference row:")
    if engine_match:
        _print_json_block(engine_match)
    else:
        print("FALLBACK (no DB match)")
    print("Engine reference values used by scoring:")
    _print_json_block(engine_ref)

    print("\nProp reference row:")
    if prop_match:
        _print_json_block(prop_match)
    else:
        print("FALLBACK (no DB match)")
    print("Prop reference values used by scoring:")
    _print_json_block(prop_ref)

    _print_section("SCORE OUTPUT")
    print(f"{'engine_score':26}: {intelligence.get('engine', {}).get('score', 'N/A')}")
    print(f"{'prop_score':26}: {intelligence.get('prop', {}).get('score', 'N/A')}")
    print(f"{'llp_score':26}: {intelligence.get('llp', {}).get('score', 'N/A')}")
    print(f"{'value_score':26}: {intelligence.get('value_score', 'N/A')}")
    print(f"{'risk_level':26}: {intelligence.get('risk_level', 'N/A')}")
    print(f"{'intelligence_version':26}: {intelligence.get('intelligence_version', 'N/A')}")

    _print_section("DEFERRED MAINTENANCE BREAKDOWN")
    deferred = intelligence.get("deferred_maintenance") or {}
    breakdown = deferred.get("breakdown") or {}
    if not breakdown:
        print("No deferred breakdown available.")
    else:
        for key in [
            "engine_overhaul",
            "prop_overhaul",
            "annual_due",
            "elt_due",
            "caps_due",
            "magneto_500hr",
            "robinson_12yr",
        ]:
            print(f"{key:26}: {_fmt_money(breakdown.get(key, 0))}")
    print(f"{'deferred_total':26}: {_fmt_money(deferred.get('total'))}")
    print(f"{'asking_price':26}: {_fmt_money(deferred.get('asking_price'))}")
    print(f"{'true_cost':26}: {_fmt_money(deferred.get('true_cost'))}")

    llp_items = intelligence.get("llp", {}).get("items") or []
    if llp_items:
        _print_section("LLP ITEM DETAILS")
        _print_json_block(llp_items)


if __name__ == "__main__":
    main()
