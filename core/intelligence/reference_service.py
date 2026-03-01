"""
Supabase-backed reference lookups for aviation intelligence.
Intelligence layer only knows: ref = get_engine_reference(normalized_model).

Tables (Supabase):
  - engine_tbo_reference: pattern, tbo_hours, calendar_years, cost_min, cost_max
  - propeller_tbo_reference: pattern, tbo_hours, calendar_years, cost_min, cost_max, notes
  - life_limited_parts: item_type, interval_months, interval_hours, cost_min, cost_max,
      unairworthy_if_overdue, applicable (nullable; e.g. ROBINSON, CIRRUS or null = all)
"""

from __future__ import annotations

import os
from typing import Any

from .model_normalizer import normalize_engine_model, normalize_prop_model
from .reference import (
    ENGINE_TBO_REFERENCE,
    PROPELLER_TBO_REFERENCE,
    LLP_REFERENCE,
    DEFAULT_ENGINE_TBO_HOURS,
    DEFAULT_ENGINE_CALENDAR_YEARS,
    DEFAULT_PROP_TBO_HOURS,
    DEFAULT_PROP_CALENDAR_YEARS,
    ENGINE_OVERHAUL_COST_MIN,
    ENGINE_OVERHAUL_COST_MAX,
    PROP_OVERHAUL_COST_MIN,
    PROP_OVERHAUL_COST_MAX,
)

_client: Any = None


def _get_client():
    """Lazy Supabase client. Returns None if env not set (offline/fallback mode)."""
    global _client
    if _client is not None:
        return _client
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        return None
    try:
        from supabase import create_client
        _client = create_client(url, key)
        return _client
    except Exception:
        return None


def _normalize_pattern(p: str) -> str:
    """Same as model_normalizer: alphanumeric uppercase, no spaces/dashes."""
    if not p:
        return ""
    import re
    s = str(p).upper().strip()
    s = re.sub(r"[\s\-_]+", "", s)
    s = re.sub(r"[^A-Z0-9]", "", s)
    return s


def _best_engine_match(normalized_input: str, rows: list[dict]) -> dict | None:
    """Longest pattern that is a substring of normalized_input (or equals)."""
    if not normalized_input:
        return None
    best = None
    best_len = 0
    for r in rows:
        pattern = (r.get("pattern") or "").strip()
        norm = _normalize_pattern(pattern)
        if not norm or norm == "DEFAULT":
            if best is None:
                best = r
            continue
        if norm in normalized_input or normalized_input.startswith(norm):
            if len(norm) > best_len:
                best_len = len(norm)
                best = r
    return best


def get_engine_reference(engine_model: str, aircraft_type: str | None = None) -> dict:
    """
    Query Supabase engine_tbo_reference; fallback to in-code reference.
    engine_model should be normalized (use model_normalizer.normalize_engine_model).
    Returns: { tbo_hours, calendar_years, cost_min, cost_max } (calendar_years may be None).
    """
    normalized = normalize_engine_model(engine_model) if engine_model else ""
    client = _get_client()
    if client:
        try:
            resp = client.table("engine_tbo_reference").select("*").execute()
            if resp.data and len(resp.data) > 0:
                # Rows may have pattern; normalize and match
                rows = [r for r in resp.data if r.get("pattern")]
                match = _best_engine_match(normalized, rows) if normalized else (rows[0] if rows else None)
                if not match and rows:
                    match = next((r for r in rows if (r.get("pattern") or "").upper() == "DEFAULT"), rows[0])
                if match:
                    return {
                        "tbo_hours": int(match.get("tbo_hours", DEFAULT_ENGINE_TBO_HOURS)),
                        "calendar_years": int(match["calendar_years"]) if match.get("calendar_years") is not None else None,
                        "cost_min": int(match["cost_min"]) if match.get("cost_min") is not None else ENGINE_OVERHAUL_COST_MIN,
                        "cost_max": int(match["cost_max"]) if match.get("cost_max") is not None else ENGINE_OVERHAUL_COST_MAX,
                    }
        except Exception:
            pass

    # Fallback: in-code reference (use same longest-match as DB path)
    if normalized:
        match = _best_engine_match(normalized, ENGINE_TBO_REFERENCE)
    else:
        match = next((r for r in ENGINE_TBO_REFERENCE if (r.get("pattern") or "").upper() == "DEFAULT"), ENGINE_TBO_REFERENCE[0] if ENGINE_TBO_REFERENCE else None)
    if match:
        return {
            "tbo_hours": match["tbo_hours"],
            "calendar_years": match.get("calendar_years"),
            "cost_min": ENGINE_OVERHAUL_COST_MIN,
            "cost_max": ENGINE_OVERHAUL_COST_MAX,
        }
    return {
        "tbo_hours": DEFAULT_ENGINE_TBO_HOURS,
        "calendar_years": DEFAULT_ENGINE_CALENDAR_YEARS,
        "cost_min": ENGINE_OVERHAUL_COST_MIN,
        "cost_max": ENGINE_OVERHAUL_COST_MAX,
    }


def get_prop_reference(prop_model: str, raw_text: str | None = None) -> dict:
    """
    Query Supabase propeller_tbo_reference; fallback to in-code reference.
    prop_model: normalized string from listing. raw_text: optional raw description for pattern-in-text matching.
    Returns: { tbo_hours, calendar_years, cost_min, cost_max, notes }.
    """
    normalized = normalize_prop_model(prop_model) if prop_model else ""
    raw_upper = (raw_text or "").upper()
    client = _get_client()
    if client:
        try:
            resp = client.table("propeller_tbo_reference").select("*").execute()
            if resp.data and len(resp.data) > 0:
                rows = [r for r in resp.data if r.get("pattern")]
                match = _best_engine_match(normalized, rows) if normalized else None
                if not match and raw_upper:
                    for r in sorted(rows, key=lambda x: -len((x.get("pattern") or ""))):
                        if (r.get("pattern") or "").upper() in raw_upper:
                            match = r
                            break
                if not match and rows:
                    match = next((r for r in rows if (r.get("pattern") or "").upper() == "DEFAULT"), rows[0])
                if match:
                    return {
                        "tbo_hours": int(match.get("tbo_hours", DEFAULT_PROP_TBO_HOURS)),
                        "calendar_years": int(match["calendar_years"]) if match.get("calendar_years") is not None else None,
                        "cost_min": int(match["cost_min"]) if match.get("cost_min") is not None else PROP_OVERHAUL_COST_MIN,
                        "cost_max": int(match["cost_max"]) if match.get("cost_max") is not None else PROP_OVERHAUL_COST_MAX,
                        "notes": match.get("notes"),
                    }
        except Exception:
            pass

    match = _best_engine_match(normalized, PROPELLER_TBO_REFERENCE) if normalized else None
    if not match and raw_upper:
        for r in sorted(PROPELLER_TBO_REFERENCE, key=lambda x: -len((x.get("pattern") or ""))):
            if (r.get("pattern") or "").upper() in raw_upper:
                match = r
                break
    if not match:
        match = next((r for r in PROPELLER_TBO_REFERENCE if (r.get("pattern") or "").upper() == "DEFAULT"), PROPELLER_TBO_REFERENCE[0] if PROPELLER_TBO_REFERENCE else None)
    if match:
        return {
            "tbo_hours": match["tbo_hours"],
            "calendar_years": match.get("calendar_years"),
            "cost_min": PROP_OVERHAUL_COST_MIN,
            "cost_max": PROP_OVERHAUL_COST_MAX,
            "notes": match.get("notes"),
        }
    return {
        "tbo_hours": DEFAULT_PROP_TBO_HOURS,
        "calendar_years": DEFAULT_PROP_CALENDAR_YEARS,
        "cost_min": PROP_OVERHAUL_COST_MIN,
        "cost_max": PROP_OVERHAUL_COST_MAX,
        "notes": None,
    }


def get_llp_rules(make: str, model: str) -> list[dict]:
    """
    Query Supabase life_limited_parts; return rules applicable to this make/model.
    applicable is null (all) or a keyword like ROBINSON, CIRRUS; we filter by make/model.
    Fallback: in-code LLP_REFERENCE, filtered by applicable.
    """
    make_upper = (make or "").upper()
    model_upper = (model or "").upper()
    combined = make_upper + " " + model_upper

    client = _get_client()
    if client:
        try:
            resp = client.table("life_limited_parts").select("*").execute()
            if resp.data:
                out = []
                for r in resp.data:
                    app = (r.get("applicable") or "").strip().upper()
                    if not app or app in combined or app in make_upper or app in model_upper:
                        out.append({
                            "item_type": r.get("item_type"),
                            "interval_months": r.get("interval_months"),
                            "interval_hours": r.get("interval_hours"),
                            "cost_min": int(r["cost_min"]) if r.get("cost_min") is not None else 0,
                            "cost_max": int(r["cost_max"]) if r.get("cost_max") is not None else 0,
                            "unairworthy_if_overdue": bool(r.get("unairworthy_if_overdue", True)),
                            "applicable": r.get("applicable"),
                        })
                return out
        except Exception:
            pass

    out = []
    for r in LLP_REFERENCE:
        app = (r.get("applicable") or "").strip().upper()
        if not app or app in combined or "ROBINSON" in app and ("R22" in model_upper or "R44" in model_upper or "ROBINSON" in make_upper):
            out.append({
                "item_type": r.get("item_type"),
                "interval_months": r.get("interval_months"),
                "interval_hours": r.get("interval_hours"),
                "cost_min": r.get("cost_min", 0),
                "cost_max": r.get("cost_max", 0),
                "unairworthy_if_overdue": r.get("unairworthy_if_overdue", True),
                "applicable": r.get("applicable"),
            })
    return out
