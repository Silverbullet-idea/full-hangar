"""
Unified local bridge server for multi-source browser extension ingestion.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
from datetime import date, datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
load_dotenv(SCRIPT_DIR / ".env")

try:
    from description_parser import parse_description
except Exception:  # pragma: no cover
    def parse_description(text: str, observed_price: int | float | None = None) -> dict[str, Any]:
        return {}

try:
    from registration_parser import apply_registration_fields
except Exception:  # pragma: no cover
    def apply_registration_fields(
        target: dict[str, Any],
        raw_value: str | None,
        fallback_text: str | None = None,
        *,
        keep_existing_n_number: bool = True,
    ) -> dict[str, Any]:
        return target


ROOT_DIR = Path(__file__).resolve().parent.parent
LOG_DIR = ROOT_DIR / "scraper" / "logs"
STATE_DIR = ROOT_DIR / "scraper" / "state"
LOG_FILE = LOG_DIR / "bridge_server_unified.log"
CHECKPOINT_FILE = STATE_DIR / "bridge_checkpoint_unified.json"
LOG = logging.getLogger("bridge_server_unified")
TABLE_COLUMNS_CACHE: dict[str, set[str]] = {}
MISSING_COL_RE = re.compile(r"Could not find the '([^']+)' column", re.IGNORECASE)
MAX_PG_INT = 2_147_483_647
SUPABASE_RETRY_ATTEMPTS = 4
SUPABASE_RETRY_BASE_SECONDS = 1.0

SITE_ALIASES = {
    "tap": "trade_a_plane",
    "trade-a-plane": "trade_a_plane",
    "tradeaplane": "trade_a_plane",
}


def normalize_source_site(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return "controller"
    return SITE_ALIASES.get(raw, raw)


def normalize_manufacturer(value: Any) -> str:
    return str(value or "").strip()


def get_manufacturer_tier(_: Any) -> None:
    return None


def get_supabase() -> Any:
    from supabase import create_client

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise EnvironmentError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in scraper/.env")
    return create_client(url, key)


def _extract_missing_column(exc: Exception) -> str | None:
    match = MISSING_COL_RE.search(str(exc))
    return match.group(1) if match else None


def _is_transient_supabase_error(exc: Exception) -> bool:
    text = str(exc or "").lower()
    transient_markers = (
        "code': 522",
        "connection timed out",
        "timed out",
        "http/2 502",
        "http/2 503",
        "http/2 504",
        "temporarily unavailable",
        "connection reset",
        "service unavailable",
    )
    return any(marker in text for marker in transient_markers)


def _execute_with_retry(
    *,
    call: Any,
    op_name: str,
    logger: logging.Logger,
    attempts: int = SUPABASE_RETRY_ATTEMPTS,
) -> Any:
    last_exc: Exception | None = None
    for attempt in range(1, max(1, attempts) + 1):
        try:
            return call()
        except Exception as exc:  # pragma: no cover - network-layer retries
            last_exc = exc
            if attempt >= attempts or not _is_transient_supabase_error(exc):
                raise
            delay = SUPABASE_RETRY_BASE_SECONDS * (2 ** (attempt - 1))
            logger.warning(
                "Transient Supabase error in %s (attempt %s/%s): %s; retrying in %.1fs",
                op_name,
                attempt,
                attempts,
                exc,
                delay,
            )
            time.sleep(delay)
    if last_exc:
        raise last_exc
    raise RuntimeError(f"{op_name} failed without exception")


def safe_upsert_with_fallback(*, supabase: Any, table: str, rows: list[dict[str, Any]], on_conflict: str, logger: logging.Logger) -> int:
    if not rows:
        return 0
    working_rows = [dict(r) for r in rows]
    removed_columns: set[str] = set()
    try:
        while working_rows:
            try:
                _execute_with_retry(
                    call=lambda: supabase.table(table).upsert(working_rows, on_conflict=on_conflict).execute(),
                    op_name=f"bulk upsert {table}",
                    logger=logger,
                )
                return len(working_rows)
            except Exception as exc:
                missing_col = _extract_missing_column(exc)
                if missing_col and missing_col not in removed_columns:
                    removed_columns.add(missing_col)
                    logger.warning("Dropping unknown column '%s' and retrying bulk upsert.", missing_col)
                    for row in working_rows:
                        row.pop(missing_col, None)
                    continue
                raise
    except Exception as exc:
        logger.warning("Bulk upsert failed; falling back row-by-row: %s", exc)
        saved = 0
        for row in working_rows:
            try:
                _execute_with_retry(
                    call=lambda row=row: supabase.table(table).upsert(row, on_conflict=on_conflict).execute(),
                    op_name=f"row upsert {table}",
                    logger=logger,
                )
                saved += 1
            except Exception as row_exc:
                missing_col = _extract_missing_column(row_exc)
                if missing_col:
                    retry = dict(row)
                    retry.pop(missing_col, None)
                    try:
                        _execute_with_retry(
                            call=lambda retry=retry: supabase.table(table).upsert(retry, on_conflict=on_conflict).execute(),
                            op_name=f"row upsert retry {table}",
                            logger=logger,
                        )
                        saved += 1
                        continue
                    except Exception as retry_exc:
                        logger.warning("Row upsert failed after dropping '%s' source_id=%s: %s", missing_col, row.get("source_id"), retry_exc)
                        continue
                logger.warning("Row upsert failed source_id=%s: %s", row.get("source_id"), row_exc)
        return saved


def fetch_table_columns_via_sample(supabase: Any, table: str) -> set[str]:
    cached = TABLE_COLUMNS_CACHE.get(table)
    if cached:
        return cached
    rows = (
        _execute_with_retry(
            call=lambda: supabase.table(table).select("*").limit(1).execute(),
            op_name=f"fetch columns sample {table}",
            logger=LOG,
        ).data
        or []
    )
    columns = {str(k).strip() for k in rows[0].keys()} if rows else set()
    TABLE_COLUMNS_CACHE[table] = columns
    return columns


class BridgeState:
    def __init__(self, dry_run: bool):
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.total_upserted = 0
        self.total_errors = 0
        self.total_received = 0
        self.dry_run = dry_run
        self.by_source: dict[str, dict[str, int]] = {}

    def track(self, source_site: str, upserted: int, errors: int, received: int) -> None:
        row = self.by_source.setdefault(source_site, {"received": 0, "upserted": 0, "errors": 0})
        row["received"] += int(received)
        row["upserted"] += int(upserted)
        row["errors"] += int(errors)

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": "ok",
            "started_at": self.started_at,
            "total_upserted": self.total_upserted,
            "total_errors": self.total_errors,
            "total_received": self.total_received,
            "dry_run": self.dry_run,
            "by_source": self.by_source,
        }


def setup_logging() -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[logging.FileHandler(LOG_FILE, encoding="utf-8"), logging.StreamHandler()],
    )


def write_checkpoint(state: BridgeState) -> None:
    CHECKPOINT_FILE.write_text(json.dumps(state.to_dict(), indent=2, ensure_ascii=True), encoding="utf-8")


def fetch_existing_keys(supabase: Any, rows: list[dict[str, Any]]) -> set[tuple[str, str]]:
    grouped: dict[str, list[str]] = {}
    for row in rows:
        source_site = normalize_source_site(row.get("source_site") or row.get("listing_source"))
        source_id = str(row.get("source_id") or row.get("source_listing_id") or "").strip()
        if source_site and source_id:
            grouped.setdefault(source_site, []).append(source_id)

    existing: set[tuple[str, str]] = set()
    for source_site, source_ids in grouped.items():
        unique_ids = list(dict.fromkeys(source_ids))
        for idx in range(0, len(unique_ids), 500):
            chunk = unique_ids[idx : idx + 500]
            data = (
                _execute_with_retry(
                    call=lambda source_site=source_site, chunk=chunk: supabase.table("aircraft_listings")
                    .select("source_site,source_id")
                    .eq("source_site", source_site)
                    .in_("source_id", chunk)
                    .execute(),
                    op_name=f"fetch existing keys {source_site}",
                    logger=LOG,
                ).data
                or []
            )
            for found in data:
                s = normalize_source_site(found.get("source_site"))
                sid = str(found.get("source_id") or "").strip()
                if s and sid:
                    existing.add((s, sid))
    return existing


def fetch_existing_listing_keys(supabase: Any, rows: list[dict[str, Any]]) -> set[tuple[str, str]]:
    grouped: dict[str, list[str]] = {}
    for row in rows:
        source_site = normalize_source_site(row.get("source_site") or row.get("listing_source"))
        source_listing_id = str(row.get("source_listing_id") or row.get("source_id") or "").strip()
        if source_site and source_listing_id:
            grouped.setdefault(source_site, []).append(source_listing_id)

    existing: set[tuple[str, str]] = set()
    for source_site, source_listing_ids in grouped.items():
        unique_ids = list(dict.fromkeys(source_listing_ids))
        for idx in range(0, len(unique_ids), 500):
            chunk = unique_ids[idx : idx + 500]
            data = (
                _execute_with_retry(
                    call=lambda source_site=source_site, chunk=chunk: supabase.table("aircraft_listings")
                    .select("source_site,source_listing_id")
                    .eq("source_site", source_site)
                    .in_("source_listing_id", chunk)
                    .execute(),
                    op_name=f"fetch existing listing keys {source_site}",
                    logger=LOG,
                ).data
                or []
            )
            for found in data:
                s = normalize_source_site(found.get("source_site"))
                sid = str(found.get("source_listing_id") or "").strip()
                if s and sid:
                    existing.add((s, sid))
    return existing


def classify_existing_items(supabase: Any, rows: list[dict[str, Any]]) -> dict[str, Any]:
    existing_listing_keys = fetch_existing_listing_keys(supabase, rows)
    existing_source_ids = fetch_existing_keys(supabase, rows)
    existing_joined: set[tuple[str, str]] = set(existing_listing_keys) | set(existing_source_ids)

    payload_existing: list[dict[str, str]] = []
    payload_new: list[dict[str, str]] = []
    for row in rows:
        source_site = normalize_source_site(row.get("source_site") or row.get("listing_source"))
        source_listing_id = str(row.get("source_listing_id") or row.get("source_id") or "").strip()
        if not source_site or not source_listing_id:
            continue
        entry = {"source_site": source_site, "source_listing_id": source_listing_id}
        if (source_site, source_listing_id) in existing_joined:
            payload_existing.append(entry)
        else:
            payload_new.append(entry)
    return {
        "existing_keys": payload_existing,
        "new_keys": payload_new,
        "counts": {
            "received": len(rows),
            "existing": len(payload_existing),
            "new": len(payload_new),
        },
    }


def normalize_row(raw: dict[str, Any], existing_keys: set[tuple[str, str]], allowed_columns: set[str]) -> tuple[dict[str, Any] | None, str | None]:
    row = dict(raw or {})
    source_site = normalize_source_site(row.get("source_site") or row.get("listing_source"))
    row["source_site"] = source_site
    row["listing_source"] = source_site

    source_id = str(row.get("source_id") or row.get("source_listing_id") or "").strip()
    if not source_id:
        return None, "missing source_id"
    row["source_id"] = source_id
    row["source_listing_id"] = str(row.get("source_listing_id") or source_id).strip()

    text = str(row.get("description") or row.get("description_full") or "").strip()
    if text:
        row["description_intelligence"] = parse_description(text, observed_price=row.get("asking_price"))

    make = normalize_manufacturer(row.get("make"))
    if make:
        row["make"] = make
        tier = get_manufacturer_tier(make)
        if tier is not None:
            row["manufacturer_tier"] = tier

    today = date.today().isoformat()
    row["last_seen_date"] = today
    row["is_active"] = True
    row["inactive_date"] = None
    if (source_site, source_id) not in existing_keys:
        row["first_seen_date"] = today

    if row.get("price_asking") is None and row.get("asking_price") is not None:
        row["price_asking"] = row.get("asking_price")
    if row.get("asking_price") is None and row.get("price_asking") is not None:
        row["asking_price"] = row.get("price_asking")
    for numeric_key in ("price_asking", "asking_price"):
        value = row.get(numeric_key)
        if value is None:
            continue
        try:
            parsed = int(value)
        except Exception:
            row[numeric_key] = None
            continue
        # Guard against malformed concatenated values that exceed Postgres integer.
        if parsed < 0 or parsed > MAX_PG_INT:
            row[numeric_key] = None
        else:
            row[numeric_key] = parsed

    reg_seed = str(row.get("registration_raw") or row.get("n_number") or "").strip()
    fallback_parts = [
        row.get("title"),
        row.get("description"),
        row.get("description_full"),
        row.get("specs_text"),
        row.get("location_raw"),
        row.get("serial_number"),
        row.get("engine_model"),
    ]
    fallback_text = " ".join(str(v or "") for v in fallback_parts).strip()
    apply_registration_fields(
        row,
        raw_value=reg_seed,
        fallback_text=fallback_text if fallback_text else None,
        keep_existing_n_number=True,
    )

    normalized = {k: v for k, v in row.items() if not str(k).startswith("_")}
    if allowed_columns:
        unknown = {k: v for k, v in normalized.items() if k not in allowed_columns}
        filtered = {k: v for k, v in normalized.items() if k in allowed_columns}
        if unknown and "raw_data" in allowed_columns:
            prior_raw = filtered.get("raw_data")
            raw_data = dict(prior_raw) if isinstance(prior_raw, dict) else {}
            raw_data["bridge_unmapped"] = unknown
            raw_data["bridge_unmapped_keys"] = sorted(unknown.keys())
            raw_data["bridge_source"] = source_site
            raw_data["bridge_captured_at"] = datetime.now(timezone.utc).isoformat()
            filtered["raw_data"] = raw_data
        normalized = filtered
    return normalized, None


def upsert_rows(supabase: Any, rows: list[dict[str, Any]], dry_run: bool) -> tuple[int, int, dict[str, dict[str, int]]]:
    existing_keys = fetch_existing_keys(supabase, rows)
    allowed_columns = fetch_table_columns_via_sample(supabase, "aircraft_listings")
    prepared: list[dict[str, Any]] = []
    errors = 0
    per_source: dict[str, dict[str, int]] = {}

    for row in rows:
        source_site = normalize_source_site(row.get("source_site") or row.get("listing_source"))
        bucket = per_source.setdefault(source_site, {"received": 0, "prepared": 0, "saved": 0, "errors": 0})
        bucket["received"] += 1
        normalized, err = normalize_row(row, existing_keys, allowed_columns)
        if err:
            errors += 1
            bucket["errors"] += 1
            continue
        prepared.append(normalized)
        bucket["prepared"] += 1

    if dry_run:
        for source_site, bucket in per_source.items():
            bucket["saved"] = bucket["prepared"]
            bucket["errors"] += max(0, bucket["received"] - bucket["prepared"])
        return len(prepared), errors, per_source

    saved = (
        safe_upsert_with_fallback(
            supabase=supabase,
            table="aircraft_listings",
            rows=prepared,
            on_conflict="source_site,source_listing_id",
            logger=LOG,
        )
        if prepared
        else 0
    )

    # Approximate per-source saved count by prepared distribution.
    prepared_total = sum(v.get("prepared", 0) for v in per_source.values())
    if prepared_total > 0 and saved > 0:
        remainder = saved
        sources = list(per_source.keys())
        for idx, source_site in enumerate(sources):
            prepared_count = per_source[source_site].get("prepared", 0)
            if idx == len(sources) - 1:
                allocation = remainder
            else:
                allocation = int(round(saved * (prepared_count / prepared_total)))
                allocation = max(0, min(allocation, remainder))
            per_source[source_site]["saved"] = allocation
            remainder -= allocation
    for source_site, bucket in per_source.items():
        bucket["errors"] += max(0, bucket.get("prepared", 0) - bucket.get("saved", 0))

    return saved, errors + max(0, len(prepared) - saved), per_source


def make_handler(supabase: Any, state: BridgeState):
    class Handler(BaseHTTPRequestHandler):
        def _json(self, status: int, payload: dict[str, Any]) -> None:
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()
            self.wfile.write(json.dumps(payload, ensure_ascii=True).encode("utf-8"))

        def do_OPTIONS(self) -> None:  # noqa: N802
            self._json(204, {})

        def do_GET(self) -> None:  # noqa: N802
            if self.path == "/ping":
                self._json(200, {"status": "ok"})
            elif self.path == "/status":
                self._json(200, state.to_dict())
            elif self.path == "/stop":
                self._json(200, {"status": "stopping"})
                self.server.shutdown()
            else:
                self._json(404, {"error": "not found"})

        def do_POST(self) -> None:  # noqa: N802
            if self.path == "/exists":
                size = int(self.headers.get("Content-Length", "0") or "0")
                body = self.rfile.read(size) if size else b"{}"
                try:
                    payload = json.loads(body.decode("utf-8"))
                    if isinstance(payload, list):
                        items = payload
                    elif isinstance(payload, dict):
                        items = payload.get("items", [])
                    else:
                        items = []
                    if not isinstance(items, list):
                        raise ValueError("expected list")
                except Exception:
                    return self._json(400, {"error": "invalid payload"})
                valid_rows = [x for x in items if isinstance(x, dict)]
                try:
                    result = classify_existing_items(supabase, valid_rows)
                    return self._json(200, result)
                except Exception as exc:
                    transient = _is_transient_supabase_error(exc)
                    LOG.exception("Exists check failed for %s rows (retryable=%s): %s", len(valid_rows), transient, exc)
                    return self._json(
                        503 if transient else 500,
                        {
                            "error": "exists_failed",
                            "retryable": transient,
                            "detail": str(exc)[:500],
                            "counts": {"received": len(valid_rows), "existing": 0, "new": 0},
                        },
                    )

            if self.path != "/ingest":
                return self._json(404, {"error": "not found"})
            size = int(self.headers.get("Content-Length", "0") or "0")
            body = self.rfile.read(size) if size else b"[]"
            try:
                payload = json.loads(body.decode("utf-8"))
                if not isinstance(payload, list):
                    raise ValueError("expected list")
            except Exception:
                state.total_errors += 1
                return self._json(400, {"error": "invalid payload"})

            valid_rows = [x for x in payload if isinstance(x, dict)]
            state.total_received += len(valid_rows)
            try:
                upserted, errors, per_source = upsert_rows(supabase, valid_rows, state.dry_run)
            except Exception as exc:
                transient = _is_transient_supabase_error(exc)
                per_source_errors: dict[str, dict[str, int]] = {}
                for row in valid_rows:
                    source_site = normalize_source_site(row.get("source_site") or row.get("listing_source"))
                    bucket = per_source_errors.setdefault(source_site, {"received": 0, "saved": 0, "errors": 0})
                    bucket["received"] += 1
                    bucket["errors"] += 1

                failed_count = len(valid_rows)
                state.total_errors += failed_count
                for source_site, stats in per_source_errors.items():
                    state.track(source_site, 0, stats.get("errors", 0), stats.get("received", 0))
                write_checkpoint(state)
                LOG.exception("Ingest failed for %s rows (retryable=%s): %s", failed_count, transient, exc)
                return self._json(
                    503 if transient else 500,
                    {
                        "error": "ingest_failed",
                        "retryable": transient,
                        "detail": str(exc)[:500],
                        "received": failed_count,
                        "upserted": 0,
                        "errors": failed_count,
                        "total_session": state.total_upserted,
                        "per_source": per_source_errors,
                    },
                )
            state.total_upserted += upserted
            state.total_errors += errors
            for source_site, stats in per_source.items():
                state.track(source_site, stats.get("saved", 0), stats.get("errors", 0), stats.get("received", 0))
            write_checkpoint(state)
            self._json(
                200,
                {
                    "upserted": upserted,
                    "errors": errors,
                    "total_session": state.total_upserted,
                    "per_source": per_source,
                },
            )

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
            LOG.info("%s - %s", self.address_string(), format % args)

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    setup_logging()
    LOG.info("Starting unified bridge server on 127.0.0.1:%s (dry_run=%s)", args.port, args.dry_run)
    supabase = get_supabase()
    state = BridgeState(dry_run=args.dry_run)
    write_checkpoint(state)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(supabase, state))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        LOG.info("Keyboard interrupt received. Exiting unified bridge server.")
    finally:
        server.server_close()
        write_checkpoint(state)
        LOG.info("Unified bridge server stopped.")


if __name__ == "__main__":
    main()
