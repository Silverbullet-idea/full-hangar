from __future__ import annotations

import hashlib
import json
import logging
import os
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import create_client


def setup_logging(verbose: bool = False) -> logging.Logger:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(level=level, format="%(asctime)s [%(levelname)s] %(message)s")
    return logging.getLogger(__name__)


def get_supabase():
    env_path = Path(__file__).resolve().parent / ".env"
    load_dotenv(dotenv_path=env_path)
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise EnvironmentError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
    return create_client(url, key)


def compute_listing_fingerprint(payload: dict[str, Any], fields: list[str] | None = None) -> str:
    if fields:
        data = {field: (payload or {}).get(field) for field in fields}
    else:
        data = payload or {}
    canonical = json.dumps(data, sort_keys=True, default=str, ensure_ascii=True)
    return hashlib.sha1(canonical.encode("utf-8")).hexdigest()


def safe_upsert_with_fallback(
    *,
    supabase: Any,
    table: str,
    rows: list[dict[str, Any]],
    on_conflict: str,
    fallback_match_keys: list[str] | None = None,
    logger: Any = None,
) -> int:
    if not rows:
        return 0
    try:
        response = supabase.table(table).upsert(rows, on_conflict=on_conflict).execute()
        return len(response.data or rows)
    except Exception as exc:
        if logger:
            logger.warning("Bulk upsert failed; falling back row-by-row: %s", exc)
        saved = 0
        for row in rows:
            try:
                supabase.table(table).upsert(row, on_conflict=on_conflict).execute()
                saved += 1
            except Exception as row_exc:
                if logger:
                    logger.warning("Row upsert failed for %s: %s", row.get("source_id"), row_exc)
        return saved


def fetch_existing_state(
    supabase: Any,
    *,
    source_site: str,
    source_ids: list[str],
    select_columns: str = "source_id,listing_fingerprint,last_seen_date,is_active",
) -> dict[str, dict[str, Any]]:
    existing: dict[str, dict[str, Any]] = {}
    if not source_ids:
        return existing
    for i in range(0, len(source_ids), 200):
        chunk = source_ids[i : i + 200]
        rows = (
            supabase.table("aircraft_listings")
            .select(select_columns)
            .eq("source_site", source_site)
            .in_("source_id", chunk)
            .execute()
            .data
            or []
        )
        for row in rows:
            sid = str(row.get("source_id") or "")
            if sid:
                existing[sid] = row
    return existing


def refresh_seen_for_unchanged(
    supabase: Any,
    *,
    source_site: str,
    source_ids: list[str],
    today_iso: str | None = None,
    logger: Any = None,
) -> int:
    if not source_ids:
        return 0
    today = today_iso or date.today().isoformat()
    touched = 0
    for i in range(0, len(source_ids), 200):
        chunk = source_ids[i : i + 200]
        try:
            response = (
                supabase.table("aircraft_listings")
                .update({"last_seen_date": today, "is_active": True, "inactive_date": None})
                .eq("source_site", source_site)
                .in_("source_id", chunk)
                .execute()
            )
            touched += len(response.data or [])
        except Exception as exc:
            if logger:
                logger.warning("refresh_seen_for_unchanged failed: %s", exc)
    return touched


def should_skip_detail(existing_row: dict[str, Any] | None, stale_days: int) -> bool:
    if not existing_row:
        return False
    last_seen = existing_row.get("last_seen_date")
    if not last_seen:
        return False
    try:
        if isinstance(last_seen, str):
            if len(last_seen) == 10:
                seen_dt = datetime.fromisoformat(last_seen).replace(tzinfo=timezone.utc)
            else:
                seen_dt = datetime.fromisoformat(last_seen.replace("Z", "+00:00"))
                if seen_dt.tzinfo is None:
                    seen_dt = seen_dt.replace(tzinfo=timezone.utc)
        elif isinstance(last_seen, datetime):
            seen_dt = last_seen if last_seen.tzinfo else last_seen.replace(tzinfo=timezone.utc)
        else:
            return False
        age_days = (datetime.now(timezone.utc) - seen_dt).total_seconds() / 86400.0
        return age_days <= max(0, stale_days)
    except Exception:
        return False


def mark_inactive_listings(
    supabase: Any,
    *,
    source_site: str,
    inactive_after_missed_runs: int = 3,
    logger: Any = None,
) -> int:
    # Conservative fallback: do not auto-inactivate in lightweight restore.
    if logger:
        logger.info(
            "[%s] mark_inactive_listings noop in restored scraper_base (threshold=%s)",
            source_site,
            inactive_after_missed_runs,
        )
    return 0
