"""
Phase 4: Backfill Real Listings Into DB With Scores
Full-Hangar.com — Run after scraping and (optionally) FAA enrichment.

Reads listings from Supabase aircraft_listings, computes aircraft intelligence
for each, and saves:
  - engine_score, prop_score, llp_score, avionics_score, value_score
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
import re
import subprocess
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
from compute_market_comps import (
    build_comps_payload,
    fetch_all_rows,
    fetch_sold_rows,
    fetch_transfer_rows,
    upsert_market_comps,
)
from controller_scraper import _STATE_ABBREV, _normalize_state
from description_parser import parse_description, sanitize_engine_model

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# DB column names for intelligence (flat, queryable)
INTELLIGENCE_COLUMNS = [
    "engine_score",
    "prop_score",
    "llp_score",
    "avionics_score",
    "avionics_installed_value",
    "value_score",
    "condition_score",
    "market_opportunity_score",
    "execution_score",
    "investment_score",
    "pricing_confidence",
    "deferred_total",
    "true_cost",
    "risk_level",
    "deal_rating",
    "deal_tier",
    "vs_median_price",
    "comps_sample_size",
    "comp_selection_tier",
    "comp_universe_size",
    "comp_exact_count",
    "comp_family_count",
    "comp_make_count",
    "comp_median_price",
    "comp_p25_price",
    "comp_p75_price",
    "pricing_mad",
    "mispricing_zscore",
    "deal_comparison_source",
    "intelligence_version",
    "avionics_matched_items",
    "has_glass_cockpit",
    "is_steam_gauge",
    "stc_modifications",
    "stc_market_value_premium_total",
    "total_modification_value",
    "engine_component_comp_sample_size",
    "sold_engine_median_price",
    "engine_model_normalized",
    "engine_remaining_time_factor",
    "normalized_engine_value",
    "avionics_bundle_multiplier",
    "avionics_bundle_profile",
    "avionics_bundle_adjusted_value",
    "avionics_value_source_breakdown",
    "avionics_value_source_primary",
    "avionics_market_sample_total",
    "estimated_component_value",
    "component_gap_value",
    "flip_candidate_triggered",
    "flip_candidate_threshold",
]

OPTIONAL_SCHEMA_COLUMNS = {
    "comps_sample_size",
    "avionics_installed_value",
    "avionics_matched_items",
    "has_glass_cockpit",
    "is_steam_gauge",
    "stc_modifications",
    "stc_market_value_premium_total",
    "total_modification_value",
    "engine_component_comp_sample_size",
    "sold_engine_median_price",
    "engine_model_normalized",
    "engine_remaining_time_factor",
    "normalized_engine_value",
    "avionics_bundle_multiplier",
    "avionics_bundle_profile",
    "avionics_bundle_adjusted_value",
    "avionics_value_source_breakdown",
    "avionics_value_source_primary",
    "avionics_market_sample_total",
    "estimated_component_value",
    "component_gap_value",
    "flip_candidate_triggered",
    "flip_candidate_threshold",
    "condition_score",
    "market_opportunity_score",
    "execution_score",
    "investment_score",
    "pricing_confidence",
    "comp_selection_tier",
    "comp_universe_size",
    "comp_exact_count",
    "comp_family_count",
    "comp_make_count",
    "comp_median_price",
    "comp_p25_price",
    "comp_p75_price",
    "pricing_mad",
    "mispricing_zscore",
}

DB_UPDATE_COLUMNS = sorted(set(INTELLIGENCE_COLUMNS + ["location_state"]))
JSON_UPSERT_EXTRA_COLUMNS = [
    "source",
    "source_id",
    "source_listing_id",
    "price_asking",
    "listing_source",
    "updated_at",
]
JSON_UPSERT_COLUMNS = sorted(set(DB_UPDATE_COLUMNS + JSON_UPSERT_EXTRA_COLUMNS))
PRECHECK_DB_UPDATE_COLUMNS = {
    "deal_rating",
    "deal_tier",
    "deal_comparison_source",
}
PRECHECK_JSON_UPSERT_COLUMNS = PRECHECK_DB_UPDATE_COLUMNS | {"listing_source"}

N_NUMBER_PATTERN = re.compile(r"\bN[\s\-]*([0-9]{1,5}[A-HJ-NP-Z]{0,2})\b", re.I)


def normalize_n_number(raw_value: str | None) -> str | None:
    if not raw_value:
        return None
    compact = re.sub(r"[^A-Za-z0-9]", "", raw_value).upper()
    if not compact:
        return None
    if not compact.startswith("N"):
        compact = f"N{compact}"
    if re.fullmatch(r"N[0-9]{1,5}[A-HJ-NP-Z]{0,2}", compact):
        return compact
    return None


def infer_n_number(listing: dict) -> str | None:
    existing = normalize_n_number(str(listing.get("n_number") or ""))
    if existing:
        return existing

    sources = [
        listing.get("registration"),
        listing.get("tail_number"),
        listing.get("title"),
        listing.get("description"),
        listing.get("description_full"),
    ]
    text = " ".join(str(value or "") for value in sources)
    if not text.strip():
        return None

    match = N_NUMBER_PATTERN.search(text.upper())
    if not match:
        return None
    return normalize_n_number(f"N{match.group(1)}")


def parse_missing_column_names_from_exception(exc: Exception) -> set[str]:
    """Extract missing aircraft_listings column names from known Supabase/Postgres error text."""
    message = str(exc)
    missing_columns = set(
        re.findall(r"Could not find the '([a-zA-Z0-9_]+)' column", message)
    )
    # PostgREST often formats this as "...'foo' column of 'aircraft_listings'..."
    missing_columns.update(
        re.findall(r"'([a-zA-Z0-9_]+)'\s+column\s+of\s+'aircraft_listings'", message)
    )
    missing_columns.update(
        re.findall(r"column\s+aircraft_listings\.([a-zA-Z0-9_]+)\s+does not exist", message)
    )
    missing_columns.update(
        re.findall(r'column\s+"?([a-zA-Z0-9_]+)"?\s+of\s+relation\s+"?aircraft_listings"?\s+does not exist', message)
    )
    return missing_columns


def parse_optional_missing_columns_from_exception(exc: Exception) -> set[str]:
    """
    Best-effort fallback for optional intelligence columns.
    Handles cases where provider exception formatting defeats regex extraction.
    """
    message = str(exc)
    lowered = message.lower()
    inferred: set[str] = set()
    for column in OPTIONAL_SCHEMA_COLUMNS:
        if column in message and (
            "schema cache" in lowered or "does not exist" in lowered or "could not find" in lowered
        ):
            inferred.add(column)
    return inferred


def detect_missing_table_columns(
    supabase,
    *,
    table: str,
    candidate_columns: set[str],
    context_label: str,
) -> set[str]:
    """
    Detect missing DB columns once at startup using a select probe.
    This avoids repeated first-row retry noise during backfill.
    """
    remaining = set(candidate_columns)
    missing_total: set[str] = set()
    if not remaining:
        return missing_total

    while True:
        probe_select = ",".join(sorted(remaining))
        try:
            supabase.table(table).select(probe_select).limit(1).execute()
            break
        except Exception as exc:
            missing_cols = parse_missing_column_names_from_exception(exc)
            if not missing_cols:
                missing_cols = parse_optional_missing_columns_from_exception(exc)
            retryable = sorted(col for col in missing_cols if col in remaining)
            if not retryable:
                log.warning(
                    "Schema probe could not parse missing columns for %s; continuing with runtime fallback. Error: %s",
                    context_label,
                    exc,
                )
                break
            for column in retryable:
                remaining.discard(column)
            missing_total.update(retryable)
            if not remaining:
                break
    if missing_total:
        log.warning(
            "Preflight schema warning for %s: missing %s; these will be auto-dropped until migrations are applied.",
            context_label,
            ", ".join(sorted(missing_total)),
        )
    return missing_total


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
    avionics = intel.get("avionics") or {}
    avionics_score = avionics.get("score")
    if isinstance(avionics_score, (int, float)):
        avionics_score = int(round(avionics_score))

    row = {
        "engine_score": (intel.get("engine") or {}).get("score"),
        "prop_score": (intel.get("prop") or {}).get("score"),
        "llp_score": (intel.get("llp") or {}).get("score"),
        "avionics_score": avionics_score,
        "avionics_installed_value": avionics.get("installed_value"),
        "value_score": intel.get("value_score"),
        "condition_score": intel.get("condition_score"),
        "market_opportunity_score": intel.get("market_opportunity_score"),
        "execution_score": intel.get("execution_score"),
        "investment_score": intel.get("investment_score"),
        "pricing_confidence": intel.get("pricing_confidence"),
        "deferred_total": deferred.get("total"),
        "true_cost": deferred.get("true_cost"),
        "risk_level": intel.get("risk_level"),
        "deal_rating": intel.get("deal_rating"),
        "deal_tier": intel.get("deal_tier"),
        "vs_median_price": intel.get("vs_median_price"),
        "comps_sample_size": intel.get("comps_sample_size"),
        "comp_selection_tier": intel.get("comp_selection_tier"),
        "comp_universe_size": intel.get("comp_universe_size"),
        "comp_exact_count": intel.get("comp_exact_count"),
        "comp_family_count": intel.get("comp_family_count"),
        "comp_make_count": intel.get("comp_make_count"),
        "comp_median_price": intel.get("comp_median_price"),
        "comp_p25_price": intel.get("comp_p25_price"),
        "comp_p75_price": intel.get("comp_p75_price"),
        "pricing_mad": intel.get("pricing_mad"),
        "mispricing_zscore": intel.get("mispricing_zscore"),
        "deal_comparison_source": intel.get("deal_comparison_source"),
        "intelligence_version": intel.get("intelligence_version"),
        "avionics_matched_items": avionics.get("matched_items"),
        "has_glass_cockpit": avionics.get("has_glass_cockpit"),
        "is_steam_gauge": avionics.get("is_steam_gauge"),
        "stc_modifications": intel.get("stc_modifications"),
        "stc_market_value_premium_total": intel.get("stc_market_value_premium_total"),
        "total_modification_value": avionics.get("total_modification_value"),
        "engine_component_comp_sample_size": intel.get("engine_component_comp_sample_size"),
        "sold_engine_median_price": intel.get("sold_engine_median_price"),
        "engine_model_normalized": intel.get("engine_model_normalized"),
        "engine_remaining_time_factor": intel.get("engine_remaining_time_factor"),
        "normalized_engine_value": intel.get("normalized_engine_value"),
        "avionics_bundle_multiplier": intel.get("avionics_bundle_multiplier"),
        "avionics_bundle_profile": intel.get("avionics_bundle_profile"),
        "avionics_bundle_adjusted_value": intel.get("avionics_bundle_adjusted_value"),
        "avionics_value_source_breakdown": intel.get("avionics_value_source_breakdown"),
        "avionics_value_source_primary": intel.get("avionics_value_source_primary"),
        "avionics_market_sample_total": intel.get("avionics_market_sample_total"),
        "estimated_component_value": intel.get("estimated_component_value"),
        "component_gap_value": intel.get("component_gap_value"),
        "flip_candidate_triggered": intel.get("flip_candidate_triggered"),
        "flip_candidate_threshold": intel.get("flip_candidate_threshold"),
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
        "avionics_description": row.get("avionics_description") or row.get("avionics_notes"),
        "total_time_airframe": row.get("total_time_airframe"),
        "time_since_overhaul": row.get("time_since_overhaul"),
        "time_since_new_engine": row.get("time_since_new_engine"),
        "time_since_prop_overhaul": row.get("time_since_prop_overhaul"),
        "aircraft_type": row.get("aircraft_type"),
        "engine_model": row.get("engine_model"),
        "days_on_market": row.get("days_on_market"),
        "price_reduced": row.get("price_reduced"),
        "accident_count": row.get("accident_count"),
        "most_recent_accident_date": row.get("most_recent_accident_date"),
        "most_severe_damage": row.get("most_severe_damage"),
        "has_accident_history": row.get("has_accident_history"),
    }


def parser_backfill_updates(row: dict) -> dict:
    """Extract parser-driven enrichment fields from description text."""
    parser_text = f"{row.get('description') or ''} {row.get('description_full') or ''}".strip()
    if not parser_text:
        return {}

    parsed = parse_description(parser_text)
    updates: dict[str, object] = {"description_intelligence": parsed}

    parsed_times = parsed.get("times", {})
    parsed_tt = parsed_times.get("total_time")
    if row.get("total_time_airframe") in (None, "", 0) and isinstance(parsed_tt, int):
        updates["total_time_airframe"] = parsed_tt

    parsed_smoh = parsed_times.get("engine_smoh")
    if row.get("engine_time_since_overhaul") in (None, "", 0) and isinstance(parsed_smoh, int):
        updates["engine_time_since_overhaul"] = parsed_smoh

    raw_engine_model = row.get("engine_model")
    raw_engine_text = str(raw_engine_model).strip() if raw_engine_model else ""
    cleaned_existing_engine_model = sanitize_engine_model(raw_engine_text)
    parsed_engine_model = parsed.get("engine", {}).get("model")
    if isinstance(parsed_engine_model, str):
        if not cleaned_existing_engine_model or len(raw_engine_text) > 120:
            updates["engine_model"] = parsed_engine_model
    elif cleaned_existing_engine_model and cleaned_existing_engine_model != raw_engine_text:
        updates["engine_model"] = cleaned_existing_engine_model

    return updates


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
        "description", "description_full", "avionics_description", "avionics_notes", "total_time_airframe",
        "value_score", "avionics_score",
        "time_since_overhaul", "time_since_new_engine", "time_since_prop_overhaul", "engine_time_since_overhaul",
        "aircraft_type", "engine_model", "days_on_market", "price_reduced",
        "accident_count", "most_recent_accident_date", "most_severe_damage", "has_accident_history",
    ]
    active_select_cols = list(select_cols)

    def _execute_select_with_fallback(base_query_builder):
        nonlocal active_select_cols
        while True:
            try:
                query = base_query_builder(",".join(active_select_cols))
                return query.execute()
            except Exception as exc:
                missing_cols = parse_missing_column_names_from_exception(exc)
                missing_active_cols = [col for col in missing_cols if col in active_select_cols]
                if not missing_active_cols:
                    raise
                for missing_column in missing_active_cols:
                    active_select_cols = [col for col in active_select_cols if col != missing_column]
                    log.warning(
                        "Column '%s' not found in aircraft_listings; retrying backfill query without it.",
                        missing_column,
                    )

    def _fetch_rows_with_null(column_name: str) -> list[dict]:
        def _builder(select_clause: str):
            query = (
                supabase.table("aircraft_listings")
                .select(select_clause)
                .is_(column_name, "null")
                .order("id", desc=False)
            )
            if limit:
                query = query.limit(limit)
            return query

        result = _execute_select_with_fallback(_builder)
        return result.data or []

    if score_only_missing:
        # Client compatibility: merge two null-filtered queries instead of using .or_().
        missing_value_rows = _fetch_rows_with_null("value_score")
        missing_avionics_rows = _fetch_rows_with_null("avionics_score")
        merged_by_id: dict[object, dict] = {}
        for row in [*missing_value_rows, *missing_avionics_rows]:
            row_id = row.get("id")
            if row_id is None:
                continue
            merged_by_id[row_id] = row
        rows = [merged_by_id[row_id] for row_id in sorted(merged_by_id)]
        if limit:
            rows = rows[:limit]
    else:
        def _builder(select_clause: str):
            query = supabase.table("aircraft_listings").select(select_clause).order("id", desc=False)
            if limit:
                query = query.limit(limit)
            return query

        result = _execute_select_with_fallback(_builder)
        rows = result.data or []
    log.info(f"Found {len(rows)} listings to score (score_only_missing={score_only_missing}, limit={limit})")

    attempted = 0
    scored = 0
    failed = 0
    updated = 0
    dropped_update_columns = detect_missing_table_columns(
        supabase,
        table="aircraft_listings",
        candidate_columns=PRECHECK_DB_UPDATE_COLUMNS,
        context_label="DB update payload",
    )
    if dropped_update_columns:
        log.info(
            "Pre-dropped %d missing update column(s): %s",
            len(dropped_update_columns),
            ", ".join(sorted(dropped_update_columns)),
        )
    for row in rows:
        attempted += 1
        listing = listing_for_intelligence(row)
        parser_updates = parser_backfill_updates(row)
        if "total_time_airframe" in parser_updates and listing.get("total_time_airframe") in (None, "", 0):
            listing["total_time_airframe"] = parser_updates["total_time_airframe"]
        if "engine_time_since_overhaul" in parser_updates and listing.get("time_since_overhaul") in (None, "", 0):
            listing["time_since_overhaul"] = parser_updates["engine_time_since_overhaul"]
        if "engine_model" in parser_updates:
            listing["engine_model"] = parser_updates["engine_model"]
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
        if parser_updates:
            update_payload.update(parser_updates)
        if dropped_update_columns:
            update_payload = {k: v for k, v in update_payload.items() if k not in dropped_update_columns}
        if dry_run:
            log.info(f"  [dry-run] id={row['id']} value_score={update_payload['value_score']} risk={update_payload['risk_level']} deferred=${update_payload['deferred_total'] or 0:,}")
            updated += 1
            continue
        source_id = str(row.get("id") or "unknown")
        while True:
            try:
                supabase.table("aircraft_listings").update(update_payload).eq("id", row["id"]).execute()
                updated += 1
                if updated % 50 == 0:
                    log.info(f"  Updated {updated} listings...")
                break
            except Exception as e:
                missing_cols = parse_missing_column_names_from_exception(e)
                if not missing_cols:
                    missing_cols = parse_optional_missing_columns_from_exception(e)
                retryable_cols = sorted(col for col in missing_cols if col in update_payload)
                if retryable_cols:
                    dropped_update_columns.update(retryable_cols)
                    update_payload = {k: v for k, v in update_payload.items() if k not in retryable_cols}
                    log.warning(
                        "Update missing column(s) %s for id=%s; dropping from payload and retrying.",
                        ", ".join(retryable_cols),
                        source_id,
                    )
                    continue
                failed += 1
                log_scoring_error(source_id, e)
                log.error(f"Update failed for id={source_id}: {e}")
                break

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
    upsert_probe_columns = PRECHECK_JSON_UPSERT_COLUMNS
    dropped_upsert_columns = detect_missing_table_columns(
        supabase,
        table="aircraft_listings",
        candidate_columns=upsert_probe_columns,
        context_label="JSON upsert payload",
    )
    if dropped_upsert_columns:
        log.info(
            "Pre-dropped %d missing upsert column(s): %s",
            len(dropped_upsert_columns),
            ", ".join(sorted(dropped_upsert_columns)),
        )
    for L in listings:
        if not L.get("source_id") and not L.get("source_url"):
            failed += 1
            log_scoring_error("unknown", ValueError("Missing source_id/source_url"))
            log.warning("Skipping listing without source_id/source_url")
            continue
        attempted += 1
        try:
            inferred_n = infer_n_number(L)
            if inferred_n and not L.get("n_number"):
                L["n_number"] = inferred_n
            intel = aircraft_intelligence_score(L)
        except Exception as e:
            failed += 1
            source_id = str(L.get("source_id") or L.get("source_url") or "unknown")
            log_scoring_error(source_id, e)
            log.warning(f"Intelligence failed for {source_id}: {e}")
            continue
        scored += 1
        normalized_price = L.get("asking_price")
        if normalized_price in (None, "", 0, "0"):
            normalized_price = L.get("price_asking")

        row = {
            **{k: v for k, v in L.items() if v is not None and k not in ("listing_quality", "intelligence")},
            **intelligence_to_row(intel, L),
            # Keep legacy/current aliases in sync when target schema uses alternate names.
            "source_listing_id": L.get("source_id"),
            "asking_price": normalized_price,
            "price_asking": normalized_price,
            "source": L.get("source") or "aerotrader",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if dropped_upsert_columns:
            row = {k: v for k, v in row.items() if k not in dropped_upsert_columns}
        if dry_run:
            log.info(f"  [dry-run] {row.get('source_id')} value_score={row['value_score']} risk={row['risk_level']} deferred=${row.get('deferred_total') or 0:,}")
            updated += 1
            continue
        source_id = str(row.get("source_id") or row.get("source_url") or "unknown")
        while True:
            try:
                supabase.table("aircraft_listings").upsert(row, on_conflict="source,source_id").execute()
                updated += 1
                break
            except Exception as e:
                missing_cols = parse_missing_column_names_from_exception(e)
                if not missing_cols:
                    missing_cols = parse_optional_missing_columns_from_exception(e)
                retryable_cols = sorted(col for col in missing_cols if col in row)
                if retryable_cols:
                    dropped_upsert_columns.update(retryable_cols)
                    row = {k: v for k, v in row.items() if k not in retryable_cols}
                    log.warning(
                        "Upsert missing column(s) %s for %s; dropping from payload and retrying.",
                        ", ".join(retryable_cols),
                        source_id,
                    )
                    continue
                # Some environments enforce uniqueness on (source_site, source_listing_id)
                # while this path upserts on (source, source_id). If we hit that duplicate
                # constraint, update the existing row by source_site/source_listing_id.
                err_msg = str(e)
                if "idx_listings_source" in err_msg and "source_listing_id" in err_msg:
                    source_site = row.get("source_site")
                    source_listing_id = row.get("source_listing_id")
                    if source_site and source_listing_id:
                        try:
                            (
                                supabase.table("aircraft_listings")
                                .update(row)
                                .eq("source_site", source_site)
                                .eq("source_listing_id", source_listing_id)
                                .execute()
                            )
                            updated += 1
                            log.warning(
                                "Upsert conflict for %s resolved via source_site/source_listing_id update fallback.",
                                source_id,
                            )
                            break
                        except Exception as fallback_exc:
                            log.error(
                                "Fallback update failed for %s via source_site/source_listing_id: %s",
                                source_id,
                                fallback_exc,
                            )
                failed += 1
                log_scoring_error(source_id, e)
                log.error(f"Upsert failed for {source_id}: {e}")
                break

    return attempted, scored, failed, updated


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Backfill aircraft_listings with intelligence scores")
    parser.add_argument("--limit", type=int, default=None, help="Max number of DB rows to process")
    parser.add_argument("--all", action="store_true", help="Re-score all listings (ignore missing-scores filter)")
    parser.add_argument("--dry-run", action="store_true", help="Compute scores but do not write to DB")
    parser.add_argument("--from-json", type=str, metavar="PATH", help="Backfill from JSON file (upsert by source,source_id)")
    parser.add_argument(
        "--compute-comps",
        action="store_true",
        help="Recompute market_comps after backfill finishes",
    )
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
                candidates = [
                    Path.cwd() / path,
                    _ROOT / path,
                ]
                path = next((candidate for candidate in candidates if candidate.exists()), _ROOT / path)
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
        if args.compute_comps:
            try:
                comps_supabase = get_supabase()
                all_rows = fetch_all_rows(comps_supabase)
                sold_rows = fetch_sold_rows(comps_supabase)
                transfer_rows = fetch_transfer_rows(comps_supabase)
                comps_rows = build_comps_payload(
                    all_rows,
                    sold_rows,
                    transfer_rows,
                    min_sample=5,
                )
                if args.dry_run:
                    log.info("Dry-run: market comps would recompute %s groups", len(comps_rows))
                else:
                    upserted = upsert_market_comps(comps_supabase, comps_rows)
                    log.info(
                        "Market comps recomputed after backfill: groups=%s upserted=%s",
                        len(comps_rows),
                        upserted,
                    )
            except Exception as e:
                log.error("Failed to recompute market comps after backfill: %s", e)
                if not args.dry_run:
                    # Fallback path: run standalone recompute to avoid leaving comps stale.
                    try:
                        cmd = [sys.executable, str(Path(__file__).resolve().parent / "compute_market_comps.py")]
                        fallback = subprocess.run(cmd, check=False, capture_output=True, text=True)
                        if fallback.returncode == 0:
                            output = (fallback.stdout or "").strip()
                            if output:
                                log.info("Market comps fallback succeeded: %s", output)
                            else:
                                log.info("Market comps fallback succeeded.")
                        else:
                            log.error(
                                "Market comps fallback failed (exit=%s): %s",
                                fallback.returncode,
                                (fallback.stderr or fallback.stdout or "").strip(),
                            )
                    except Exception as fallback_exc:
                        log.error("Market comps fallback crashed: %s", fallback_exc)

    if run_error:
        raise run_error


if __name__ == "__main__":
    main()
