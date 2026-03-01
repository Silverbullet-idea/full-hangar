"""
Load FAA aircraft, engine, and deregistered-aircraft files into Supabase.

Usage:
    python load_faa_reference.py --acftref ACFTREF.txt --engine ENGINE.txt --dereg DEREG.txt
    python load_faa_reference.py --acftref ACFTREF.txt --engine ENGINE.txt --dereg DEREG.txt --batch-size 500
"""

from __future__ import annotations

import argparse
import csv
import logging
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

log = logging.getLogger(__name__)


def setup_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


def get_supabase() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise EnvironmentError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment.")
    return create_client(url, key)


def normalize_text(value: str) -> str | None:
    cleaned = value.strip()
    return cleaned or None


def parse_int(value: str) -> int | None:
    cleaned = value.strip()
    if not cleaned:
        return None
    cleaned = cleaned.replace(",", "")
    try:
        return int(cleaned)
    except ValueError:
        return None


def chunk_rows(rows: list[dict[str, Any]], batch_size: int) -> list[list[dict[str, Any]]]:
    return [rows[i : i + batch_size] for i in range(0, len(rows), batch_size)]


def dedupe_rows_by_conflict(rows: list[dict[str, Any]], conflict_column: str) -> list[dict[str, Any]]:
    deduped: dict[Any, dict[str, Any]] = {}
    skipped_missing_key = 0
    duplicate_count = 0

    for row in rows:
        conflict_value = row.get(conflict_column)
        if conflict_value is None:
            skipped_missing_key += 1
            continue

        if isinstance(conflict_value, str) and not conflict_value.strip():
            skipped_missing_key += 1
            continue

        if conflict_value in deduped:
            duplicate_count += 1
        deduped[conflict_value] = row

    if skipped_missing_key:
        log.warning(
            "Skipped %s rows for %s because %s was missing/blank",
            skipped_missing_key,
            conflict_column,
            conflict_column,
        )
    if duplicate_count:
        log.warning(
            "Deduped %s duplicate rows for %s before upsert",
            duplicate_count,
            conflict_column,
        )

    return list(deduped.values())


def read_acftref(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8", newline="") as infile:
        reader = csv.reader(infile)
        for idx, raw in enumerate(reader, start=1):
            if not raw:
                continue
            if idx == 1 and raw[0].strip().lower() == "mfr_mdl_code":
                continue
            if len(raw) < 10:
                log.warning("Skipping ACFTREF row %s (expected >=10 columns, got %s)", idx, len(raw))
                continue

            mfr_mdl_code = normalize_text(raw[0])
            if not mfr_mdl_code:
                log.warning("Skipping ACFTREF row %s (blank mfr_mdl_code)", idx)
                continue

            rows.append(
                {
                    "mfr_mdl_code": mfr_mdl_code,
                    "mfr_name": normalize_text(raw[1]),
                    "model_name": normalize_text(raw[2]),
                    "type_aircraft": normalize_text(raw[3]),
                    "type_engine": normalize_text(raw[4]),
                    "num_engines": parse_int(raw[7]),
                    "num_seats": parse_int(raw[8]),
                    "aircraft_weight": normalize_text(raw[9]),
                    "cruising_speed": parse_int(raw[10]) if len(raw) > 10 else None,
                }
            )
    return rows


def read_engine(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8", newline="") as infile:
        reader = csv.reader(infile)
        for idx, raw in enumerate(reader, start=1):
            if not raw:
                continue
            if idx == 1 and raw[0].strip().lower() == "eng_mfr_mdl_code":
                continue
            if len(raw) < 5:
                log.warning("Skipping ENGINE row %s (expected >=5 columns, got %s)", idx, len(raw))
                continue

            eng_mfr_mdl_code = normalize_text(raw[0])
            if not eng_mfr_mdl_code:
                log.warning("Skipping ENGINE row %s (blank eng_mfr_mdl_code)", idx)
                continue

            rows.append(
                {
                    "eng_mfr_mdl_code": eng_mfr_mdl_code,
                    "eng_mfr_name": normalize_text(raw[1]),
                    "eng_model_name": normalize_text(raw[2]),
                    "type_engine": normalize_text(raw[3]),
                    "horsepower": parse_int(raw[4]),
                }
            )
    return rows


def read_dereg(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8", newline="") as infile:
        reader = csv.reader(infile)
        for idx, raw in enumerate(reader, start=1):
            if not raw:
                continue
            if idx == 1 and raw[0].strip().lower() in {"n_number", "n-number"}:
                continue
            if len(raw) < 15:
                log.warning("Skipping DEREG row %s (expected >=15 columns, got %s)", idx, len(raw))
                continue

            n_number = normalize_text(raw[0])
            if not n_number:
                log.warning("Skipping DEREG row %s (blank n_number)", idx)
                continue

            rows.append(
                {
                    "n_number": n_number,
                    "serial_number": normalize_text(raw[1]),
                    "status_code": normalize_text(raw[3]),
                    "cancel_date": normalize_text(raw[12]),
                    "last_activity_date": normalize_text(raw[13]),
                }
            )
    return rows


def upsert_batches(
    supabase: Client,
    table_name: str,
    rows: list[dict[str, Any]],
    conflict_column: str,
    batch_size: int,
) -> None:
    if not rows:
        log.info("No rows to upsert for %s", table_name)
        return

    rows_to_upsert = dedupe_rows_by_conflict(rows, conflict_column=conflict_column)
    if not rows_to_upsert:
        log.info("No valid rows to upsert for %s after dedupe", table_name)
        return

    batches = chunk_rows(rows_to_upsert, batch_size=batch_size)
    log.info(
        "Upserting %s rows into %s (%s batches)",
        len(rows_to_upsert),
        table_name,
        len(batches),
    )

    for batch_idx, batch in enumerate(batches, start=1):
        supabase.table(table_name).upsert(batch, on_conflict=conflict_column).execute()
        log.info("Upserted %s/%s batches into %s", batch_idx, len(batches), table_name)


def validate_inputs(acftref: Path, engine: Path, dereg: Path, batch_size: int) -> None:
    if not acftref.exists():
        raise FileNotFoundError(f"ACFTREF file not found: {acftref}")
    if not engine.exists():
        raise FileNotFoundError(f"ENGINE file not found: {engine}")
    if not dereg.exists():
        raise FileNotFoundError(f"DEREG file not found: {dereg}")
    if batch_size <= 0:
        raise ValueError("--batch-size must be a positive integer.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Load FAA ACFTREF, ENGINE, and DEREG references into Supabase.")
    parser.add_argument("--acftref", required=True, help="Path to ACFTREF.txt")
    parser.add_argument("--engine", required=True, help="Path to ENGINE.txt")
    parser.add_argument("--dereg", required=True, help="Path to DEREG.txt")
    parser.add_argument("--batch-size", type=int, default=500, help="Rows per upsert batch")
    args = parser.parse_args()

    setup_logging()

    acftref_path = Path(args.acftref)
    engine_path = Path(args.engine)
    dereg_path = Path(args.dereg)
    validate_inputs(acftref_path, engine_path, dereg_path, args.batch_size)

    supabase = get_supabase()
    aircraft_rows = read_acftref(acftref_path)
    engine_rows = read_engine(engine_path)
    dereg_rows = read_dereg(dereg_path)

    upsert_batches(
        supabase=supabase,
        table_name="faa_aircraft_ref",
        rows=aircraft_rows,
        conflict_column="mfr_mdl_code",
        batch_size=args.batch_size,
    )
    upsert_batches(
        supabase=supabase,
        table_name="faa_engine_ref",
        rows=engine_rows,
        conflict_column="eng_mfr_mdl_code",
        batch_size=args.batch_size,
    )
    upsert_batches(
        supabase=supabase,
        table_name="faa_deregistered",
        rows=dereg_rows,
        conflict_column="n_number",
        batch_size=args.batch_size,
    )

    log.info(
        "FAA reference load complete: aircraft_rows=%s engine_rows=%s dereg_rows=%s",
        len(aircraft_rows),
        len(engine_rows),
        len(dereg_rows),
    )


if __name__ == "__main__":
    main()
