"""
Reference data for aviation intelligence (FALLBACK ONLY).
Primary lookups: core/intelligence/reference_service.py (Supabase-backed).
This module holds in-code fallback data when DB is unavailable or returns no match.
"""

from __future__ import annotations

# ─── Engine TBO (Time Between Overhaul) ─────────────────────────────────────
# Key: pattern (uppercase) to match against listing engine_model or description
# tbo_hours: typical TBO in hours; calendar_years: max years (optional)
ENGINE_TBO_REFERENCE = [
    # Lycoming
    {"pattern": "LYCOMING O-360", "tbo_hours": 2000, "calendar_years": None},
    {"pattern": "LYCOMING IO-360", "tbo_hours": 2000, "calendar_years": None},
    {"pattern": "LYCOMING O-320", "tbo_hours": 2000, "calendar_years": None},
    {"pattern": "LYCOMING IO-320", "tbo_hours": 2000, "calendar_years": None},
    {"pattern": "LYCOMING O-540", "tbo_hours": 2000, "calendar_years": None},
    {"pattern": "LYCOMING IO-540", "tbo_hours": 2000, "calendar_years": None},
    {"pattern": "LYCOMING IO-550", "tbo_hours": 2000, "calendar_years": None},
    {"pattern": "LYCOMING TIO-540", "tbo_hours": 1800, "calendar_years": None},
    {"pattern": "LYCOMING", "tbo_hours": 2000, "calendar_years": 12},
    # Continental
    {"pattern": "CONTINENTAL IO-550", "tbo_hours": 2000, "calendar_years": None},
    {"pattern": "CONTINENTAL IO-520", "tbo_hours": 1700, "calendar_years": None},
    {"pattern": "CONTINENTAL O-470", "tbo_hours": 1500, "calendar_years": None},
    {"pattern": "CONTINENTAL IO-470", "tbo_hours": 1500, "calendar_years": None},
    {"pattern": "CONTINENTAL", "tbo_hours": 1800, "calendar_years": 12},
    # Rotax
    {"pattern": "ROTAX 912", "tbo_hours": 2000, "calendar_years": 5},
    {"pattern": "ROTAX", "tbo_hours": 2000, "calendar_years": 5},
    # Turbine (simplified; hot section logic later)
    {"pattern": "PT6A", "tbo_hours": 3500, "calendar_years": None},
    {"pattern": "TPE331", "tbo_hours": 3500, "calendar_years": None},
    # Fallback piston
    {"pattern": "DEFAULT", "tbo_hours": 2000, "calendar_years": 12},
]

# Default when no engine model matched
DEFAULT_ENGINE_TBO_HOURS = 2000
DEFAULT_ENGINE_CALENDAR_YEARS = 12

# ─── Propeller TBO ────────────────────────────────────────────────────────
PROPELLER_TBO_REFERENCE = [
    # McCauley / Hartzell typical
    {"pattern": "MCCAULEY", "tbo_hours": 2000, "calendar_years": 6},
    {"pattern": "HARTZELL", "tbo_hours": 2000, "calendar_years": 6},
    # Sensenich: often on-condition or 6000 hrs for metal
    {"pattern": "SENSENICH", "tbo_hours": 6000, "calendar_years": None, "notes": "on-condition possible"},
    # Default
    {"pattern": "DEFAULT", "tbo_hours": 2000, "calendar_years": 6},
]

DEFAULT_PROP_TBO_HOURS = 2000
DEFAULT_PROP_CALENDAR_YEARS = 6

# ─── Life-Limited Parts & Inspections ──────────────────────────────────────
# interval_months or interval_hours; cost_estimate in USD
LLP_REFERENCE = [
    {"item_type": "annual_inspection", "interval_months": 12, "interval_hours": None, "cost_min": 2000, "cost_max": 5000, "unairworthy_if_overdue": True},
    {"item_type": "elt_battery", "interval_months": 12, "interval_hours": None, "cost_min": 200, "cost_max": 500, "unairworthy_if_overdue": True},
    {"item_type": "caps_repack", "interval_months": 120, "interval_hours": None, "cost_min": 15000, "cost_max": 20000, "unairworthy_if_overdue": True},
    {"item_type": "magneto_500hr", "interval_months": None, "interval_hours": 500, "cost_min": 800, "cost_max": 2000, "unairworthy_if_overdue": False},
    {"item_type": "robinson_12yr", "interval_months": 144, "interval_hours": 12000, "cost_min": 80000, "cost_max": 120000, "unairworthy_if_overdue": True, "applicable": "robinson_r22_r44"},
]

# ─── Deferred cost estimates (when overdue / unknown) ───────────────────────
ENGINE_OVERHAUL_COST_MIN = 25000
ENGINE_OVERHAUL_COST_MAX = 45000
PROP_OVERHAUL_COST_MIN = 5000
PROP_OVERHAUL_COST_MAX = 15000


def get_engine_tbo(engine_model: str | None, aircraft_type: str | None) -> tuple[int, int | None]:
    """Return (tbo_hours, calendar_years). calendar_years may be None."""
    text = (engine_model or "").upper()
    for row in ENGINE_TBO_REFERENCE:
        if row["pattern"] in text or row["pattern"] == "DEFAULT":
            return row["tbo_hours"], row.get("calendar_years")
    return DEFAULT_ENGINE_TBO_HOURS, DEFAULT_ENGINE_CALENDAR_YEARS


def get_prop_tbo(prop_make: str | None) -> tuple[int, int | None]:
    """Return (tbo_hours, calendar_years)."""
    text = (prop_make or "").upper()
    for row in PROPELLER_TBO_REFERENCE:
        if row["pattern"] in text or row["pattern"] == "DEFAULT":
            return row["tbo_hours"], row.get("calendar_years")
    return DEFAULT_PROP_TBO_HOURS, DEFAULT_PROP_CALENDAR_YEARS
