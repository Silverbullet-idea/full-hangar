from __future__ import annotations

import json
from typing import Any


def _as_int(value: Any) -> int | None:
    try:
        if value is None or isinstance(value, bool):
            return None
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _as_engine_rows(value: Any) -> list[dict[str, Any]]:
    payload = value
    if isinstance(payload, str):
        raw = payload.strip()
        if not raw:
            return []
        try:
            payload = json.loads(raw)
        except Exception:
            return []
    if not isinstance(payload, list):
        return []
    return [row for row in payload if isinstance(row, dict)]


def _is_multi_engine(row: dict[str, Any]) -> bool:
    count = _as_int(row.get("engine_count"))
    if count is not None and count >= 2:
        return True
    joined = " ".join(
        str(row.get(k) or "").lower()
        for k in ("aircraft_type", "make", "model", "title", "description")
    )
    return any(token in joined for token in ("twin", "multi_engine", "multi-engine", "multi engine"))


def _infer_engine_count(row: dict[str, Any], engines: list[dict[str, Any]]) -> int | None:
    existing = _as_int(row.get("engine_count"))
    if existing is not None and existing > 0:
        # Prefer observed row count when explicit per-engine rows show more engines.
        if len(engines) > existing:
            return len(engines)
        return existing
    if len(engines) >= 2:
        return len(engines)
    if _is_multi_engine(row):
        return 2
    joined = " ".join(str(row.get(k) or "").lower() for k in ("aircraft_type", "model", "make"))
    if any(token in joined for token in ("single_engine", "single-engine", "single engine")):
        return 1
    return None


def _normalize_multi_engine_fields(row: dict[str, Any]) -> None:
    engines = _as_engine_rows(row.get("engines_raw"))
    props = _as_engine_rows(row.get("props_raw"))
    row["engine_count"] = _infer_engine_count(row, engines)

    engine_overhaul_hours = [
        _as_int(item.get("metric_hours") if "metric_hours" in item else item.get("hours"))
        for item in engines
        if "overhaul" in str(item.get("metric_type") or "").lower()
        or any(
            token in str(item.get("source_key") or "").lower()
            for token in ("smoh", "tso", "tsoh", "tsmoh", "overhaul", "soh")
        )
    ]
    engine_overhaul_hours = [val for val in engine_overhaul_hours if isinstance(val, int) and val >= 0]
    engine_hours = engine_overhaul_hours or [
        _as_int(item.get("metric_hours") if "metric_hours" in item else item.get("hours"))
        for item in engines
    ]
    engine_hours = [val for val in engine_hours if isinstance(val, int) and val >= 0]
    if engine_hours:
        if row.get("time_since_overhaul") in (None, "", 0):
            row["time_since_overhaul"] = engine_hours[0]
        if row.get("engine_time_since_overhaul") in (None, "", 0):
            row["engine_time_since_overhaul"] = engine_hours[0]
        if len(engine_hours) >= 2 and row.get("second_engine_time_since_overhaul") in (None, "", 0):
            row["second_engine_time_since_overhaul"] = engine_hours[1]

    prop_overhaul_hours = [
        _as_int(item.get("metric_hours") if "metric_hours" in item else item.get("hours"))
        for item in props
        if "overhaul" in str(item.get("metric_type") or "").lower()
        or any(
            token in str(item.get("source_key") or "").lower()
            for token in ("spoh", "prop smoh", "overhaul", "tso", "tsoh")
        )
    ]
    prop_overhaul_hours = [val for val in prop_overhaul_hours if isinstance(val, int) and val >= 0]
    prop_hours = prop_overhaul_hours or [
        _as_int(item.get("metric_hours") if "metric_hours" in item else item.get("hours"))
        for item in props
    ]
    prop_hours = [val for val in prop_hours if isinstance(val, int) and val >= 0]
    if prop_hours:
        if row.get("time_since_prop_overhaul") in (None, "", 0):
            row["time_since_prop_overhaul"] = prop_hours[0]
        if len(prop_hours) >= 2 and row.get("second_time_since_prop_overhaul") in (None, "", 0):
            row["second_time_since_prop_overhaul"] = prop_hours[1]

    # Fallback: infer second-engine/prop values from description_intelligence parser output.
    parsed = row.get("description_intelligence")
    if isinstance(parsed, str):
        try:
            parsed = json.loads(parsed)
        except Exception:
            parsed = None
    if isinstance(parsed, dict):
        times = parsed.get("times")
        if isinstance(times, dict):
            second_engine = _as_int(times.get("second_engine_smoh"))
            second_prop = _as_int(times.get("second_prop_spoh"))
            if second_engine is not None and row.get("second_engine_time_since_overhaul") in (None, "", 0):
                row["second_engine_time_since_overhaul"] = second_engine
            if second_prop is not None and row.get("second_time_since_prop_overhaul") in (None, "", 0):
                row["second_time_since_prop_overhaul"] = second_prop
            if second_engine is not None and row.get("engine_count") in (None, "", 0, 1):
                row["engine_count"] = 2


def validate_listing(listing: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """
    Minimal schema validator used by scraper modules.
    Returns (normalized_row, warnings).
    """
    row = dict(listing or {})
    warnings: list[str] = []

    source_id = str(row.get("source_id") or "").strip()
    if not source_id:
        warnings.append("missing source_id")

    source_site = str(row.get("source_site") or row.get("source") or "").strip()
    if source_site:
        row["source_site"] = source_site
    if "listing_source" not in row and source_site:
        row["listing_source"] = source_site

    _normalize_multi_engine_fields(row)

    return row, warnings
