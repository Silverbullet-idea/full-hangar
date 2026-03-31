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
import time
from collections import Counter
from pathlib import Path

# Allow importing core when run from scraper/
_ROOT = Path(__file__).resolve().parent
if _ROOT.name == "scraper":
    sys.path.insert(0, str(_ROOT.parent))

from dotenv import load_dotenv

load_dotenv()

from core.intelligence.aircraft_intelligence import INTELLIGENCE_VERSION, aircraft_intelligence_score
from core.intelligence.engine_identity_model import is_plausible_engine_identity_model
from backfill_log import log_backfill_run, log_scoring_error
from compute_market_comps import (
    build_comps_payload,
    build_regional_comps_payload,
    fetch_all_rows,
    fetch_sold_rows,
    fetch_transfer_rows,
    upsert_market_comps,
    upsert_market_comps_regional,
)
from registration_parser import derive_registration_fields, normalize_us_n_number
try:
    from controller_scraper import _STATE_ABBREV, _normalize_state
except Exception:
    # Compatibility fallback for environments where controller_scraper
    # cannot be imported as a module dependency.
    _STATE_ABBREV = {
        "alabama": "AL",
        "alaska": "AK",
        "arizona": "AZ",
        "arkansas": "AR",
        "california": "CA",
        "colorado": "CO",
        "connecticut": "CT",
        "delaware": "DE",
        "florida": "FL",
        "georgia": "GA",
        "hawaii": "HI",
        "idaho": "ID",
        "illinois": "IL",
        "indiana": "IN",
        "iowa": "IA",
        "kansas": "KS",
        "kentucky": "KY",
        "louisiana": "LA",
        "maine": "ME",
        "maryland": "MD",
        "massachusetts": "MA",
        "michigan": "MI",
        "minnesota": "MN",
        "mississippi": "MS",
        "missouri": "MO",
        "montana": "MT",
        "nebraska": "NE",
        "nevada": "NV",
        "new hampshire": "NH",
        "new jersey": "NJ",
        "new mexico": "NM",
        "new york": "NY",
        "north carolina": "NC",
        "north dakota": "ND",
        "ohio": "OH",
        "oklahoma": "OK",
        "oregon": "OR",
        "pennsylvania": "PA",
        "rhode island": "RI",
        "south carolina": "SC",
        "south dakota": "SD",
        "tennessee": "TN",
        "texas": "TX",
        "utah": "UT",
        "vermont": "VT",
        "virginia": "VA",
        "washington": "WA",
        "west virginia": "WV",
        "wisconsin": "WI",
        "wyoming": "WY",
        "district of columbia": "DC",
    }

    def _normalize_state(value: str | None) -> str | None:
        if not value:
            return None
        text = str(value).strip()
        if not text:
            return None
        if len(text) == 2 and text.isalpha():
            return text.upper()
        return _STATE_ABBREV.get(text.lower())
from description_parser import parse_description, sanitize_engine_model
from supabase.lib.client_options import ClientOptions

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


def _quiet_http_client_loggers() -> None:
    """Drop per-request HTTP noise so consoles show backfill progress (Updated N...) instead of freezing."""
    for name in ("httpx", "httpcore"):
        logging.getLogger(name).setLevel(logging.WARNING)


def _quiet_http_from_env() -> bool:
    v = os.environ.get("FULL_HANGAR_BACKFILL_QUIET_HTTP", "").strip().lower()
    return v in ("1", "true", "yes", "on")


if _quiet_http_from_env():
    _quiet_http_client_loggers()

DB_CURSOR_PAGE_SIZE = max(50, int(os.environ.get("BACKFILL_DB_PAGE_SIZE", "500")))
ROW_SLOW_WARNING_SECONDS = max(
    5.0, float(os.environ.get("BACKFILL_ROW_SLOW_WARNING_SECONDS", "20"))
)
POSTGREST_TIMEOUT_SECONDS = max(
    3.0, float(os.environ.get("SUPABASE_POSTGREST_TIMEOUT_SECONDS", "8"))
)
STORAGE_TIMEOUT_SECONDS = max(
    3.0, float(os.environ.get("SUPABASE_STORAGE_TIMEOUT_SECONDS", "20"))
)
DEFAULT_CHECKPOINT_PATH = _ROOT / "state" / "backfill_scores_checkpoint.json"
CHECKPOINT_WRITE_EVERY = max(1, int(os.environ.get("BACKFILL_CHECKPOINT_EVERY_ROWS", "25")))
COMP_CIRCUIT_BREAKER_SECONDS = max(
    5.0, float(os.environ.get("BACKFILL_COMP_CIRCUIT_BREAKER_SECONDS", "45"))
)
COMP_CIRCUIT_BREAKER_CONSECUTIVE = max(
    1, int(os.environ.get("BACKFILL_COMP_CIRCUIT_BREAKER_CONSECUTIVE", "3"))
)

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
    "engine_tbo_hours",
    "score_data",
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

def _write_checkpoint(
    checkpoint_path: Path | None,
    *,
    last_id: object | None,
    attempted: int,
    scored: int,
    failed: int,
    updated: int,
    score_only_missing: bool,
) -> None:
    if checkpoint_path is None:
        return
    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 1,
        "last_id": last_id,
        "attempted": attempted,
        "scored": scored,
        "failed": failed,
        "updated": updated,
        "score_only_missing": score_only_missing,
        "updated_at_epoch": int(time.time()),
    }
    checkpoint_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _read_checkpoint(checkpoint_path: Path) -> dict | None:
    if not checkpoint_path.exists():
        return None
    try:
        payload = json.loads(checkpoint_path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return None
        return payload
    except Exception as exc:
        log.warning("Checkpoint read failed (%s): %s", checkpoint_path, exc)
        return None


def _clear_checkpoint(checkpoint_path: Path | None) -> None:
    if checkpoint_path is None:
        return
    try:
        if checkpoint_path.exists():
            checkpoint_path.unlink()
    except Exception as exc:
        log.warning("Could not clear checkpoint (%s): %s", checkpoint_path, exc)


def normalize_n_number(raw_value: str | None) -> str | None:
    return normalize_us_n_number(raw_value)


def infer_n_number(listing: dict) -> str | None:
    existing = normalize_n_number(str(listing.get("n_number") or ""))
    if existing:
        return existing

    fields = derive_registration_fields(
        raw_value=str(
            listing.get("registration_raw")
            or listing.get("registration")
            or listing.get("tail_number")
            or ""
        ),
        fallback_text=" ".join(
            str(value or "")
            for value in (
                listing.get("title"),
                listing.get("description"),
                listing.get("description_full"),
            )
        ),
    )
    return normalize_n_number(str(fields.get("n_number") or ""))


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


def is_transient_supabase_update_error(exc: Exception) -> bool:
    """Identify transient provider/API errors that are safe to retry."""
    text = str(exc).lower()
    transient_markers = (
        "500 internal server error",
        "json could not be generated",
        "cloudflare",
        "timed out",
    )
    return any(marker in text for marker in transient_markers)


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
    try:
        options = ClientOptions(
            postgrest_client_timeout=POSTGREST_TIMEOUT_SECONDS,
            storage_client_timeout=STORAGE_TIMEOUT_SECONDS,
        )
        return create_client(url, key, options=options)
    except Exception:
        # Compatibility fallback for supabase client variants that don't expose
        # the expected ClientOptions shape.
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
        "flip_score": intel.get("flip_score"),
        "flip_tier": intel.get("flip_tier"),
        "flip_explanation": intel.get("flip_explanation"),
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
        "engine_hours_smoh": intel.get("engine_hours_smoh"),
        "engine_remaining_value": intel.get("engine_remaining_value"),
        "engine_overrun_liability": intel.get("engine_overrun_liability"),
        "engine_reserve_per_hour": intel.get("engine_reserve_per_hour"),
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
    eng_block = intel.get("engine") or {}
    if eng_block.get("tbo_known") and eng_block.get("tbo_hours") is not None:
        try:
            row["engine_tbo_hours"] = int(eng_block["tbo_hours"])
        except (TypeError, ValueError):
            pass
    raw_state = (listing or {}).get("location_state")
    if isinstance(raw_state, str) and raw_state.strip():
        # Convert full state names (e.g. Texas) to abbreviations before upsert.
        clean = raw_state.strip()
        row["location_state"] = _STATE_ABBREV.get(clean.lower()) or _normalize_state(clean)
    return row


def merge_score_data_engine_reference(row: dict, engine_reference: dict | None) -> dict | None:
    """Merge engine_reference into existing score_data JSON; returns new dict or None if nothing to merge."""
    if not engine_reference:
        return None
    sd = row.get("score_data")
    if isinstance(sd, str):
        try:
            sd = json.loads(sd)
        except Exception:
            sd = {}
    if not isinstance(sd, dict):
        sd = {}
    return {**sd, "engine_reference": engine_reference}


def listing_for_intelligence(row: dict) -> dict:
    """Build a listing dict suitable for aircraft_intelligence_score from a DB row."""
    resolved_engine_model = resolve_engine_model_for_scoring(row)
    listing_raw_em = sanitize_engine_model(row.get("engine_model"))
    faa_em = sanitize_engine_model(row.get("faa_engine_model"))

    # DB may use different keys; normalize to what intelligence expects
    return {
        "year": row.get("year"),
        "make": row.get("make"),
        "model": row.get("model"),
        "asking_price": row.get("asking_price"),
        "description": row.get("description"),
        "description_full": row.get("description_full"),
        "description_intelligence": row.get("description_intelligence"),
        "avionics_notes": row.get("avionics_notes"),
        "avionics_description": row.get("avionics_description") or row.get("avionics_notes"),
        "total_time_airframe": row.get("total_time_airframe"),
        "time_since_overhaul": row.get("time_since_overhaul"),
        "time_since_new_engine": row.get("time_since_new_engine"),
        "time_since_prop_overhaul": row.get("time_since_prop_overhaul"),
        "aircraft_type": row.get("aircraft_type"),
        "engine_model": resolved_engine_model,
        "engine_model_listing_raw": listing_raw_em or None,
        "faa_engine_model": faa_em or None,
        "faa_engine_manufacturer": (str(row.get("faa_engine_manufacturer") or "").strip() or None),
        "engine_manufacturer": (str(row.get("engine_manufacturer") or "").strip() or None),
        "engine_make": (str(row.get("engine_make") or "").strip() or None),
        "engine_tbo_hours": row.get("engine_tbo_hours"),
        "days_on_market": row.get("days_on_market"),
        "price_reduced": row.get("price_reduced"),
        "accident_count": row.get("accident_count"),
        "most_recent_accident_date": row.get("most_recent_accident_date"),
        "most_severe_damage": row.get("most_severe_damage"),
        "has_accident_history": row.get("has_accident_history"),
    }


_ENGINE_MODEL_JUNK_TOKENS = {
    "OUT",
    "ONE",
    "OUR",
    "ORIGINAL",
    "OPERATION",
    "OPERATIONS",
    "OFFERS",
    "OFFER",
    "ORIGINALLY",
    "OWNERSHIP",
    "OVERHAUL",
    "OUTSTANDING",
    "OPTIONAL",
    "GOLD",
    "ANALYZER",
}

_ENGINE_MODEL_VENDOR_ONLY = {"CONTINENTAL", "LYCOMING", "PRATT & WHITNEY", "PRATT AND WHITNEY", "ROTAX"}


def is_unusable_engine_model(value: str | None) -> bool:
    cleaned = sanitize_engine_model(value)
    if not cleaned:
        return True
    token = cleaned.strip().upper()
    if not token:
        return True
    if token in _ENGINE_MODEL_JUNK_TOKENS:
        return True
    if token in _ENGINE_MODEL_VENDOR_ONLY:
        return True
    # Reject single-word narrative fragments with no numeric model token.
    if " " not in token and not re.search(r"\d", token) and len(token) <= 12:
        return True
    # Reject long narrative strings that have no model-like numeric token.
    if len(token) > 36 and not re.search(r"\d", token):
        return True
    if not is_plausible_engine_identity_model(cleaned):
        return True
    return False


def promote_engine_model_from_faa_if_listing_junk(row: dict, update_payload: dict) -> None:
    """When listing engine_model is maintenance prose but FAA model is clean, persist FAA model."""
    primary = sanitize_engine_model(row.get("engine_model"))
    faa_m = sanitize_engine_model(row.get("faa_engine_model"))
    if not faa_m:
        return
    if is_unusable_engine_model(primary) and not is_unusable_engine_model(faa_m):
        update_payload["engine_model"] = faa_m


def resolve_engine_model_for_scoring(row: dict) -> str | None:
    primary_engine_model = sanitize_engine_model(row.get("engine_model"))
    faa_engine_model = sanitize_engine_model(row.get("faa_engine_model"))

    primary_usable = not is_unusable_engine_model(primary_engine_model)
    faa_usable = not is_unusable_engine_model(faa_engine_model)

    if primary_usable:
        return primary_engine_model
    if faa_usable:
        return faa_engine_model
    return None


def build_parser_text(row: dict) -> str:
    """
    Build robust parser input from available listing text fields.
    For sparse rows (common on source-null records), include title/avionics snippets
    so avionics extraction still has a chance to resolve equipment.
    """
    chunks: list[str] = []
    seen: set[str] = set()

    def add_chunk(value: object) -> None:
        text = str(value or "").strip()
        if not text:
            return
        normalized = " ".join(text.split())
        key = normalized.lower()
        if key in seen:
            return
        seen.add(key)
        chunks.append(normalized)

    # Primary narrative fields first.
    add_chunk(row.get("description"))
    add_chunk(row.get("description_full"))

    source_value = str(row.get("source") or "").strip().lower()
    primary_text = " ".join(chunks)
    sparse_primary = len(primary_text) < 60

    # Source-null and sparse rows often only carry useful signal in short metadata fields.
    if sparse_primary or source_value in {"", "null", "none"}:
        add_chunk(row.get("title"))
        add_chunk(row.get("avionics_description"))
        add_chunk(row.get("avionics_notes"))
        add_chunk(row.get("model"))
        add_chunk(row.get("make"))

    return " ".join(chunks).strip()


def parser_backfill_updates(row: dict) -> dict:
    """Extract parser-driven enrichment fields from description text."""
    parser_text = build_parser_text(row)
    if not parser_text:
        return {}

    parsed = parse_description(parser_text)
    existing_intel = row.get("description_intelligence")
    if isinstance(existing_intel, str):
        try:
            existing_intel = json.loads(existing_intel)
        except Exception:
            existing_intel = {}
    if isinstance(existing_intel, dict):
        existing_ctx = existing_intel.get("pricing_context")
        parsed_ctx = parsed.get("pricing_context")
        if isinstance(existing_ctx, dict) and isinstance(parsed_ctx, dict):
            for key in (
                "share_price",
                "normalized_full_price",
                "share_numerator",
                "share_denominator",
                "share_percent",
            ):
                if parsed_ctx.get(key) is None and existing_ctx.get(key) is not None:
                    parsed_ctx[key] = existing_ctx.get(key)
            if existing_ctx.get("is_fractional") is True:
                parsed_ctx["is_fractional"] = True
            if existing_ctx.get("review_needed") is True and parsed_ctx.get("is_fractional") is not True:
                parsed_ctx["review_needed"] = True
            existing_evidence = existing_ctx.get("evidence")
            parsed_evidence = parsed_ctx.get("evidence")
            evidence: list[str] = []
            for source in (parsed_evidence, existing_evidence):
                if isinstance(source, list):
                    for value in source:
                        text = str(value).strip()
                        if text and text not in evidence:
                            evidence.append(text)
            if evidence:
                parsed_ctx["evidence"] = evidence[:3]
            parsed["pricing_context"] = parsed_ctx

    updates: dict[str, object] = {"description_intelligence": parsed}
    pricing_context = parsed.get("pricing_context") if isinstance(parsed, dict) else None
    if isinstance(pricing_context, dict):
        share_numerator = pricing_context.get("share_numerator")
        share_denominator = pricing_context.get("share_denominator")
        share_percent = pricing_context.get("share_percent")
        share_price = pricing_context.get("share_price")
        normalized_full = pricing_context.get("normalized_full_price")
        review_needed = pricing_context.get("review_needed")
        evidence = pricing_context.get("evidence")
        updates["is_fractional_ownership"] = bool(pricing_context.get("is_fractional"))
        updates["fractional_share_numerator"] = int(share_numerator) if isinstance(share_numerator, (int, float)) else None
        updates["fractional_share_denominator"] = int(share_denominator) if isinstance(share_denominator, (int, float)) else None
        updates["fractional_share_percent"] = float(share_percent) if isinstance(share_percent, (int, float)) else None
        updates["fractional_share_price"] = float(share_price) if isinstance(share_price, (int, float)) else None
        updates["fractional_full_price_estimate"] = (
            float(normalized_full) if isinstance(normalized_full, (int, float)) else None
        )
        updates["fractional_review_needed"] = bool(review_needed)
        updates["fractional_pricing_evidence"] = evidence if isinstance(evidence, list) else None

    def _to_hour_int(value: object) -> int | None:
        if not isinstance(value, (int, float)):
            return None
        numeric = float(value)
        if numeric <= 0:
            return None
        return int(round(numeric))

    parsed_times = parsed.get("times", {})
    parsed_tt = parsed_times.get("total_time")
    parsed_tt_int = _to_hour_int(parsed_tt)
    if row.get("total_time_airframe") in (None, "", 0) and parsed_tt_int is not None:
        updates["total_time_airframe"] = parsed_tt_int

    parsed_smoh = parsed_times.get("engine_smoh")
    parsed_smoh_int = _to_hour_int(parsed_smoh)
    if row.get("engine_time_since_overhaul") in (None, "", 0) and parsed_smoh_int is not None:
        updates["engine_time_since_overhaul"] = parsed_smoh_int

    parsed_spoh = parsed_times.get("prop_spoh")
    parsed_spoh_int = _to_hour_int(parsed_spoh)
    if row.get("time_since_prop_overhaul") in (None, "", 0) and parsed_spoh_int is not None:
        updates["time_since_prop_overhaul"] = parsed_spoh_int

    raw_prop_model = row.get("prop_model")
    raw_prop_text = str(raw_prop_model).strip() if raw_prop_model else ""
    parsed_prop_model = parsed.get("prop", {}).get("model")
    if isinstance(parsed_prop_model, str) and parsed_prop_model.strip():
        if not raw_prop_text or len(raw_prop_text) > 120:
            updates["prop_model"] = parsed_prop_model.strip()

    raw_engine_model = row.get("engine_model")
    raw_engine_text = str(raw_engine_model).strip() if raw_engine_model else ""
    cleaned_existing_engine_model = sanitize_engine_model(raw_engine_text)
    existing_engine_unusable = is_unusable_engine_model(cleaned_existing_engine_model)
    cleaned_faa_engine_model = sanitize_engine_model(row.get("faa_engine_model"))
    faa_engine_usable = not is_unusable_engine_model(cleaned_faa_engine_model)
    parsed_engine_model = parsed.get("engine", {}).get("model")
    if isinstance(parsed_engine_model, str):
        parsed_engine_model_clean = sanitize_engine_model(parsed_engine_model)
        if parsed_engine_model_clean and (
            not cleaned_existing_engine_model
            or existing_engine_unusable
            or len(raw_engine_text) > 120
        ):
            updates["engine_model"] = parsed_engine_model_clean
    elif cleaned_existing_engine_model and cleaned_existing_engine_model != raw_engine_text:
        updates["engine_model"] = cleaned_existing_engine_model
    elif existing_engine_unusable and faa_engine_usable and cleaned_faa_engine_model:
        updates["engine_model"] = cleaned_faa_engine_model

    parsed_stoh = _to_hour_int(parsed.get("stoh"))
    parsed_sfoh = _to_hour_int(parsed.get("sfoh"))
    if parsed_stoh is not None:
        updates["stoh"] = parsed_stoh
    if parsed_sfoh is not None:
        updates["sfoh"] = parsed_sfoh
    ndh = parsed.get("no_damage_history")
    if ndh is True:
        updates["no_damage_history"] = True
    elif ndh is False:
        updates["no_damage_history"] = False

    return updates


def run_backfill_from_db(
    supabase,
    *,
    limit: int | None = None,
    score_only_missing: bool = True,
    dry_run: bool = False,
    pricing_snapshot_mode: str = "full",
    resume_after_id: object | None = None,
    checkpoint_path: Path | None = None,
    target_ids: list[str] | None = None,
    target_source_ids: list[str] | None = None,
) -> tuple[int, int, int, int]:
    """
    Fetch listings from aircraft_listings, compute scores, update rows.
    Returns (attempted_count, scored_count, failed_count, updated_count).
    """
    select_cols = [
        "id", "year", "make", "model", "asking_price",
        "description", "description_full", "description_intelligence", "avionics_description", "avionics_notes", "title", "source", "total_time_airframe",
        "value_score", "avionics_score",
        "time_since_overhaul", "time_since_new_engine", "time_since_prop_overhaul", "engine_time_since_overhaul",
        "aircraft_type", "engine_model", "faa_engine_model", "faa_engine_manufacturer", "engine_manufacturer", "engine_make",
        "engine_tbo_hours", "score_data", "prop_model", "days_on_market", "price_reduced",
        "stoh", "sfoh", "no_damage_history",
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

    attempted = 0
    scored = 0
    failed = 0
    updated = 0
    diag_deal_source: Counter[str] = Counter()
    diag_data_confidence: Counter[str] = Counter()
    diag_avionics_source: Counter[str] = Counter()
    hard_limit = limit if limit and limit > 0 else None
    last_id = resume_after_id
    first_page = True
    rows_since_checkpoint = 0
    consecutive_slow_comp_rows = 0
    comp_breaker_tripped = pricing_snapshot_mode == "precomputed"
    previous_disable_live_comp_pool = os.environ.get("FULL_HANGAR_DISABLE_LIVE_COMP_POOL")
    if pricing_snapshot_mode == "precomputed":
        os.environ["FULL_HANGAR_DISABLE_LIVE_COMP_POOL"] = "1"
    elif previous_disable_live_comp_pool is not None:
        os.environ["FULL_HANGAR_DISABLE_LIVE_COMP_POOL"] = previous_disable_live_comp_pool
    else:
        os.environ.pop("FULL_HANGAR_DISABLE_LIVE_COMP_POOL", None)
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
    if resume_after_id is not None:
        log.info("Resuming DB backfill after id=%s", resume_after_id)

    normalized_target_ids = [str(value).strip() for value in (target_ids or []) if str(value).strip()]
    normalized_target_source_ids = [
        str(value).strip() for value in (target_source_ids or []) if str(value).strip()
    ]

    def _apply_target_filters(query):
        if normalized_target_ids:
            if len(normalized_target_ids) == 1:
                query = query.eq("id", normalized_target_ids[0])
            else:
                query = query.in_("id", normalized_target_ids)
        if normalized_target_source_ids:
            if len(normalized_target_source_ids) == 1:
                query = query.eq("source_id", normalized_target_source_ids[0])
            else:
                query = query.in_("source_id", normalized_target_source_ids)
        return query
    try:
        while True:
            remaining = None if hard_limit is None else max(0, hard_limit - attempted)
            if remaining == 0:
                break
            page_size = min(DB_CURSOR_PAGE_SIZE, remaining) if remaining is not None else DB_CURSOR_PAGE_SIZE

            if score_only_missing:
                # Client compatibility: merge two null-filtered queries instead of using .or_().
                def _build_null_query(column_name: str):
                    def _builder(select_clause: str):
                        query = (
                            supabase.table("aircraft_listings")
                            .select(select_clause)
                            .is_(column_name, "null")
                            .order("id", desc=False)
                            .limit(page_size)
                        )
                        query = _apply_target_filters(query)
                        if last_id is not None:
                            query = query.gt("id", last_id)
                        return query

                    return _builder

                missing_value_rows = _execute_select_with_fallback(_build_null_query("value_score")).data or []
                missing_avionics_rows = _execute_select_with_fallback(_build_null_query("avionics_score")).data or []
                merged_by_id: dict[object, dict] = {}
                for row in [*missing_value_rows, *missing_avionics_rows]:
                    row_id = row.get("id")
                    if row_id is not None:
                        merged_by_id[row_id] = row
                rows = [merged_by_id[row_id] for row_id in sorted(merged_by_id)][:page_size]
            else:
                def _builder(select_clause: str):
                    query = (
                        supabase.table("aircraft_listings")
                        .select(select_clause)
                        .order("id", desc=False)
                        .limit(page_size)
                    )
                    query = _apply_target_filters(query)
                    if last_id is not None:
                        query = query.gt("id", last_id)
                    return query

                rows = _execute_select_with_fallback(_builder).data or []

            if not rows:
                break

            if first_page:
                log.info(
                    "Starting cursor-paginated backfill (score_only_missing=%s, limit=%s, page_size=%s, pricing_snapshot_mode=%s)",
                    score_only_missing,
                    limit,
                    page_size,
                    pricing_snapshot_mode,
                )
                first_page = False

            for row in rows:
                row_id = row.get("id")
                source_id = str(row_id or "unknown")
                attempted += 1
                row_started = time.perf_counter()
                listing = listing_for_intelligence(row)
                parser_updates = parser_backfill_updates(row)
                if "total_time_airframe" in parser_updates and listing.get("total_time_airframe") in (None, "", 0):
                    listing["total_time_airframe"] = parser_updates["total_time_airframe"]
                if "engine_time_since_overhaul" in parser_updates and listing.get("time_since_overhaul") in (None, "", 0):
                    listing["time_since_overhaul"] = parser_updates["engine_time_since_overhaul"]
                if "engine_model" in parser_updates:
                    parsed_engine_model = sanitize_engine_model(parser_updates.get("engine_model"))
                    current_engine_raw = str(listing.get("engine_model") or "").strip()
                    current_engine_clean = sanitize_engine_model(current_engine_raw)
                    if parsed_engine_model and (
                        not current_engine_clean
                        or len(current_engine_raw) > 120
                        or current_engine_clean != current_engine_raw
                    ):
                        listing["engine_model"] = parsed_engine_model
                else:
                    current_engine_raw = str(listing.get("engine_model") or "").strip()
                    current_engine_clean = sanitize_engine_model(current_engine_raw)
                    if current_engine_clean and current_engine_clean != current_engine_raw:
                        listing["engine_model"] = current_engine_clean
                if "description_intelligence" in parser_updates:
                    # Use freshly parsed enrichment immediately for this scoring pass.
                    listing["description_intelligence"] = parser_updates["description_intelligence"]
                score_started = time.perf_counter()
                try:
                    intel = aircraft_intelligence_score(listing)
                except Exception as e:
                    failed += 1
                    log_scoring_error(source_id, e)
                    log.warning(f"Intelligence failed for id={source_id}: {e}")
                    last_id = row_id
                    rows_since_checkpoint += 1
                    if rows_since_checkpoint >= CHECKPOINT_WRITE_EVERY:
                        _write_checkpoint(
                            checkpoint_path,
                            last_id=last_id,
                            attempted=attempted,
                            scored=scored,
                            failed=failed,
                            updated=updated,
                            score_only_missing=score_only_missing,
                        )
                        rows_since_checkpoint = 0
                    continue
                scored += 1
                diag_deal_source[str(intel.get("deal_comparison_source") or "unknown")] += 1
                diag_data_confidence[str(intel.get("data_confidence") or "UNKNOWN")] += 1
                diag_avionics_source[str(intel.get("avionics_value_source_primary") or "none")] += 1
                score_elapsed = time.perf_counter() - score_started
                if pricing_snapshot_mode == "full" and not comp_breaker_tripped:
                    if score_elapsed >= COMP_CIRCUIT_BREAKER_SECONDS:
                        consecutive_slow_comp_rows += 1
                    else:
                        consecutive_slow_comp_rows = 0
                    if consecutive_slow_comp_rows >= COMP_CIRCUIT_BREAKER_CONSECUTIVE:
                        comp_breaker_tripped = True
                        os.environ["FULL_HANGAR_DISABLE_LIVE_COMP_POOL"] = "1"
                        log.warning(
                            "Comp-query circuit breaker tripped after %s slow rows (>=%.1fs each). "
                            "Switching remaining run to precomputed/baseline pricing mode.",
                            consecutive_slow_comp_rows,
                            COMP_CIRCUIT_BREAKER_SECONDS,
                        )
                update_payload = intelligence_to_row(intel)
                merged_sd = merge_score_data_engine_reference(row, intel.get("engine_reference"))
                if merged_sd is not None:
                    update_payload["score_data"] = merged_sd
                if parser_updates:
                    update_payload.update(parser_updates)
                if os.environ.get("FULL_HANGAR_PROMOTE_ENGINE_MODEL_FROM_FAA", "1").lower() not in (
                    "0",
                    "false",
                    "no",
                ):
                    promote_engine_model_from_faa_if_listing_junk(row, update_payload)
                if dropped_update_columns:
                    update_payload = {k: v for k, v in update_payload.items() if k not in dropped_update_columns}
                if dry_run:
                    log.info(
                        "  [dry-run] id=%s value_score=%s risk=%s deferred=$%s tier=%s source=%s",
                        row.get("id"),
                        update_payload.get("value_score"),
                        update_payload.get("risk_level"),
                        f"{update_payload.get('deferred_total') or 0:,}",
                        update_payload.get("comp_selection_tier"),
                        update_payload.get("deal_comparison_source"),
                    )
                    updated += 1
                else:
                    transient_attempts = 0
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
                            if is_transient_supabase_update_error(e) and transient_attempts < 3:
                                transient_attempts += 1
                                sleep_seconds = transient_attempts * 1.5
                                log.warning(
                                    "Transient update error for id=%s (attempt %s/3): %s; retrying in %.1fs",
                                    source_id,
                                    transient_attempts,
                                    e,
                                    sleep_seconds,
                                )
                                time.sleep(sleep_seconds)
                                continue
                            failed += 1
                            log_scoring_error(source_id, e)
                            log.error(f"Update failed for id={source_id}: {e}")
                            break

                elapsed_seconds = time.perf_counter() - row_started
                if elapsed_seconds > ROW_SLOW_WARNING_SECONDS:
                    log.warning(
                        "Slow listing processing id=%s took %.1fs (threshold %.1fs) tier=%s source=%s make=%s model=%s",
                        source_id,
                        elapsed_seconds,
                        ROW_SLOW_WARNING_SECONDS,
                        update_payload.get("comp_selection_tier"),
                        update_payload.get("deal_comparison_source"),
                        row.get("make"),
                        row.get("model"),
                    )
                last_id = row_id
                rows_since_checkpoint += 1
                if rows_since_checkpoint >= CHECKPOINT_WRITE_EVERY:
                    _write_checkpoint(
                        checkpoint_path,
                        last_id=last_id,
                        attempted=attempted,
                        scored=scored,
                        failed=failed,
                        updated=updated,
                        score_only_missing=score_only_missing,
                    )
                    rows_since_checkpoint = 0

        if checkpoint_path is not None:
            _write_checkpoint(
                checkpoint_path,
                last_id=last_id,
                attempted=attempted,
                scored=scored,
                failed=failed,
                updated=updated,
                score_only_missing=score_only_missing,
            )
        if scored:
            deal_mix = ", ".join(
                f"{name}={count}" for name, count in diag_deal_source.most_common()
            ) or "none"
            confidence_mix = ", ".join(
                f"{name}={count}" for name, count in diag_data_confidence.most_common()
            ) or "none"
            avionics_mix = ", ".join(
                f"{name}={count}" for name, count in diag_avionics_source.most_common()
            ) or "none"
            log.info("Calibration diagnostics | deal_source_mix: %s", deal_mix)
            log.info("Calibration diagnostics | data_confidence_mix: %s", confidence_mix)
            log.info("Calibration diagnostics | avionics_source_mix: %s", avionics_mix)
    finally:
        if previous_disable_live_comp_pool is None:
            os.environ.pop("FULL_HANGAR_DISABLE_LIVE_COMP_POOL", None)
        else:
            os.environ["FULL_HANGAR_DISABLE_LIVE_COMP_POOL"] = previous_disable_live_comp_pool

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
            registration_fields = derive_registration_fields(
                raw_value=str(
                    L.get("registration_raw")
                    or L.get("registration")
                    or L.get("tail_number")
                    or L.get("n_number")
                    or ""
                ),
                fallback_text=" ".join(
                    str(value or "")
                    for value in (
                        L.get("title"),
                        L.get("description"),
                        L.get("description_full"),
                    )
                ),
            )
            for reg_key in (
                "registration_raw",
                "registration_normalized",
                "registration_scheme",
                "registration_country_code",
                "registration_confidence",
            ):
                if registration_fields.get(reg_key) and not L.get(reg_key):
                    L[reg_key] = registration_fields[reg_key]
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


def run_compute_comps_stage(*, dry_run: bool) -> None:
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
    if dry_run:
        log.info("Dry-run: market comps would recompute %s groups", len(comps_rows))
        return

    upserted = upsert_market_comps(comps_supabase, comps_rows)
    regional_rows = build_regional_comps_payload(all_rows, min_sample=3)
    upserted_regional = upsert_market_comps_regional(comps_supabase, regional_rows)
    log.info(
        "Market comps recomputed after backfill: groups=%s upserted=%s regional_groups=%s regional_upserted=%s",
        len(comps_rows),
        upserted,
        len(regional_rows),
        upserted_regional,
    )


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Backfill aircraft_listings with intelligence scores")
    parser.add_argument("--limit", type=int, default=None, help="Max number of DB rows to process")
    parser.add_argument("--all", action="store_true", help="Re-score all listings (ignore missing-scores filter)")
    parser.add_argument(
        "--id",
        action="append",
        default=[],
        help="Restrict DB backfill to one or more listing UUID id values (repeatable).",
    )
    parser.add_argument(
        "--source-id",
        action="append",
        default=[],
        help="Restrict DB backfill to one or more listing source_id values (repeatable).",
    )
    parser.add_argument("--dry-run", action="store_true", help="Compute scores but do not write to DB")
    parser.add_argument("--from-json", type=str, metavar="PATH", help="Backfill from JSON file (upsert by source,source_id)")
    parser.add_argument(
        "--pricing-snapshot-mode",
        choices=["precomputed", "full"],
        default=os.environ.get("BACKFILL_PRICING_SNAPSHOT_MODE", "precomputed"),
        help="Deal pricing lookup mode during row scoring (default: precomputed for stable full-table runs).",
    )
    parser.add_argument(
        "--resume-from-checkpoint",
        action="store_true",
        help="Resume DB backfill from the checkpoint's last processed id.",
    )
    parser.add_argument(
        "--checkpoint-file",
        type=str,
        default=str(DEFAULT_CHECKPOINT_PATH),
        help=f"Checkpoint file path (default: {DEFAULT_CHECKPOINT_PATH}).",
    )
    parser.add_argument(
        "--clear-checkpoint",
        action="store_true",
        help="Delete checkpoint file before starting.",
    )
    parser.add_argument(
        "--compute-comps",
        action="store_true",
        help="Recompute market_comps after backfill finishes",
    )
    parser.add_argument(
        "--compute-comps-only",
        action="store_true",
        help="Only recompute market_comps and skip listing score backfill.",
    )
    parser.add_argument(
        "--quiet-http",
        action="store_true",
        help="Hide httpx/httpcore per-request INFO logs (less console spam; use with chunked runs).",
    )
    args = parser.parse_args()

    if args.quiet_http or _quiet_http_from_env():
        _quiet_http_client_loggers()

    mode = "json" if args.from_json else "db"
    if args.compute_comps_only:
        mode = "comps-only"
    audit_mode = mode if mode in {"db", "json"} else "db"

    attempted = 0
    scored = 0
    failed = 0
    updated = 0
    run_error: Exception | None = None
    checkpoint_path = Path(args.checkpoint_file)
    if not checkpoint_path.is_absolute():
        checkpoint_path = (_ROOT / checkpoint_path).resolve()
    resume_after_id = None
    score_only_missing = not args.all
    targeted_run = bool(args.id or args.source_id)
    if targeted_run and score_only_missing:
        score_only_missing = False
        log.info("Targeted run detected (--id/--source-id); forcing full re-score for matched row(s).")

    if args.clear_checkpoint:
        _clear_checkpoint(checkpoint_path)

    try:
        if args.compute_comps_only:
            run_compute_comps_stage(dry_run=args.dry_run)
        elif args.from_json:
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
            if args.resume_from_checkpoint:
                checkpoint = _read_checkpoint(checkpoint_path)
                if checkpoint:
                    if bool(checkpoint.get("score_only_missing", True)) != score_only_missing:
                        log.warning(
                            "Checkpoint mode mismatch (checkpoint score_only_missing=%s, current=%s); ignoring checkpoint.",
                            checkpoint.get("score_only_missing"),
                            score_only_missing,
                        )
                    else:
                        resume_after_id = checkpoint.get("last_id")
                        log.info(
                            "Loaded checkpoint from %s (last_id=%s attempted=%s scored=%s failed=%s updated=%s)",
                            checkpoint_path,
                            resume_after_id,
                            checkpoint.get("attempted"),
                            checkpoint.get("scored"),
                            checkpoint.get("failed"),
                            checkpoint.get("updated"),
                        )
                else:
                    log.info("No readable checkpoint found at %s; starting from the beginning.", checkpoint_path)
            supabase = get_supabase()
            attempted, scored, failed, updated = run_backfill_from_db(
                supabase,
                limit=args.limit,
                score_only_missing=score_only_missing,
                dry_run=args.dry_run,
                pricing_snapshot_mode=args.pricing_snapshot_mode,
                resume_after_id=resume_after_id,
                checkpoint_path=checkpoint_path,
                target_ids=args.id,
                target_source_ids=args.source_id,
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
                    "mode": audit_mode,
                    "intelligence_version": INTELLIGENCE_VERSION,
                    "listings_attempted": attempted,
                    "listings_scored": scored,
                    "listings_failed": failed,
                    "dry_run": args.dry_run,
                }
            )
        except Exception as e:
            log.error(f"Failed to write backfill audit log: {e}")
        if run_error is None and mode == "db" and args.limit is None:
            _clear_checkpoint(checkpoint_path)
        log.info(
            f"Done: attempted={attempted}, scored={scored}, failed={failed}, updated={updated} (dry_run={args.dry_run})"
        )
        print(
            f"Backfill summary | mode={mode} | attempted={attempted} | scored={scored} | "
            f"failed={failed} | updated={updated} | dry_run={args.dry_run}"
        )
        if not args.dry_run and updated:
            log.info("Supabase is now queryable: sort by deferred_total, filter risk_level = 'CRITICAL', engine_score < 25, etc.")
        if args.compute_comps and not args.compute_comps_only:
            try:
                run_compute_comps_stage(dry_run=args.dry_run)
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
