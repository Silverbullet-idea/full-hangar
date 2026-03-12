"""
Local bridge server for Controller browser extension ingestion.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
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

SOURCE_SITE = "controller"
ROOT_DIR = Path(__file__).resolve().parent.parent
LOG_DIR = ROOT_DIR / "scraper" / "logs"
STATE_DIR = ROOT_DIR / "scraper" / "state"
LOG_FILE = LOG_DIR / "bridge_server.log"
CHECKPOINT_FILE = STATE_DIR / "bridge_checkpoint.json"
LOG = logging.getLogger("bridge_server")


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


def safe_upsert_with_fallback(*, supabase: Any, table: str, rows: list[dict[str, Any]], on_conflict: str, logger: logging.Logger) -> int:
    if not rows:
        return 0
    try:
        supabase.table(table).upsert(rows, on_conflict=on_conflict).execute()
        return len(rows)
    except Exception as exc:
        logger.warning("Bulk upsert failed; falling back row-by-row: %s", exc)
        saved = 0
        for row in rows:
            try:
                supabase.table(table).upsert(row, on_conflict=on_conflict).execute()
                saved += 1
            except Exception as row_exc:
                logger.warning("Row upsert failed for %s: %s", row.get("source_id"), row_exc)
        return saved


class BridgeState:
    def __init__(self, dry_run: bool):
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.total_upserted = 0
        self.total_errors = 0
        self.total_received = 0
        self.dry_run = dry_run

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": "ok",
            "source_site": SOURCE_SITE,
            "started_at": self.started_at,
            "total_upserted": self.total_upserted,
            "total_errors": self.total_errors,
            "total_received": self.total_received,
            "dry_run": self.dry_run,
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


def normalize_row(raw: dict[str, Any], existing: set[str]) -> tuple[dict[str, Any] | None, str | None]:
    row = dict(raw or {})
    row["source_site"] = SOURCE_SITE
    row["listing_source"] = row.get("listing_source") or SOURCE_SITE
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
    if source_id not in existing:
        row["first_seen_date"] = today
    if row.get("price_asking") is None and row.get("asking_price") is not None:
        row["price_asking"] = row.get("asking_price")
    if row.get("asking_price") is None and row.get("price_asking") is not None:
        row["asking_price"] = row.get("price_asking")
    normalized = {k: v for k, v in row.items() if not str(k).startswith("_")}
    return normalized, None


def fetch_existing_ids(supabase: Any, ids: list[str]) -> set[str]:
    if not ids:
        return set()
    rows = (
        supabase.table("aircraft_listings")
        .select("source_id")
        .eq("source_site", SOURCE_SITE)
        .in_("source_id", list(dict.fromkeys(ids))[:500])
        .execute()
        .data
        or []
    )
    return {str(r.get("source_id") or "").strip() for r in rows if r.get("source_id")}


def upsert_rows(supabase: Any, rows: list[dict[str, Any]], dry_run: bool) -> tuple[int, int]:
    ids = [str(r.get("source_id") or r.get("source_listing_id") or "").strip() for r in rows]
    existing = fetch_existing_ids(supabase, [i for i in ids if i])
    prepared: list[dict[str, Any]] = []
    errors = 0
    for row in rows:
        normalized, err = normalize_row(row, existing)
        if err:
            errors += 1
            continue
        prepared.append(normalized)
    if dry_run:
        return len(prepared), errors
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
    return saved, errors + max(0, len(prepared) - saved)


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
            state.total_received += len(payload)
            upserted, errors = upsert_rows(supabase, [x for x in payload if isinstance(x, dict)], state.dry_run)
            state.total_upserted += upserted
            state.total_errors += errors
            write_checkpoint(state)
            self._json(200, {"upserted": upserted, "errors": errors, "total_session": state.total_upserted})

        def log_message(self, format: str, *args: Any) -> None:  # noqa: A003
            LOG.info("%s - %s", self.address_string(), format % args)

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    setup_logging()
    LOG.info("Starting bridge server on 127.0.0.1:%s (dry_run=%s)", args.port, args.dry_run)
    supabase = get_supabase()
    state = BridgeState(dry_run=args.dry_run)
    write_checkpoint(state)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(supabase, state))
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
