"""
FAA registry enrichment for aircraft listings.

Cross-references `aircraft_listings.n_number` against `faa_registry.n_number`
for listings that have not been enriched yet.

Usage:
    python enrich_faa.py
    python enrich_faa.py --limit 100
    python enrich_faa.py --dry-run --verbose
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
from typing import Any

from dotenv import load_dotenv
from supabase import Client, create_client
from registration_parser import normalize_us_n_number

load_dotenv()

log = logging.getLogger(__name__)
DEREGISTRATION_ALERT = "DEREGISTERED - VERIFY BEFORE PURCHASE"


def setup_logging(verbose: bool = False) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(level=level, format="%(asctime)s [%(levelname)s] %(message)s")


def get_supabase() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise EnvironmentError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment.")
    return create_client(url, key)


def fetch_pending_listings(supabase: Client, limit: int | None = None) -> list[dict[str, Any]]:
    base = supabase.table("aircraft_listings").not_.is_("n_number", "null").is_("faa_owner", "null")
    columns = "id, n_number, engine_model, registration_scheme"
    try:
        query = base.select(columns)
        if limit is not None:
            query = query.limit(limit)
        response = query.execute()
        return response.data or []
    except Exception:
        # Backward compatibility for environments missing registration columns.
        query = base.select("id, n_number, engine_model")
        if limit is not None:
            query = query.limit(limit)
        response = query.execute()
        return response.data or []


def fetch_faa_match(supabase: Client, n_number: str) -> dict[str, Any] | None:
    candidates = _n_number_candidates(n_number)
    for candidate in candidates:
        response = (
            supabase.table("faa_registry")
            .select("*")
            .eq("n_number", candidate)
            .limit(1)
            .execute()
        )
        row = (response.data or [None])[0]
        if row:
            return row
    return None


def fetch_aircraft_ref_match(supabase: Client, mfr_mdl_code: str) -> dict[str, Any] | None:
    response = (
        supabase.table("faa_aircraft_ref")
        .select("num_seats, num_engines, aircraft_weight, cruising_speed, type_aircraft")
        .eq("mfr_mdl_code", mfr_mdl_code)
        .limit(1)
        .execute()
    )
    return (response.data or [None])[0]


def fetch_engine_ref_match(supabase: Client, eng_mfr_mdl_code: str) -> dict[str, Any] | None:
    response = (
        supabase.table("faa_engine_ref")
        .select("horsepower, eng_model_name, eng_mfr_name")
        .eq("eng_mfr_mdl_code", eng_mfr_mdl_code)
        .limit(1)
        .execute()
    )
    return (response.data or [None])[0]


def fetch_deregistered_match(supabase: Client, n_number: str) -> dict[str, Any] | None:
    response = (
        supabase.table("faa_deregistered")
        .select("n_number")
        .eq("n_number", n_number)
        .limit(1)
        .execute()
    )
    return (response.data or [None])[0]


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _pick_first(record: dict[str, Any] | None, keys: list[str]) -> Any:
    if not record:
        return None
    for key in keys:
        if key in record and record.get(key) is not None:
            value = record.get(key)
            if isinstance(value, str):
                text = value.strip()
                if text:
                    return text
            else:
                return value
    return None


def _n_number_candidates(n_number: str) -> list[str]:
    normalized = "".join(ch for ch in str(n_number).upper() if ch.isalnum())
    if not normalized:
        return []
    if normalized.startswith("N"):
        without_prefix = normalized[1:]
        values = [normalized]
        if without_prefix:
            values.append(without_prefix)
        return values
    return [f"N{normalized}", normalized]


def _should_backfill_engine_model(existing_engine_model: Any) -> bool:
    text = _clean_text(existing_engine_model)
    if not text:
        return True

    normalized = text.lower()
    if normalized in {"unknown", "n/a", "na", "-", "--", "none"}:
        return True

    return False


def _parse_missing_column_names(error: Exception) -> set[str]:
    message = str(error)
    found = set(re.findall(r"Could not find the '([a-zA-Z0-9_]+)' column", message))
    found.update(
        re.findall(
            r'column\s+"?([a-zA-Z0-9_]+)"?\s+of\s+relation\s+"?aircraft_listings"?\s+does not exist',
            message,
        )
    )
    return found


def registration_alert_from_status(status_code: Any) -> str | None:
    if status_code is None:
        return None

    status = str(status_code).strip().upper()
    if status in {"13", "16"}:
        return "EXPIRED"
    if status in {"17", "18"}:
        return "REVOKED"
    if status in {"6", "9", "E"}:
        return "SALE REPORTED"
    return None


def build_update_payload(
    faa_record: dict[str, Any],
    aircraft_ref_record: dict[str, Any] | None,
    engine_ref_record: dict[str, Any] | None,
    existing_engine_model: Any,
) -> dict[str, Any]:
    faa_engine_model = _clean_text(_pick_first(engine_ref_record, ["eng_model_name", "engine_model", "model_name"])) or _clean_text(
        _pick_first(faa_record, ["engine_model", "eng_model_name", "eng_model"])
    )
    faa_engine_manufacturer = _clean_text(
        _pick_first(engine_ref_record, ["eng_mfr_name", "engine_manufacturer", "manufacturer"])
    ) or _clean_text(
        _pick_first(faa_record, ["engine_manufacturer", "eng_mfr_name", "engine_make", "eng_manufacturer"])
    )

    payload: dict[str, Any] = {
        "faa_owner": _pick_first(faa_record, ["owner_name", "name", "registrant_name"]),
        "faa_city": _pick_first(faa_record, ["city"]),
        "faa_state": _pick_first(faa_record, ["state"]),
        "faa_cert_date": _pick_first(faa_record, ["cert_date", "cert_issue_date"]),
        "faa_status": _pick_first(faa_record, ["status_code", "status"]),
        "faa_num_seats": (aircraft_ref_record or {}).get("num_seats"),
        "faa_num_engines": (aircraft_ref_record or {}).get("num_engines"),
        "faa_aircraft_weight": (aircraft_ref_record or {}).get("aircraft_weight"),
        "faa_cruising_speed": (aircraft_ref_record or {}).get("cruising_speed"),
        "faa_type_aircraft": (aircraft_ref_record or {}).get("type_aircraft"),
        "faa_engine_horsepower": (engine_ref_record or {}).get("horsepower"),
        "faa_engine_model": faa_engine_model,
        "faa_engine_manufacturer": faa_engine_manufacturer,
        "faa_registration_alert": registration_alert_from_status(
            _pick_first(faa_record, ["status_code", "status"])
        ),
        "faa_matched": True,
    }

    if faa_engine_model and _should_backfill_engine_model(existing_engine_model):
        payload["engine_model"] = faa_engine_model

    return payload


def run_enrichment(supabase: Client, limit: int | None = None, dry_run: bool = False) -> None:
    listings = fetch_pending_listings(supabase, limit=limit)
    log.info("Found %s listings pending FAA enrichment", len(listings))

    matched = 0
    unmatched = 0
    deregistered_flagged = 0

    for listing in listings:
        listing_id = listing["id"]
        n_number = listing.get("n_number")
        if not n_number:
            continue
        registration_scheme = str(listing.get("registration_scheme") or "").strip().upper()
        if registration_scheme and registration_scheme != "US_N":
            log.debug("Skipping non-US registration listing_id=%s scheme=%s", listing_id, registration_scheme)
            continue
        normalized_n_number = normalize_us_n_number(str(n_number))
        if not normalized_n_number:
            log.debug("Skipping invalid n-number listing_id=%s n_number=%s", listing_id, n_number)
            continue

        faa_record = fetch_faa_match(supabase, normalized_n_number)
        dereg_record = fetch_deregistered_match(supabase, normalized_n_number)

        if not faa_record and not dereg_record:
            unmatched += 1
            log.debug("No FAA or DEREG match for listing_id=%s n_number=%s", listing_id, n_number)
            continue

        payload: dict[str, Any] = {}
        if dereg_record:
            payload["faa_registration_alert"] = DEREGISTRATION_ALERT
            deregistered_flagged += 1

        if faa_record:
            mfr_mdl_code = _pick_first(faa_record, ["mfr_mdl_code", "mfr_model_code"])
            eng_mfr_mdl_code = _pick_first(faa_record, ["eng_mfr_mdl_code", "eng_mfr_mdl"])

            aircraft_ref_record = None
            if mfr_mdl_code:
                aircraft_ref_record = fetch_aircraft_ref_match(supabase, str(mfr_mdl_code))

            engine_ref_record = None
            if eng_mfr_mdl_code:
                engine_ref_record = fetch_engine_ref_match(supabase, str(eng_mfr_mdl_code))

            faa_payload = build_update_payload(
                faa_record,
                aircraft_ref_record,
                engine_ref_record,
                existing_engine_model=listing.get("engine_model"),
            )
            payload = {**faa_payload, **payload}
            matched += 1
        else:
            unmatched += 1

        if dry_run:
            print(
                json.dumps(
                    {
                        "listing_id": listing_id,
                        "n_number": n_number,
                        "update": payload,
                    },
                    ensure_ascii=True,
                )
            )
            continue

        retry_payload = dict(payload)
        while retry_payload:
            try:
                supabase.table("aircraft_listings").update(retry_payload).eq("id", listing_id).execute()
                break
            except Exception as error:
                missing = sorted(col for col in _parse_missing_column_names(error) if col in retry_payload)
                if not missing:
                    raise
                for column in missing:
                    retry_payload.pop(column, None)
                log.warning(
                    "FAA enrich update missing column(s) for listing_id=%s: %s. Retrying without missing fields.",
                    listing_id,
                    ", ".join(missing),
                )
        log.debug("Updated listing_id=%s n_number=%s", listing_id, n_number)

    log.info(
        "FAA enrichment complete: matched=%s unmatched=%s deregistered_flagged=%s dry_run=%s",
        matched,
        unmatched,
        deregistered_flagged,
        dry_run,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Enrich aircraft_listings using local FAA registry.")
    parser.add_argument("--limit", type=int, default=None, help="Only enrich N listings")
    parser.add_argument("--dry-run", action="store_true", help="Print matches without updating")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging")
    args = parser.parse_args()

    setup_logging(verbose=args.verbose)
    supabase = get_supabase()
    run_enrichment(supabase, limit=args.limit, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
