"""
Audit logging for backfill score runs.
"""

from __future__ import annotations

from datetime import datetime, timezone
import os
from typing import Any

from dotenv import load_dotenv

load_dotenv()

_RUN_ERRORS: list[dict[str, str]] = []


def _utc_iso_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _get_supabase():
    from supabase import create_client

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise EnvironmentError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env")
    return create_client(url, key)


def log_scoring_error(source_id: str, error: Exception) -> None:
    """
    Accumulate scoring failures during a run for final audit logging.
    """
    _RUN_ERRORS.append(
        {
            "source_id": source_id or "unknown",
            "error_message": str(error),
        }
    )


def log_backfill_run(run_meta: dict[str, Any]) -> None:
    """
    Insert a run audit record into Supabase `backfill_runs`.
    """
    error_summary = run_meta.get("error_summary")
    if error_summary is None:
        error_summary = list(_RUN_ERRORS)

    payload = {
        "run_timestamp": run_meta.get("run_timestamp") or _utc_iso_timestamp(),
        "mode": run_meta.get("mode"),
        "intelligence_version": run_meta.get("intelligence_version"),
        "listings_attempted": int(run_meta.get("listings_attempted") or 0),
        "listings_scored": int(run_meta.get("listings_scored") or 0),
        "listings_failed": int(run_meta.get("listings_failed") or 0),
        "dry_run": bool(run_meta.get("dry_run", False)),
        "error_summary": error_summary,
    }

    try:
        supabase = _get_supabase()
        supabase.table("backfill_runs").insert(payload).execute()
    finally:
        # Clear run-local in-memory errors after each finalized run.
        _RUN_ERRORS.clear()
