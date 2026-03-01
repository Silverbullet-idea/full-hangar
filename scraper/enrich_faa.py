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
from typing import Any

from dotenv import load_dotenv
from supabase import Client, create_client

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
    query = (
        supabase.table("aircraft_listings")
        .select("id, n_number")
        .not_.is_("n_number", "null")
        .is_("faa_owner", "null")
    )
    if limit is not None:
        query = query.limit(limit)
    response = query.execute()
    return response.data or []


def fetch_faa_match(supabase: Client, n_number: str) -> dict[str, Any] | None:
    response = (
        supabase.table("faa_registry")
        .select("owner_name, city, state, cert_date, status_code, mfr_mdl_code, eng_mfr_mdl_code")
        .eq("n_number", n_number)
        .limit(1)
        .execute()
    )
    return (response.data or [None])[0]


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
        .select("horsepower")
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
) -> dict[str, Any]:
    return {
        "faa_owner": faa_record.get("owner_name"),
        "faa_city": faa_record.get("city"),
        "faa_state": faa_record.get("state"),
        "faa_cert_date": faa_record.get("cert_date"),
        "faa_status": faa_record.get("status_code"),
        "faa_num_seats": (aircraft_ref_record or {}).get("num_seats"),
        "faa_num_engines": (aircraft_ref_record or {}).get("num_engines"),
        "faa_aircraft_weight": (aircraft_ref_record or {}).get("aircraft_weight"),
        "faa_cruising_speed": (aircraft_ref_record or {}).get("cruising_speed"),
        "faa_type_aircraft": (aircraft_ref_record or {}).get("type_aircraft"),
        "faa_engine_horsepower": (engine_ref_record or {}).get("horsepower"),
        "faa_registration_alert": registration_alert_from_status(faa_record.get("status_code")),
        "faa_matched": True,
    }


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

        faa_record = fetch_faa_match(supabase, n_number)
        dereg_record = fetch_deregistered_match(supabase, n_number)

        if not faa_record and not dereg_record:
            unmatched += 1
            log.debug("No FAA or DEREG match for listing_id=%s n_number=%s", listing_id, n_number)
            continue

        payload: dict[str, Any] = {}
        if dereg_record:
            payload["faa_registration_alert"] = DEREGISTRATION_ALERT
            deregistered_flagged += 1

        if faa_record:
            mfr_mdl_code = faa_record.get("mfr_mdl_code")
            eng_mfr_mdl_code = faa_record.get("eng_mfr_mdl_code")

            aircraft_ref_record = None
            if mfr_mdl_code:
                aircraft_ref_record = fetch_aircraft_ref_match(supabase, str(mfr_mdl_code))

            engine_ref_record = None
            if eng_mfr_mdl_code:
                engine_ref_record = fetch_engine_ref_match(supabase, str(eng_mfr_mdl_code))

            faa_payload = build_update_payload(faa_record, aircraft_ref_record, engine_ref_record)
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

        supabase.table("aircraft_listings").update(payload).eq("id", listing_id).execute()
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
