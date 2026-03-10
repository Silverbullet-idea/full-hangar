"""
bridge_server.py
Full Hangar - Local Bridge Server for Browser Extension Harvester

Receives listing data from the browser extension content script and feeds
it into the existing Full Hangar upsert pipeline.

Usage:
  .venv312\\Scripts\\python.exe scraper\\bridge_server.py
  .venv312\\Scripts\\python.exe scraper\\bridge_server.py --dry-run
  .venv312\\Scripts\\python.exe scraper\\bridge_server.py --port 8765

Endpoints:
  GET  /ping    -> {"status": "ok"}
  POST /ingest  -> {"upserted": N, "skipped": N, "errors": N}
  GET  /status  -> current session stats
  GET  /stop    -> graceful shutdown

IMPORTANT: Only binds to 127.0.0.1 (localhost). Never exposed externally.
"""

from __future__ import annotations

import argparse
import json
import logging
from datetime import date, datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

try:
    from config import get_manufacturer_tier, normalize_manufacturer
    from description_parser import parse_description
    from schema import validate_listing
    from scraper_base import get_supabase, safe_upsert_with_fallback
except ImportError:  # pragma: no cover
    from .config import get_manufacturer_tier, normalize_manufacturer
    from .description_parser import parse_description
    from .schema import validate_listing
    from .scraper_base import get_supabase, safe_upsert_with_fallback


ROOT_DIR = Path(__file__).resolve().parent.parent
LOG_DIR = ROOT_DIR / "scraper" / "logs"
STATE_DIR = ROOT_DIR / "scraper" / "state"
LOG_FILE = LOG_DIR / "bridge_server.log"
CHECKPOINT_FILE = STATE_DIR / "bridge_checkpoint.json"

BATCH_SIZE = 20

LOG = logging.getLogger("bridge_server")


class BridgeState:
    def __init__(self, *, dry_run: bool):
        self.started_at = datetime.now(timezone.utc)
        self.last_batch_at: str | None = None
        self.last_error_at: str | None = None
        self.total_requests = 0
        self.total_received = 0
        self.total_upserted = 0
        self.total_skipped = 0
        self.total_errors = 0
        self.dry_run = dry_run

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": "ok",
            "started_at": self.started_at.isoformat(),
            "last_batch_at": self.last_batch_at,
            "last_error_at": self.last_error_at,
            "total_requests": self.total_requests,
            "total_received": self.total_received,
            "total_upserted": self.total_upserted,
            "total_skipped": self.total_skipped,
            "total_errors": self.total_errors,
            "dry_run": self.dry_run,
        }


def ensure_dirs() -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    STATE_DIR.mkdir(parents=True, exist_ok=True)


def setup_logging() -> None:
    ensure_dirs()
    handlers: list[logging.Handler] = [
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(),
    ]
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=handlers,
    )


def write_checkpoint(state: BridgeState) -> None:
    payload = {
        "total_upserted": state.total_upserted,
        "last_batch_time": state.last_batch_at,
        "error_count": state.total_errors,
        "total_received": state.total_received,
        "total_skipped": state.total_skipped,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    CHECKPOINT_FILE.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")


def chunked(rows: list[dict[str, Any]], size: int) -> list[list[dict[str, Any]]]:
    return [rows[i : i + size] for i in range(0, len(rows), size)]


def fetch_existing_source_ids(supabase: Any, source_ids: list[str]) -> set[str]:
    existing: set[str] = set()
    unique_ids = list(dict.fromkeys(source_ids))
    for i in range(0, len(unique_ids), 200):
        chunk = unique_ids[i : i + 200]
        if not chunk:
            continue
        rows = (
            supabase.table("aircraft_listings")
            .select("source_id")
            .eq("source_site", "controller")
            .in_("source_id", chunk)
            .execute()
            .data
            or []
        )
        for row in rows:
            sid = str(row.get("source_id") or "").strip()
            if sid:
                existing.add(sid)
    return existing


def normalize_and_validate_listing(raw: dict[str, Any], existing_source_ids: set[str], today_iso: str) -> tuple[dict[str, Any] | None, str | None]:
    row = dict(raw or {})

    row["source_site"] = str(row.get("source_site") or "controller").strip() or "controller"
    row["listing_source"] = row.get("listing_source") or row["source_site"]

    source_id = str(row.get("source_id") or row.get("source_listing_id") or "").strip()
    if not source_id:
        return None, "missing source_id/source_listing_id"
    row["source_id"] = source_id
    row["source_listing_id"] = str(row.get("source_listing_id") or source_id).strip()

    description = str(row.get("description") or row.get("description_full") or "").strip()
    if description:
        intel = parse_description(description, observed_price=row.get("price_asking") or row.get("asking_price"))
        row["description_intelligence"] = intel

    make = normalize_manufacturer(row.get("make"))
    if make:
        row["make"] = make
        tier = get_manufacturer_tier(make)
        if tier is not None:
            row["manufacturer_tier"] = tier

    row["last_seen_date"] = today_iso
    row["is_active"] = True
    row["inactive_date"] = None
    if source_id not in existing_source_ids:
        row["first_seen_date"] = today_iso

    normalized, warnings = validate_listing(row)
    if warnings:
        return None, "; ".join(warnings)
    return normalized, None


def upsert_batches(*, supabase: Any, listings: list[dict[str, Any]], dry_run: bool, state: BridgeState) -> tuple[int, int, int]:
    upserted = 0
    skipped = 0
    errors = 0

    today_iso = date.today().isoformat()
    source_ids = [str(item.get("source_id") or item.get("source_listing_id") or "").strip() for item in listings]
    existing_source_ids = fetch_existing_source_ids(supabase, [sid for sid in source_ids if sid])

    prepared: list[dict[str, Any]] = []
    for item in listings:
        normalized, error = normalize_and_validate_listing(item, existing_source_ids, today_iso)
        if error:
            skipped += 1
            errors += 1
            LOG.warning("[INGEST] skipping listing: %s", error)
            continue
        prepared.append(normalized)

    if dry_run:
        upserted = len(prepared)
        LOG.info("[INGEST] dry-run batch_size=%s upserted=%s errors=%s", len(prepared), upserted, errors)
        return upserted, skipped, errors

    for batch in chunked(prepared, BATCH_SIZE):
        if not batch:
            continue

        try:
            saved = safe_upsert_with_fallback(
                supabase=supabase,
                table="aircraft_listings",
                rows=batch,
                on_conflict="source_site,source_listing_id",
                fallback_match_keys=["source_site", "source_listing_id"],
                logger=LOG,
            )
            if saved == 0 and batch:
                saved = safe_upsert_with_fallback(
                    supabase=supabase,
                    table="aircraft_listings",
                    rows=batch,
                    on_conflict="source_site,source_id",
                    fallback_match_keys=["source_site", "source_id"],
                    logger=LOG,
                )
            upserted += saved
            state.last_batch_at = datetime.now(timezone.utc).isoformat()
            write_checkpoint(state)
            LOG.info("[INGEST] batch_size=%s upserted=%s errors=%s", len(batch), saved, errors)
        except Exception as exc:  # pragma: no cover
            errors += len(batch)
            state.last_error_at = datetime.now(timezone.utc).isoformat()
            LOG.exception("[INGEST] batch failed size=%s: %s", len(batch), exc)

    return upserted, skipped, errors


def make_handler(*, supabase: Any, state: BridgeState):
    class BridgeRequestHandler(BaseHTTPRequestHandler):
        server_version = "FullHangarBridge/1.0"

        def _set_headers(self, status_code: int = 200) -> None:
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()

        def _write_json(self, status_code: int, payload: dict[str, Any]) -> None:
            self._set_headers(status_code)
            self.wfile.write(json.dumps(payload, ensure_ascii=True).encode("utf-8"))

        def do_OPTIONS(self) -> None:  # noqa: N802
            self._set_headers(204)

        def do_GET(self) -> None:  # noqa: N802
            if self.path == "/ping":
                self._write_json(200, {"status": "ok"})
                return
            if self.path == "/status":
                self._write_json(200, state.to_dict())
                return
            if self.path == "/stop":
                self._write_json(200, {"status": "stopping"})
                LOG.info("Received /stop request. Shutting down bridge server.")
                self.server.shutdown()
                return
            self._write_json(404, {"error": "Not found"})

        def do_POST(self) -> None:  # noqa: N802
            if self.path != "/ingest":
                self._write_json(404, {"error": "Not found"})
                return

            state.total_requests += 1
            content_length = int(self.headers.get("Content-Length", "0") or "0")
            raw_body = self.rfile.read(content_length) if content_length > 0 else b"[]"

            try:
                payload = json.loads(raw_body.decode("utf-8"))
            except Exception:
                state.total_errors += 1
                self._write_json(400, {"error": "Invalid JSON body"})
                return

            if not isinstance(payload, list):
                state.total_errors += 1
                self._write_json(400, {"error": "Expected JSON array body"})
                return

            listings = [item for item in payload if isinstance(item, dict)]
            state.total_received += len(listings)

            try:
                upserted, skipped, errors = upsert_batches(
                    supabase=supabase,
                    listings=listings,
                    dry_run=state.dry_run,
                    state=state,
                )
            except Exception as exc:  # pragma: no cover
                state.total_errors += len(listings)
                state.last_error_at = datetime.now(timezone.utc).isoformat()
                LOG.exception("Unhandled ingest error: %s", exc)
                self._write_json(500, {"error": "Ingest processing failed"})
                return

            state.total_upserted += upserted
            state.total_skipped += skipped
            state.total_errors += errors
            state.last_batch_at = datetime.now(timezone.utc).isoformat()
            write_checkpoint(state)

            response = {
                "upserted": upserted,
                "skipped": skipped,
                "errors": errors,
                "total_session": state.total_upserted,
            }
            self._write_json(200, response)

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
            LOG.info("%s - %s", self.address_string(), format % args)

    return BridgeRequestHandler


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Full Hangar local bridge server for extension ingestion")
    parser.add_argument("--dry-run", action="store_true", help="Process and validate payloads without DB writes")
    parser.add_argument("--port", type=int, default=8765, help="Port to bind (default: 8765)")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    setup_logging()

    LOG.info("Starting bridge server on 127.0.0.1:%s (dry_run=%s)", args.port, args.dry_run)
    supabase = get_supabase()
    state = BridgeState(dry_run=args.dry_run)
    write_checkpoint(state)

    handler = make_handler(supabase=supabase, state=state)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        LOG.info("Keyboard interrupt received. Exiting bridge server.")
    finally:
        server.server_close()
        write_checkpoint(state)
        LOG.info("Bridge server stopped.")


if __name__ == "__main__":
    main()
