"""
Layer 2: Aircraft Intelligence Score (Full-Hangar Value Score)
Deterministic aviation logic: engine/prop life, LLP, deferred cost.
Uses reference_service for TBO/LLP (Supabase-backed with fallback).

2026-03-03: Added NTSB accident scoring/risk overrides for destroyed/substantial history.
"""

from __future__ import annotations

from datetime import date, datetime
import os
import re
import statistics

from .avionics_intelligence import avionics_score
from .model_normalizer import extract_engine_canonical_from_listing, extract_prop_canonical_from_listing
from .reference_service import get_engine_reference, get_prop_reference, get_llp_rules, lookup_engine_tbo_from_model

# v1.9.3 - Score distribution fix: age-differentiated imputed defaults,
# widened risk tier bands (LOW threshold 78, HIGH band 25-44),
# days_on_market tiebreaker nudge, _components_measured tracking.
INTELLIGENCE_VERSION = "1.9.3"


# ─── Engine Life Remaining ───────────────────────────────────────────────────
def engine_life_remaining(listing: dict) -> dict:
    """
    remaining_percent = (TBO - SMOH) / TBO.
    Penalize: over-TBO (heavy), calendar limit exceeded.
    TBO and costs from reference_service (Supabase or fallback).
    """
    smoh = listing.get("time_since_overhaul")
    snew = listing.get("time_since_new_engine")
    year = listing.get("year")

    def _as_positive_number(value):
        try:
            number = float(value)
            return number if number > 0 else None
        except (TypeError, ValueError):
            return None

    tbo_hours = _as_positive_number(listing.get("engine_tbo_hours"))
    tbo_source = "listing" if tbo_hours is not None else None
    model_lookup = lookup_engine_tbo_from_model(listing.get("engine_model"))
    calendar_years = None
    if tbo_hours is None and model_lookup.get("found"):
        tbo_hours = model_lookup.get("tbo_hours")
        calendar_years = model_lookup.get("calendar_years")
        tbo_source = "engine_model_lookup"
    if tbo_hours is not None:
        tbo_hours = int(tbo_hours)
    tbo_known = tbo_hours is not None
    if calendar_years is None and model_lookup.get("found"):
        calendar_years = model_lookup.get("calendar_years")
    if tbo_source is None:
        tbo_source = "unknown"

    current_year = datetime.now().year
    manufacture_year = year or current_year
    age_years = current_year - manufacture_year

    hours_remaining = None
    remaining_percent = None
    over_tbo = False
    calendar_exceeded = False
    score = 50.0

    engine_time_known = (snew is not None) or (smoh is not None)
    if not engine_time_known:
        # Unknown engine-time data is neutral by design: no "good" assumption.
        score = 50.0

    elif not tbo_known:
        # Engine time is known, but no TBO reference could be resolved.
        score = 55.0

    elif snew is not None:
        hours_remaining = max(0, tbo_hours - snew)
        remaining_percent = (hours_remaining / tbo_hours) * 100 if tbo_hours else 100
        over_tbo = snew >= tbo_hours
        if calendar_years and age_years >= calendar_years:
            calendar_exceeded = True
        if over_tbo:
            score = max(0, 20 - (snew - tbo_hours) / 100)
        elif calendar_exceeded:
            score = 40
        else:
            score = min(100, 40 + remaining_percent * 0.6)

    elif smoh is not None:
        hours_remaining = max(0, tbo_hours - smoh)
        remaining_percent = (hours_remaining / tbo_hours) * 100 if tbo_hours else 100
        over_tbo = smoh >= tbo_hours
        if calendar_years and age_years >= calendar_years:
            calendar_exceeded = True
        if over_tbo:
            score = max(0, 15 - (smoh - tbo_hours) / 80)
        elif calendar_exceeded:
            score = 35
        else:
            score = min(100, 30 + remaining_percent * 0.7)

    return {
        "tbo_hours": tbo_hours,
        "tbo_known": tbo_known,
        "tbo_source": tbo_source,
        "engine_time_known": engine_time_known,
        "calendar_years": calendar_years,
        "hours_remaining": hours_remaining,
        "remaining_percent": round(remaining_percent, 1) if remaining_percent is not None else None,
        "over_tbo": over_tbo,
        "calendar_exceeded": calendar_exceeded,
        "score": round(score, 1),
    }


# ─── Propeller Life Remaining ─────────────────────────────────────────────────
def prop_life_remaining(listing: dict) -> dict:
    """Hours remaining % and calendar expiration. Ref from reference_service."""
    spoh = listing.get("time_since_prop_overhaul")
    year = listing.get("year")
    prop_overhaul_date = listing.get("prop_overhaul_date")
    desc = (listing.get("description") or "") + " " + (listing.get("description_full") or "")
    prop_canonical = extract_prop_canonical_from_listing(listing)
    ref = get_prop_reference(prop_canonical, raw_text=desc)
    tbo_hours = ref["tbo_hours"]
    calendar_years = ref.get("calendar_years")
    current_dt = date.today()
    current_year = current_dt.year
    manufacture_year = year or current_year
    age_years = current_year - manufacture_year
    prop_calendar_age_days = age_years * 365
    if prop_overhaul_date:
        try:
            overhaul_dt = date.fromisoformat(str(prop_overhaul_date))
            prop_calendar_age_days = (current_dt - overhaul_dt).days
        except (TypeError, ValueError):
            # Fall back to manufacture-year logic when date format is invalid.
            pass

    hours_remaining = None
    remaining_percent = None
    over_tbo = False
    calendar_overdue = False
    score = 50.0

    if spoh is not None:
        hours_remaining = max(0, tbo_hours - spoh)
        remaining_percent = (hours_remaining / tbo_hours) * 100 if tbo_hours else 100
        over_tbo = spoh >= tbo_hours
        if calendar_years and prop_calendar_age_days >= (calendar_years * 365):
            calendar_overdue = True
        if over_tbo:
            score = max(0, 25 - (spoh - tbo_hours) / 100)
        elif calendar_overdue:
            score = 45
        else:
            score = min(100, 35 + remaining_percent * 0.65)

    return {
        "tbo_hours": tbo_hours,
        "calendar_years": calendar_years,
        "hours_remaining": hours_remaining,
        "remaining_percent": round(remaining_percent, 1) if remaining_percent is not None else None,
        "over_tbo": over_tbo,
        "calendar_overdue": calendar_overdue,
        "score": round(score, 1),
    }


# ─── Life-Limited Parts Status ───────────────────────────────────────────────
def llp_status(listing: dict) -> dict:
    """
    Each expired item → major deduction.
    Uses get_llp_rules(make, model) for cost ranges and applicability.
    """
    items = []
    deductions = 0
    desc = (listing.get("description") or "") + " " + (listing.get("description_full") or "")
    desc_upper = desc.upper()
    make = (listing.get("make") or "").upper()
    model = (listing.get("model") or "").upper()
    tt = listing.get("total_time_airframe")
    year = listing.get("year")
    current_year = datetime.now().year

    llp_rules = get_llp_rules(make, model)
    rule_by_type = {r["item_type"]: r for r in llp_rules}

    def first_valid_iso_date(*keys):
        for key in keys:
            value = listing.get(key)
            if not value:
                continue
            try:
                return date.fromisoformat(str(value))
            except (TypeError, ValueError):
                continue
        return None

    def cost_est(rule, default_lo, default_hi):
        if not rule:
            return (default_lo, default_hi)
        return (rule.get("cost_min", default_lo), rule.get("cost_max", default_hi))

    # Annual
    annual_expired = "annual expired" in desc_upper or "overdue annual" in desc_upper
    annual_dt = first_valid_iso_date("last_annual_date", "last_annual", "annual_date")
    if annual_dt and (date.today() - annual_dt).days > 365:
        annual_expired = True
    annual_soon = "annual due" in desc_upper and "expired" not in desc_upper
    cost_est_annual = cost_est(rule_by_type.get("annual_inspection"), 2000, 5000)
    if annual_expired:
        deductions += 40
        items.append({"item": "annual_inspection", "status": "expired", "unairworthy": True, "cost_estimate": cost_est_annual})
    elif annual_soon:
        items.append({"item": "annual_inspection", "status": "due_soon", "unairworthy": False, "cost_estimate": cost_est_annual})
        deductions += 10

    # ELT battery
    elt_expired = "elt" in desc_upper and ("expired" in desc_upper or "battery due" in desc_upper)
    elt_expiry_dt = first_valid_iso_date("elt_expiry_date", "elt_expiry", "elt_battery_expiry")
    if elt_expiry_dt and elt_expiry_dt < date.today():
        elt_expired = True
    cost_est_elt = cost_est(rule_by_type.get("elt_battery"), 200, 500)
    if elt_expired:
        deductions += 25
        items.append({"item": "elt_battery", "status": "expired", "unairworthy": True, "cost_estimate": cost_est_elt})

    # CAPS (Cirrus)
    caps_overdue = "caps" in desc_upper and ("overdue" in desc_upper or "repack due" in desc_upper or "expired" in desc_upper)
    cost_est_caps = cost_est(rule_by_type.get("caps_repack"), 15000, 20000)
    if caps_overdue or ("CIRRUS" in make and "PARACHUTE" in desc_upper):
        deductions += 35
        items.append({"item": "caps_repack", "status": "overdue", "unairworthy": True, "cost_estimate": cost_est_caps})

    # Robinson 12-year
    is_robinson = "ROBINSON" in make or "R22" in model or "R44" in model
    cost_est_rob = cost_est(rule_by_type.get("robinson_12yr"), 80000, 120000)
    if is_robinson and tt is not None and year is not None:
        age_years = current_year - year
        if age_years >= 12 or (tt or 0) >= 12000:
            deductions += 50
            items.append({"item": "robinson_12yr", "status": "due_or_overdue", "unairworthy": True, "cost_estimate": cost_est_rob})

    # Magneto 500 hr
    smoh = listing.get("time_since_overhaul") or listing.get("time_since_new_engine") or 0
    cost_est_mag = cost_est(rule_by_type.get("magneto_500hr"), 800, 2000)
    if smoh is not None and smoh >= 500 and "magneto" not in desc_upper:
        items.append({"item": "magneto_500hr", "status": "consider_service", "unairworthy": False, "cost_estimate": cost_est_mag})
        deductions += 5

    llp_score = max(0, 100 - deductions)
    return {
        "items": items,
        "score": round(llp_score, 1),
        "any_unairworthy": any(it.get("unairworthy") for it in items),
    }


# ─── Deferred Cost: Structured Breakdown ─────────────────────────────────────
def calculate_deferred_cost(listing: dict) -> dict:
    """
    Structured deferred cost for UI, charts, biggest-cost-driver insights.
    breakdown: engine_overhaul, prop_overhaul, annual_due, elt_due, caps_due,
              magneto_500hr, robinson_12yr (each 0 if not applicable).
    total = sum(breakdown); true_cost = asking_price + total.
    """
    asking = listing.get("asking_price") or 0
    engine = engine_life_remaining(listing)
    prop = prop_life_remaining(listing)
    llp = llp_status(listing)

    engine_ref = get_engine_reference(extract_engine_canonical_from_listing(listing), listing.get("aircraft_type"))
    prop_ref = get_prop_reference(
        extract_prop_canonical_from_listing(listing),
        raw_text=(listing.get("description") or "") + " " + (listing.get("description_full") or ""),
    )

    breakdown = {
        "engine_overhaul": 0,
        "prop_overhaul": 0,
        "annual_due": 0,
        "elt_due": 0,
        "caps_due": 0,
        "magneto_500hr": 0,
        "robinson_12yr": 0,
    }

    if engine.get("over_tbo") or engine.get("calendar_exceeded"):
        breakdown["engine_overhaul"] = (engine_ref.get("cost_min", 25000) + engine_ref.get("cost_max", 45000)) // 2

    if prop.get("over_tbo") or prop.get("calendar_overdue"):
        breakdown["prop_overhaul"] = (prop_ref.get("cost_min", 5000) + prop_ref.get("cost_max", 15000)) // 2

    for it in llp.get("items", []):
        if it.get("status") in ("expired", "overdue", "due_or_overdue"):
            lo, hi = it.get("cost_estimate", (0, 0))
            cost = (lo + hi) // 2
            item_type = it.get("item", "")
            if item_type == "annual_inspection":
                breakdown["annual_due"] = cost
            elif item_type == "elt_battery":
                breakdown["elt_due"] = cost
            elif item_type == "caps_repack":
                breakdown["caps_due"] = cost
            elif item_type == "magneto_500hr":
                breakdown["magneto_500hr"] = cost
            elif item_type == "robinson_12yr":
                breakdown["robinson_12yr"] = cost
    # consider_service magneto: optional, could add as small amount or 0
    for it in llp.get("items", []):
        if it.get("item") == "magneto_500hr" and it.get("status") == "consider_service":
            lo, hi = it.get("cost_estimate", (0, 0))
            breakdown["magneto_500hr"] = (lo + hi) // 2
            break

    total = sum(breakdown.values())
    true_cost = asking + total

    # Keep deferred_items for backward compatibility / detail view
    deferred_items = []
    for key, val in breakdown.items():
        if val > 0:
            deferred_items.append({"item": key, "estimate": val})

    return {
        "breakdown": breakdown,
        "total": total,
        "true_cost": true_cost,
        "asking_price": asking,
        "deferred_items": deferred_items,
    }


# ─── Risk Level ──────────────────────────────────────────────────────────────
def risk_level_from_score(
    value_score: float,
    llp_any_unairworthy: bool,
    faa_alert: str | None = None,
    severe_ntsb: bool = False,
) -> str:
    faa_alert_text = str(faa_alert).upper() if faa_alert else ""
    if severe_ntsb:
        return "CRITICAL"
    if "DEREGISTERED" in faa_alert_text:
        return "CRITICAL"
    if "REVOKED" in faa_alert_text:
        return "CRITICAL"
    if "EXPIRED" in faa_alert_text:
        return "CRITICAL"
    if llp_any_unairworthy:
        return "CRITICAL"
    if value_score >= 78:
        return "LOW"
    if value_score >= 45:
        return "MODERATE"
    if value_score >= 25:
        return "HIGH"
    return "CRITICAL"


# ─── Aircraft Intelligence Score (Value Score 0–100) ────────────────────────
INTELLIGENCE_WEIGHTS = {
    "engine": 0.35,
    "prop": 0.12,
    "llp": 0.18,
    "quality": 0.20,
    "avionics": 0.15,
}

# Hybrid score profile: deterministic subsystem scoring + data-calibrated modifiers.
HYBRID_SCORING_PROFILE = {
    "condition_weight": 0.45,
    "market_weight": 0.35,
    "execution_weight": 0.20,
    "comp_sample_bonus": [
        (25, 6.0),
        (15, 4.0),
        (8, 2.0),
        (5, 1.0),
        (0, 0.0),
    ],
    "deal_tier_adjustments": {
        "EXCEPTIONAL_DEAL": 7.0,
        "GOOD_DEAL": 3.5,
        "FAIR_MARKET": 0.0,
        "ABOVE_MARKET": -3.5,
        "OVERPRICED": -7.0,
        "INSUFFICIENT_DATA": 0.0,
    },
    "avionics_source_adjustments": {
        "oem_msrp": 3.0,
        "market_p25": 1.5,
        "fallback_static": 0.0,
        "none": 0.0,
        "null": 0.0,
    },
    "confidence_multiplier": {
        "HIGH": 1.00,
        "MEDIUM": 0.96,
        "LOW": 0.90,
    },
    "low_data_band": {
        "HIGH": (48.0, 84.0),
        "MEDIUM": (40.0, 78.0),
        "LOW": (30.0, 72.0),
    },
}

_market_comps_client = None
_market_comps_cache: dict[tuple[str, str], dict | None] = {}
_baseline_values_cache: dict[tuple[str, str, int | None], dict | None] = {}
_component_sales_cache: dict[tuple[str, str], dict | None] = {}
_exact_comp_pool_cache: dict[tuple[str, str], list[dict]] = {}
_family_comp_pool_cache: dict[tuple[str, str], list[dict]] = {}
_make_comp_pool_cache: dict[str, list[dict]] = {}


def _live_comp_pool_disabled() -> bool:
    value = str(os.environ.get("FULL_HANGAR_DISABLE_LIVE_COMP_POOL", "")).strip().lower()
    return value in {"1", "true", "yes", "on"}


def _get_market_comps_client():
    global _market_comps_client
    if _market_comps_client is not None:
        return _market_comps_client

    url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not service_key:
        return None
    try:
        from supabase import create_client
        try:
            from supabase.lib.client_options import ClientOptions

            timeout_seconds = int(
                os.environ.get(
                    "MARKET_COMPS_TIMEOUT_SECONDS",
                    os.environ.get("SUPABASE_POSTGREST_TIMEOUT_SECONDS", "60"),
                )
            )
            options = ClientOptions(
                postgrest_client_timeout=timeout_seconds,
                storage_client_timeout=timeout_seconds,
            )
            _market_comps_client = create_client(url, service_key, options=options)
        except Exception:
            # Compatibility fallback for client variants without ClientOptions support.
            _market_comps_client = create_client(url, service_key)
    except Exception:
        _market_comps_client = None
    return _market_comps_client


def _safe_float(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number:  # NaN check
        return None
    return number


def _safe_int(value):
    number = _safe_float(value)
    if number is None:
        return None
    try:
        return int(round(number))
    except (TypeError, ValueError):
        return None


_ENGINE_LOOKUP_NOISE_WORDS = {
    "HOURS",
    "HOUR",
    "SNEW",
    "SMOH",
    "SPOH",
    "PROP",
    "PROPELLER",
    "INTERIOR",
    "EXTERIOR",
    "PROGRAM",
    "ADVANTAGE",
    "COLLINS",
    "PROLINE",
    "AVIONICS",
}

_ENGINE_MODEL_PATTERNS = [
    re.compile(r"\b(?:AE|GO|GIO|HIO|IO|IVO|LIO|LO|LTIO|LTSIO|O|TIO|TO|TSIO|VO)-?\d{3,4}[A-Z0-9-]*\b"),
    re.compile(r"\bR-?\d{3,4}[A-Z0-9-]*\b"),
    re.compile(r"\b(?:PT6A|PT6T|JT15D|PW\d{3,4}[A-Z]?|TPE331|M601|RR300|CF34|FJ44|TFE731)[A-Z0-9-]*\b"),
]


def _canonicalize_engine_token(value: str | None) -> str | None:
    token = re.sub(r"\s+", " ", str(value or "").upper()).strip(" -/")
    if not token:
        return None

    # Strip trailing narrative qualifiers that are not part of a model.
    token = re.sub(r"\b(?:SERIES|SER)\b", "", token).strip(" -/")
    # Remove leading manufacturer words that leak into model fields.
    token = re.sub(
        r"^(?:CONTINENTAL|LYCOMING|PRATT\s*(?:&|AND)?\s*WHITNEY|WILLIAMS)\s+",
        "",
        token,
    ).strip(" -/")
    if not token:
        return None

    token = token.replace("/", "-")

    # Common OCR/typing errors where letter O is captured as zero.
    token = re.sub(r"\bTI0-", "TIO-", token)
    token = re.sub(r"\bTSI0-", "TSIO-", token)
    token = re.sub(r"\bI0-", "IO-", token)
    token = re.sub(r"\b0-(\d{3,4})", r"O-\1", token)

    match = re.match(r"^([A-Z0-9]+)-?(\d{3,4})([A-Z0-9-]*)$", token)
    if not match:
        return token

    prefix = match.group(1)
    digits = match.group(2)
    suffix = (match.group(3) or "").strip("-")
    canonical = f"{prefix}-{digits}"
    if suffix:
        canonical = f"{canonical}-{suffix}"
    return canonical


def _clean_engine_model_text(value: str | None) -> str:
    text = re.sub(r"[^A-Z0-9/\- ]+", " ", str(value or "").upper())
    text = re.sub(r"\s+", " ", text).strip()
    # Canonicalize malformed short forms where possible.
    canonical = _canonicalize_engine_token(text)
    if canonical:
        return canonical
    return text


def _extract_engine_model_token(value: str | None) -> str | None:
    text = _clean_engine_model_text(value)
    if not text:
        return None
    for pattern in _ENGINE_MODEL_PATTERNS:
        match = pattern.search(text)
        if match:
            token = _canonicalize_engine_token(match.group(0).replace("/", "-"))
            if token:
                return token
    return None


def _is_plausible_engine_lookup_value(value: str | None) -> bool:
    token = _clean_engine_model_text(value)
    if not token:
        return False
    if len(token) > 48:
        return False
    if token.count(" ") > 2:
        return False
    if not re.search(r"[A-Z]", token):
        return False
    if not re.search(r"\d", token):
        return False
    if any(word in token.split() for word in _ENGINE_LOOKUP_NOISE_WORDS):
        return False
    return True


def _build_engine_lookup_candidates(engine_model: str | None) -> list[str]:
    raw = _clean_engine_model_text(engine_model)
    extracted = _extract_engine_model_token(raw)
    candidates: list[str] = []
    for candidate in (raw, extracted):
        if candidate and _is_plausible_engine_lookup_value(candidate):
            if candidate not in candidates:
                candidates.append(candidate)
    return candidates


def _normalize_engine_model_for_pricing(engine_model: str | None) -> str | None:
    model = _clean_engine_model_text(engine_model)
    if not model:
        return None
    match = re.match(r"^([A-Z]+-\d+)(?:-([A-Z])\w*)?", model)
    if not match:
        return model
    base = match.group(1)
    variant_letter = match.group(2)
    return f"{base}-{variant_letter}" if variant_letter else base


def _extract_engine_family_for_pricing(engine_model: str | None) -> str | None:
    model = _clean_engine_model_text(engine_model)
    if not model:
        return None
    match = re.match(r"^([A-Z]+-\d+)", model)
    return match.group(1) if match else model


def _first_plausible_engine_lookup_candidate(engine_model: str | None) -> str | None:
    candidates = _build_engine_lookup_candidates(engine_model)
    return candidates[0] if candidates else None


def lookup_engine_overhaul_pricing(engine_model: str, supabase_client=None) -> dict | None:
    """
    Look up engine overhaul pricing for a given engine model.
    """
    models = _build_engine_lookup_candidates(engine_model)
    if not models:
        return None

    client = supabase_client or _get_market_comps_client()
    if client is None:
        return None

    select_cols = "exchange_price,core_charge,retail_price,manufacturer,engine_model,engine_model_normalized,engine_family,updated_at"
    for model in models:
        normalized_model = _normalize_engine_model_for_pricing(model)
        family_model = _extract_engine_family_for_pricing(model)
        lookups = [
            ("exact", "engine_model", model),
            ("normalized", "engine_model_normalized", normalized_model),
            ("family", "engine_family", family_model),
        ]
        for match_type, column, value in lookups:
            if not value:
                continue
            try:
                response = (
                    client.table("engine_overhaul_pricing")
                    .select(select_cols)
                    .eq(column, value)
                    .order("updated_at", desc=True)
                    .limit(1)
                    .execute()
                )
                row = (response.data or [None])[0]
            except Exception:
                row = None
            if not row:
                continue
            return {
                "exchange_price": _safe_float(row.get("exchange_price")),
                "core_charge": _safe_float(row.get("core_charge")),
                "retail_price": _safe_float(row.get("retail_price")),
                "manufacturer": row.get("manufacturer"),
                "engine_model_matched": row.get("engine_model"),
                "match_type": match_type,
            }
    return None


def _estimate_engine_overhaul_pricing_from_family(engine_model: str, supabase_client=None) -> dict | None:
    """
    Estimate overhaul pricing from family-level records when exact model pricing is unavailable.
    """
    models = _build_engine_lookup_candidates(engine_model)
    if not models:
        return None

    client = supabase_client or _get_market_comps_client()
    if client is None:
        return None

    select_cols = "exchange_price,core_charge,retail_price,manufacturer,engine_family,updated_at"
    for model in models:
        family = _extract_engine_family_for_pricing(model)
        if not family:
            continue
        try:
            response = (
                client.table("engine_overhaul_pricing")
                .select(select_cols)
                .ilike("engine_family", f"{family}%")
                .order("updated_at", desc=True)
                .limit(40)
                .execute()
            )
            rows = response.data or []
        except Exception:
            rows = []
        if not rows:
            continue

        exchange_values = [_safe_float(row.get("exchange_price")) for row in rows]
        exchange_values = [value for value in exchange_values if value is not None and value > 0]
        core_values = [_safe_float(row.get("core_charge")) for row in rows]
        core_values = [value for value in core_values if value is not None and value >= 0]
        retail_values = [_safe_float(row.get("retail_price")) for row in rows]
        retail_values = [value for value in retail_values if value is not None and value > 0]

        if not exchange_values:
            continue

        manufacturer_counts: dict[str, int] = {}
        for row in rows:
            manufacturer = str(row.get("manufacturer") or "").strip()
            if manufacturer:
                manufacturer_counts[manufacturer] = manufacturer_counts.get(manufacturer, 0) + 1
        dominant_mfr = max(manufacturer_counts.items(), key=lambda item: item[1])[0] if manufacturer_counts else None

        return {
            "exchange_price": round(float(statistics.median(exchange_values)), 2),
            "core_charge": round(float(statistics.median(core_values)), 2) if core_values else None,
            "retail_price": round(float(statistics.median(retail_values)), 2) if retail_values else None,
            "manufacturer": dominant_mfr,
            "engine_model_matched": family,
            "match_type": "family_estimated",
        }
    return None


def score_engine_value(listing: dict, tbo_data: dict | None, pricing: dict | None) -> dict:
    """
    Calculate engine remaining value and overrun liability.
    """
    smoh_value = listing.get("engine_time_since_overhaul")
    if smoh_value is None:
        smoh_value = listing.get("engine_hours_smoh")
    if smoh_value is None:
        smoh_value = listing.get("time_since_overhaul")
    engine_hours_smoh = _safe_int(smoh_value)
    tbo_hours = _safe_int((tbo_data or {}).get("tbo_hours"))
    exchange_price = _safe_float((pricing or {}).get("exchange_price"))
    core_charge = _safe_float((pricing or {}).get("core_charge"))

    hours_remaining = None
    hours_past_tbo = None
    pct_life_remaining = None
    engine_remaining_value = None
    engine_overrun_liability = None
    engine_reserve_per_hour = None
    score_contribution = 0.0

    if tbo_hours and engine_hours_smoh is not None:
        hours_remaining = tbo_hours - engine_hours_smoh
        hours_past_tbo = max(0, engine_hours_smoh - tbo_hours)
        pct_life_remaining = max(0.0, min(1.0, hours_remaining / max(tbo_hours, 1)))
        used_pct = engine_hours_smoh / max(tbo_hours, 1)
        if used_pct < 0.25:
            score_contribution = 25.0
        elif used_pct < 0.50:
            score_contribution = 20.0
        elif used_pct < 0.75:
            score_contribution = 15.0
        elif used_pct <= 1.0:
            score_contribution = 8.0
        else:
            overrun_pct = (engine_hours_smoh - tbo_hours) / max(tbo_hours, 1)
            score_contribution = -5.0 if overrun_pct > 0.10 else 0.0

    if exchange_price is not None and tbo_hours:
        engine_reserve_per_hour = exchange_price / max(tbo_hours, 1)
    if exchange_price is not None and pct_life_remaining is not None:
        engine_remaining_value = exchange_price * pct_life_remaining
    if exchange_price is not None and hours_past_tbo is not None:
        overrun_pct = min(hours_past_tbo / max(tbo_hours or 1, 1), 1.0)
        engine_overrun_liability = 0.0 if hours_past_tbo <= 0 else exchange_price * overrun_pct

    if tbo_hours and exchange_price is not None:
        data_quality = "full"
    elif tbo_hours:
        data_quality = "tbo_only"
    elif exchange_price is not None:
        data_quality = "pricing_only"
    else:
        data_quality = "none"

    explanation = "Insufficient engine lifecycle and pricing data."
    if data_quality == "full":
        match_type = (pricing or {}).get("match_type")
        if match_type == "family_estimated":
            data_quality = "estimated_pricing"
        explanation = (
            f"Engine SMOH {engine_hours_smoh}h vs TBO {tbo_hours}h; "
            f"exchange reference ${exchange_price:,.0f} ({match_type or 'unknown'} match)."
        )
    elif data_quality == "tbo_only":
        explanation = f"Engine SMOH {engine_hours_smoh}h vs TBO {tbo_hours}h; overhaul pricing unavailable."
    elif data_quality == "pricing_only":
        explanation = f"Pricing reference found (${exchange_price:,.0f}), but TBO/SMOH pairing unavailable."

    return {
        "engine_hours_smoh": engine_hours_smoh,
        "tbo_hours": tbo_hours,
        "hours_remaining": hours_remaining,
        "hours_past_tbo": hours_past_tbo,
        "pct_life_remaining": round(float(pct_life_remaining), 4) if pct_life_remaining is not None else None,
        "exchange_price": round(float(exchange_price), 2) if exchange_price is not None else None,
        "core_charge": round(float(core_charge), 2) if core_charge is not None else None,
        "engine_remaining_value": round(float(engine_remaining_value), 2) if engine_remaining_value is not None else None,
        "engine_overrun_liability": round(float(engine_overrun_liability), 2) if engine_overrun_liability is not None else None,
        "engine_reserve_per_hour": round(float(engine_reserve_per_hour), 2) if engine_reserve_per_hour is not None else None,
        "score_contribution": round(float(score_contribution), 1),
        "explanation": explanation,
        "match_type": (pricing or {}).get("match_type"),
        "data_quality": data_quality,
    }


def _deal_price(listing: dict):
    return _safe_float(listing.get("price_asking")) or _safe_float(listing.get("asking_price"))


def _deal_smoh(listing: dict):
    return _safe_float(listing.get("engine_time_since_overhaul")) or _safe_float(listing.get("time_since_overhaul"))


def _deal_year(listing: dict) -> int | None:
    value = listing.get("year")
    try:
        if value is None:
            return None
        year = int(float(value))
        return year if year > 0 else None
    except (TypeError, ValueError):
        return None


def _derive_model_family(model_raw: str | None) -> str:
    model = str(model_raw or "").strip().upper()
    if not model:
        return ""
    first_token = model.split()[0]
    digits_match = re.search(r"\d{2,4}", first_token)
    if digits_match:
        return digits_match.group(0)
    alnum_root = re.match(r"^[A-Z]{1,3}\d{2,4}", first_token)
    if alnum_root:
        return alnum_root.group(0)
    return re.sub(r"[^A-Z0-9]", "", first_token)


def _median(values: list[float]) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return float(ordered[mid])
    return float((ordered[mid - 1] + ordered[mid]) / 2.0)


def _percentile(values: list[float], q: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    index = q * (len(ordered) - 1)
    lower = int(index)
    upper = min(len(ordered) - 1, lower + 1)
    if lower == upper:
        return float(ordered[lower])
    weight = index - lower
    return float(ordered[lower] + (ordered[upper] - ordered[lower]) * weight)


def _pick_effective_price(row: dict) -> float | None:
    price = _safe_float(row.get("asking_price"))
    if price is None:
        price = _safe_float(row.get("price_asking"))
    if price is None or price <= 0:
        return None
    deferred = _safe_float(row.get("deferred_total")) or 0.0
    if deferred < 0:
        deferred = 0.0
    return float(price + deferred)


def _build_normalized_comp_rows(raw_rows: list[dict]) -> list[dict]:
    normalized: list[dict] = []
    for row in raw_rows:
        price = _pick_effective_price(row)
        if price is None:
            continue
        year = _deal_year(row)
        smoh = _deal_smoh(row)
        avionics = _safe_float(row.get("avionics_score"))
        normalized.append(
            {
                "effective_price": price,
                "year": year,
                "smoh": smoh,
                "avionics_score": avionics,
            }
        )
    return normalized


def _query_comp_pool_exact(make_name: str, model_name: str) -> list[dict]:
    key = (make_name.lower(), model_name.lower())
    if key in _exact_comp_pool_cache:
        return _exact_comp_pool_cache[key]

    client = _get_market_comps_client()
    if client is None:
        _exact_comp_pool_cache[key] = []
        return []

    try:
        response = (
            client.table("aircraft_listings")
            .select("asking_price,price_asking,deferred_total,year,time_since_overhaul,engine_time_since_overhaul,avionics_score")
            .eq("make", make_name)
            .eq("model", model_name)
            .eq("is_active", True)
            .limit(2000)
            .execute()
        )
        rows = response.data or []
    except Exception:
        rows = []
    normalized = _build_normalized_comp_rows(rows)
    _exact_comp_pool_cache[key] = normalized
    return normalized


def _query_comp_pool_family(make_name: str, model_family: str) -> list[dict]:
    key = (make_name.lower(), model_family.lower())
    if key in _family_comp_pool_cache:
        return _family_comp_pool_cache[key]

    client = _get_market_comps_client()
    if client is None:
        _family_comp_pool_cache[key] = []
        return []

    if not model_family:
        _family_comp_pool_cache[key] = []
        return []

    try:
        response = (
            client.table("aircraft_listings")
            .select("asking_price,price_asking,deferred_total,year,time_since_overhaul,engine_time_since_overhaul,avionics_score")
            .eq("make", make_name)
            .ilike("model", f"{model_family}%")
            .eq("is_active", True)
            .limit(3000)
            .execute()
        )
        rows = response.data or []
    except Exception:
        rows = []
    normalized = _build_normalized_comp_rows(rows)
    _family_comp_pool_cache[key] = normalized
    return normalized


def _query_comp_pool_make(make_name: str) -> list[dict]:
    key = make_name.lower()
    if key in _make_comp_pool_cache:
        return _make_comp_pool_cache[key]

    client = _get_market_comps_client()
    if client is None:
        _make_comp_pool_cache[key] = []
        return []

    try:
        response = (
            client.table("aircraft_listings")
            .select("asking_price,price_asking,deferred_total,year,time_since_overhaul,engine_time_since_overhaul,avionics_score")
            .eq("make", make_name)
            .eq("is_active", True)
            .limit(4000)
            .execute()
        )
        rows = response.data or []
    except Exception:
        rows = []
    normalized = _build_normalized_comp_rows(rows)
    _make_comp_pool_cache[key] = normalized
    return normalized


def _robust_comp_stats(rows: list[dict], *, target_year: int | None = None) -> dict | None:
    filtered = rows
    if target_year is not None:
        year_filtered = [row for row in rows if isinstance(row.get("year"), int) and abs(int(row["year"]) - target_year) <= 10]
        if len(year_filtered) >= 5:
            filtered = year_filtered
    prices = [float(row["effective_price"]) for row in filtered if _safe_float(row.get("effective_price")) is not None]
    if len(prices) < 5:
        return None
    median_price = _median(prices)
    if median_price is None:
        return None
    absolute_deviations = [abs(price - median_price) for price in prices]
    mad = _median(absolute_deviations)
    if mad and mad > 0:
        robust_sigma = 1.4826 * mad
        inlier_prices = [price for price in prices if abs(price - median_price) <= (3.0 * robust_sigma)]
    else:
        robust_sigma = None
        inlier_prices = prices
    if len(inlier_prices) < 5:
        inlier_prices = prices

    smoh_values = [float(row["smoh"]) for row in filtered if _safe_float(row.get("smoh")) is not None]
    glass_like = 0
    for row in filtered:
        av = _safe_float(row.get("avionics_score"))
        if av is not None and av >= 70:
            glass_like += 1

    return {
        "sample_size": len(inlier_prices),
        "median_price": round(float(_median(inlier_prices) or median_price), 2),
        "p25_price": round(float(_percentile(inlier_prices, 0.25) or inlier_prices[0]), 2),
        "p75_price": round(float(_percentile(inlier_prices, 0.75) or inlier_prices[-1]), 2),
        "median_smoh": round(float(_median(smoh_values)), 1) if smoh_values else None,
        "pct_with_glass": round(glass_like / max(len(filtered), 1), 4),
        "pricing_mad": round(float(mad), 2) if mad is not None else None,
        "pricing_robust_sigma": round(float(robust_sigma), 2) if robust_sigma is not None else None,
    }


def _get_pricing_snapshot(listing: dict) -> dict:
    make_name = str(listing.get("make") or "").strip()
    model_name = str(listing.get("model") or "").strip()
    target_year = _deal_year(listing)
    if not make_name or not model_name:
        return {
            "tier": "insufficient",
            "deal_comparison_source": "insufficient data",
            "sample_size": 0,
            "exact_count": 0,
            "family_count": 0,
            "make_count": 0,
        }

    if _live_comp_pool_disabled():
        exact_pool = []
        family_pool = []
        make_pool = []
    else:
        exact_pool = _query_comp_pool_exact(make_name, model_name)
        model_family = _derive_model_family(model_name)
        family_pool = _query_comp_pool_family(make_name, model_family) if model_family else []
        make_pool = _query_comp_pool_make(make_name)

    exact_stats = _robust_comp_stats(exact_pool, target_year=target_year)
    if exact_stats and int(exact_stats.get("sample_size") or 0) >= 5:
        return {
            **exact_stats,
            "tier": "exact_submodel_year_window",
            "deal_comparison_source": "live market comps",
            "sample_size": int(exact_stats.get("sample_size") or 0),
            "exact_count": len(exact_pool),
            "family_count": len(family_pool),
            "make_count": len(make_pool),
        }

    family_stats = _robust_comp_stats(family_pool, target_year=None)
    if family_stats and int(family_stats.get("sample_size") or 0) >= 8:
        return {
            **family_stats,
            "tier": "model_family_all_years",
            "deal_comparison_source": "live market comps",
            "sample_size": int(family_stats.get("sample_size") or 0),
            "exact_count": len(exact_pool),
            "family_count": len(family_pool),
            "make_count": len(make_pool),
        }

    make_stats = _robust_comp_stats(make_pool, target_year=None)
    if make_stats and int(make_stats.get("sample_size") or 0) >= 12:
        return {
            **make_stats,
            "tier": "make_level_fallback",
            "deal_comparison_source": "live market comps",
            "sample_size": int(make_stats.get("sample_size") or 0),
            "exact_count": len(exact_pool),
            "family_count": len(family_pool),
            "make_count": len(make_pool),
        }

    # Last resort: use precomputed market_comps row if available.
    precomputed = _get_market_comps(make_name, model_name)
    if precomputed:
        return {
            "tier": "precomputed_market_comps",
            "deal_comparison_source": "live market comps",
            "sample_size": int(precomputed.get("sample_size") or 0),
            "median_price": _safe_float(precomputed.get("median_price")),
            "p25_price": None,
            "p75_price": None,
            "median_smoh": _safe_float(precomputed.get("median_smoh")),
            "pct_with_glass": _safe_float(precomputed.get("pct_with_glass")),
            "pricing_mad": None,
            "pricing_robust_sigma": None,
            "exact_count": len(exact_pool),
            "family_count": len(family_pool),
            "make_count": len(make_pool),
        }

    return {
        "tier": "insufficient",
        "deal_comparison_source": "insufficient data",
        "sample_size": 0,
        "exact_count": len(exact_pool),
        "family_count": len(family_pool),
        "make_count": len(make_pool),
    }


def _deal_tier_from_rating(deal_rating: float | None) -> str:
    if deal_rating is None:
        return "INSUFFICIENT_DATA"
    if deal_rating >= 80:
        return "EXCEPTIONAL_DEAL"
    if deal_rating >= 65:
        return "GOOD_DEAL"
    if deal_rating >= 45:
        return "FAIR_MARKET"
    if deal_rating >= 30:
        return "ABOVE_MARKET"
    return "OVERPRICED"


def _days_on_market(listing: dict) -> int | None:
    value = listing.get("days_on_market")
    try:
        if value is None:
            return None
        days = int(float(value))
        return days if days >= 0 else None
    except (TypeError, ValueError):
        return None


def _normalize_component_model(value: str | None) -> str | None:
    if not value:
        return None
    normalized = re.sub(r"[^A-Z0-9]+", " ", str(value).upper()).strip()
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized or None


def _build_component_sales_model_candidates(component_type: str, model: str | None) -> list[str]:
    component = (component_type or "").strip().lower()
    normalized_model = _normalize_component_model(model)
    if component == "engine":
        candidates = _build_engine_lookup_candidates(model)
        normalized_candidates = [_normalize_component_model(candidate) for candidate in candidates]
        deduped: list[str] = []
        for candidate in normalized_candidates:
            if candidate and candidate not in deduped:
                deduped.append(candidate)
        return deduped
    return [normalized_model] if normalized_model else []


def _get_component_sales_median(component_type: str, model: str | None) -> dict | None:
    model_candidates = _build_component_sales_model_candidates(component_type, model)
    if not model_candidates:
        return None
    key = (component_type.strip().lower(), "|".join(model_candidates))
    if key in _component_sales_cache:
        return _component_sales_cache[key]

    client = _get_market_comps_client()
    if client is None:
        _component_sales_cache[key] = None
        return None

    best_prices: list[float] = []
    for model_candidate in model_candidates:
        try:
            response = (
                client.table("aircraft_component_sales")
                .select("model,price_sold,sold_date,confidence")
                .eq("component_type", component_type)
                .not_.is_("price_sold", "null")
                .ilike("model", f"%{model_candidate}%")
                .order("sold_date", desc=True)
                .limit(12)
                .execute()
            )
            rows = response.data or []
        except Exception:
            rows = []

        prices: list[float] = []
        for row in rows:
            price = _safe_float(row.get("price_sold"))
            if price is not None and price > 0:
                prices.append(price)
        if len(prices) > len(best_prices):
            best_prices = prices
        if len(prices) >= 3:
            break

    if not best_prices:
        _component_sales_cache[key] = None
        return None

    ordered = sorted(best_prices)
    median_price = ordered[len(ordered) // 2] if len(ordered) % 2 == 1 else (ordered[len(ordered) // 2 - 1] + ordered[len(ordered) // 2]) / 2
    result = {
        "sample_size": len(best_prices),
        "median_price": round(float(median_price), 2),
    }
    _component_sales_cache[key] = result
    return result


def _estimate_normalized_engine_value(listing: dict, engine: dict) -> dict:
    engine_model = listing.get("engine_model")
    comp = _get_component_sales_median("engine", engine_model)
    if not comp:
        return {
            "engine_model_normalized": _normalize_component_model(engine_model),
            "sold_engine_median_price": None,
            "engine_remaining_time_factor": None,
            "normalized_engine_value": None,
            "sample_size": None,
        }

    remaining_percent = _safe_float(engine.get("remaining_percent"))
    if remaining_percent is None:
        remaining_factor = 0.65
    else:
        remaining_factor = max(0.1, min(1.1, remaining_percent / 100.0))
    if engine.get("over_tbo") or engine.get("calendar_exceeded"):
        remaining_factor = min(remaining_factor, 0.2)

    normalized_value = float(comp["median_price"]) * remaining_factor
    return {
        "engine_model_normalized": _normalize_component_model(engine_model),
        "sold_engine_median_price": comp["median_price"],
        "engine_remaining_time_factor": round(remaining_factor, 3),
        "normalized_engine_value": round(normalized_value, 2),
        "sample_size": comp["sample_size"],
    }


def _flip_candidate_signal(listing: dict, deal_rating: float | None, component_gap_value: float | None) -> dict:
    price = _deal_price(listing)
    gap_threshold = 7500.0
    is_candidate = (
        isinstance(price, (int, float))
        and price < 50000
        and isinstance(deal_rating, (int, float))
        and float(deal_rating) >= 70.0
        and isinstance(component_gap_value, (int, float))
        and float(component_gap_value) >= gap_threshold
    )
    return {
        "flip_candidate_triggered": bool(is_candidate),
        "flip_candidate_threshold": gap_threshold,
    }


def _get_market_comps(make: str | None, model: str | None) -> dict | None:
    make_name = (make or "").strip()
    model_name = (model or "").strip()
    if not make_name or not model_name:
        return None

    key = (make_name.lower(), model_name.lower())
    if key in _market_comps_cache:
        return _market_comps_cache[key]

    client = _get_market_comps_client()
    if client is None:
        _market_comps_cache[key] = None
        return None

    try:
        response = (
            client.table("market_comps")
            .select("sample_size,median_price,median_smoh,pct_with_glass")
            .eq("make", make_name)
            .eq("model", model_name)
            .limit(1)
            .execute()
        )
        comps_row = (response.data or [None])[0]
        if comps_row is None:
            fallback = (
                client.table("market_comps")
                .select("sample_size,median_price,median_smoh,pct_with_glass")
                .ilike("make", make_name)
                .ilike("model", model_name)
                .limit(1)
                .execute()
            )
            comps_row = (fallback.data or [None])[0]
    except Exception:
        comps_row = None

    _market_comps_cache[key] = comps_row
    return comps_row


def _baseline_year_score(row: dict, year: int | None) -> tuple[int, int]:
    year_from = row.get("year_from")
    year_to = row.get("year_to")
    if year is None:
        bounded = int(year_from is not None and year_to is not None)
        return (bounded, 0)
    if year_from is not None and year_to is not None and year_from <= year <= year_to:
        return (2, 0)
    if year_from is not None and year < year_from:
        return (1, int(year_from - year))
    if year_to is not None and year > year_to:
        return (1, int(year - year_to))
    return (0, 10_000)


def _get_baseline_values(make: str | None, model: str | None, year: int | None) -> dict | None:
    make_name = (make or "").strip()
    model_name = (model or "").strip()
    if not make_name or not model_name:
        return None

    key = (make_name.lower(), model_name.lower(), year)
    if key in _baseline_values_cache:
        return _baseline_values_cache[key]

    client = _get_market_comps_client()
    if client is None:
        _baseline_values_cache[key] = None
        return None

    select_cols = "make,model,year_from,year_to,baseline_retail,baseline_low,baseline_high,source,last_updated"
    try:
        response = (
            client.table("baseline_aircraft_values")
            .select(select_cols)
            .eq("make", make_name)
            .eq("model", model_name)
            .execute()
        )
        rows = response.data or []
        if not rows:
            fallback = (
                client.table("baseline_aircraft_values")
                .select(select_cols)
                .ilike("make", make_name)
                .ilike("model", model_name)
                .execute()
            )
            rows = fallback.data or []
    except Exception:
        rows = []

    if not rows:
        _baseline_values_cache[key] = None
        return None

    best_row = max(rows, key=lambda row: _baseline_year_score(row, year))
    _baseline_values_cache[key] = best_row
    return best_row


def compute_deal_rating(listing: dict, comps: dict | None, deferred_total: float | None = None) -> dict:
    pricing = _get_pricing_snapshot(listing)
    sample_size = int(pricing.get("sample_size") or 0)
    using_live_comps = pricing.get("deal_comparison_source") == "live market comps" and sample_size >= 5

    baseline_values = None
    if not using_live_comps:
        baseline_values = _get_baseline_values(listing.get("make"), listing.get("model"), _deal_year(listing))

    if not using_live_comps and baseline_values is None:
        return {
            "deal_rating": None,
            "deal_tier": "INSUFFICIENT_DATA",
            "comps_sample_size": sample_size or None,
            "vs_median_price": None,
            "deal_comparison_source": "insufficient data",
            "comp_selection_tier": pricing.get("tier") or "insufficient",
            "comp_universe_size": sample_size or None,
            "comp_exact_count": int(pricing.get("exact_count") or 0) or None,
            "comp_family_count": int(pricing.get("family_count") or 0) or None,
            "comp_make_count": int(pricing.get("make_count") or 0) or None,
            "comp_median_price": None,
            "comp_p25_price": None,
            "comp_p75_price": None,
            "pricing_mad": None,
            "mispricing_zscore": None,
        }

    price_asking = _deal_price(listing)
    effective_target = None
    if price_asking is not None:
        normalized_deferred = deferred_total if isinstance(deferred_total, (int, float)) and deferred_total > 0 else 0.0
        effective_target = float(price_asking) + float(normalized_deferred)

    engine_smoh = _deal_smoh(listing)
    avionics = _safe_float(listing.get("avionics_score"))
    if using_live_comps:
        median_price = _safe_float(pricing.get("median_price"))
        median_smoh = _safe_float(pricing.get("median_smoh"))
        pct_with_glass = _safe_float(pricing.get("pct_with_glass"))
        pricing_sigma = _safe_float(pricing.get("pricing_robust_sigma"))
    else:
        median_price = _safe_float(baseline_values.get("baseline_retail"))
        median_smoh = None
        pct_with_glass = None
        pricing_sigma = None

    weighted_total = 0.0
    weight_sum = 0.0
    mispricing_zscore = None

    if effective_target and median_price:
        if pricing_sigma and pricing_sigma > 0:
            mispricing_zscore = (effective_target - median_price) / pricing_sigma
        if mispricing_zscore is not None:
            if mispricing_zscore <= -1.5:
                price_score = 100.0
            elif mispricing_zscore <= -1.0:
                price_score = 90.0
            elif mispricing_zscore <= -0.5:
                price_score = 75.0
            elif mispricing_zscore <= 0:
                price_score = 60.0
            elif mispricing_zscore <= 0.5:
                price_score = 45.0
            elif mispricing_zscore <= 1.0:
                price_score = 30.0
            else:
                price_score = 20.0
        else:
            price_pct = effective_target / median_price
            if price_pct < 0.85:
                price_score = 95.0
            elif price_pct < 0.92:
                price_score = 82.0
            elif price_pct < 1.00:
                price_score = 65.0
            elif price_pct < 1.08:
                price_score = 45.0
            else:
                price_score = 25.0
        weighted_total += price_score * 0.6
        weight_sum += 0.6

    if engine_smoh is not None and median_smoh:
        smoh_pct = engine_smoh / max(median_smoh, 1)
        if smoh_pct < 0.5:
            smoh_score = 100.0
        elif smoh_pct < 0.75:
            smoh_score = 80.0
        elif smoh_pct < 1.0:
            smoh_score = 60.0
        elif smoh_pct < 1.2:
            smoh_score = 40.0
        else:
            smoh_score = 25.0
        weighted_total += smoh_score * 0.2
        weight_sum += 0.2

    if avionics is not None and pct_with_glass is not None:
        if avionics > 80 and pct_with_glass < 0.35:
            av_score = 95.0
        elif avionics > 70:
            av_score = 75.0
        elif avionics > 55:
            av_score = 58.0
        else:
            av_score = 40.0
        weighted_total += av_score * 0.2
        weight_sum += 0.2

    deal_rating = round(weighted_total / weight_sum, 1) if weight_sum > 0 else None
    deal_tier = _deal_tier_from_rating(deal_rating)

    vs_median_price = None
    if effective_target and median_price:
        vs_median_price = round(((effective_target / median_price) - 1) * 100, 1)

    return {
        "deal_rating": deal_rating,
        "deal_tier": deal_tier,
        "comps_sample_size": sample_size or None,
        "vs_median_price": vs_median_price,
        "deal_comparison_source": pricing.get("deal_comparison_source")
        if using_live_comps
        else "estimated baseline",
        "comp_selection_tier": pricing.get("tier") if using_live_comps else "baseline_fallback",
        "comp_universe_size": sample_size or None,
        "comp_exact_count": int(pricing.get("exact_count") or 0) or None,
        "comp_family_count": int(pricing.get("family_count") or 0) or None,
        "comp_make_count": int(pricing.get("make_count") or 0) or None,
        "comp_median_price": median_price,
        "comp_p25_price": _safe_float(pricing.get("p25_price")) if using_live_comps else None,
        "comp_p75_price": _safe_float(pricing.get("p75_price")) if using_live_comps else None,
        "pricing_mad": _safe_float(pricing.get("pricing_mad")) if using_live_comps else None,
        "mispricing_zscore": round(float(mispricing_zscore), 3) if mispricing_zscore is not None else None,
    }


def _has_location_data(listing: dict) -> bool:
    location_keys = (
        "location",
        "city",
        "state",
        "location_city",
        "location_state",
        "airport_code",
        "airport_identifier",
    )
    for key in location_keys:
        value = listing.get(key)
        if isinstance(value, str) and value.strip():
            return True
    return False


def _collect_data_quality_signals(listing: dict, engine: dict, prop: dict) -> dict:
    engine_time_known = bool(engine.get("engine_time_known"))
    engine_tbo_known = bool(engine.get("tbo_known"))
    prop_data_known = prop.get("hours_remaining") is not None or listing.get("time_since_prop_overhaul") is not None
    location_known = _has_location_data(listing)
    annual_known = bool(listing.get("last_annual_date"))
    elt_known = bool(listing.get("elt_expiry_date"))

    missing_fields: list[str] = []
    if not engine_time_known:
        missing_fields.append("engine_time_since_overhaul")
    if not engine_tbo_known:
        missing_fields.append("engine_tbo_hours")
    if not prop_data_known:
        missing_fields.append("prop_time_since_overhaul")
    if not location_known:
        missing_fields.append("location")
    if not annual_known:
        missing_fields.append("last_annual_date")
    if not elt_known:
        missing_fields.append("elt_expiry_date")

    return {
        "engine_time_known": engine_time_known,
        "engine_tbo_known": engine_tbo_known,
        "prop_data_known": prop_data_known,
        "location_known": location_known,
        "annual_known": annual_known,
        "elt_known": elt_known,
        "missing_fields": missing_fields,
    }


def _confidence_from_signals(signals: dict) -> tuple[int, str, float]:
    confidence_score = 0
    confidence_score += 35 if signals.get("engine_time_known") else 0
    confidence_score += 25 if signals.get("engine_tbo_known") else 0
    confidence_score += 20 if signals.get("prop_data_known") else 0
    confidence_score += 10 if signals.get("location_known") else 0
    confidence_score += 5 if signals.get("annual_known") else 0
    confidence_score += 5 if signals.get("elt_known") else 0

    if confidence_score >= 85:
        return confidence_score, "HIGH", 1.0
    if confidence_score >= 60:
        return confidence_score, "MEDIUM", 0.94
    return confidence_score, "LOW", 0.86


def _score_band(score: float, confidence: str, missing_count: int) -> tuple[float, float]:
    if confidence == "HIGH":
        width = 4.0
    elif confidence == "MEDIUM":
        width = 8.0
    else:
        width = 12.0
    width += min(4.0, missing_count * 0.75)
    return round(max(0.0, score - width), 1), round(min(100.0, score + width), 1)


def _derive_pricing_confidence(deal: dict) -> tuple[str, float]:
    source = str(deal.get("deal_comparison_source") or "").lower()
    sample_size = int(deal.get("comps_sample_size") or 0)
    if "live market comps" in source and sample_size >= 15:
        return "HIGH", 1.0
    if "live market comps" in source and sample_size >= 5:
        return "MEDIUM", 0.97
    if "estimated baseline" in source:
        return "LOW", 0.94
    return "LOW", 0.92


def _build_market_opportunity_score(
    listing: dict,
    deal: dict,
    deferred_total: float,
    component_gap_value: float | None,
) -> float:
    base = _safe_float(deal.get("deal_rating"))
    score = base if base is not None else 45.0
    vs_median = _safe_float(deal.get("vs_median_price"))
    if vs_median is not None:
        if vs_median <= -20:
            score += 14
        elif vs_median <= -10:
            score += 8
        elif vs_median >= 15:
            score -= 15
        elif vs_median >= 8:
            score -= 8

    asking_price = _deal_price(listing)
    if asking_price and asking_price > 0 and deferred_total > 0:
        deferred_burden = deferred_total / asking_price
        score -= min(14.0, deferred_burden * 30.0)

    if component_gap_value is not None:
        score += max(-10.0, min(12.0, component_gap_value / 1200.0))

    return round(max(0.0, min(100.0, score)), 1)


def _build_execution_score(
    listing: dict,
    data_confidence: str,
    pricing_confidence: str,
) -> float:
    score = 50.0
    days_on_market = _days_on_market(listing)
    if days_on_market is not None:
        if days_on_market >= 180:
            score += 18
        elif days_on_market >= 90:
            score += 12
        elif days_on_market >= 45:
            score += 6
        elif days_on_market < 10:
            score -= 5

    if listing.get("price_reduced") is True:
        score += 12

    if data_confidence == "HIGH":
        score += 10
    elif data_confidence == "MEDIUM":
        score += 5
    else:
        score -= 4

    if pricing_confidence == "HIGH":
        score += 8
    elif pricing_confidence == "MEDIUM":
        score += 4
    else:
        score -= 3

    return round(max(0.0, min(100.0, score)), 1)


def _coerce_listing_year(listing: dict) -> int | None:
    year_value = listing.get("year")
    try:
        if year_value is None:
            return None
        parsed_year = int(float(year_value))
    except (TypeError, ValueError):
        return None
    current_year = datetime.now().year + 1
    if parsed_year < 1940 or parsed_year > current_year:
        return None
    return parsed_year


def _age_adjusted_imputed_default(component: str, listing: dict) -> float:
    """
    Neutral default that varies by aircraft age/type to avoid sparse-data clusters.
    """
    base_defaults = {
        "engine": 50.0,
        "prop": 52.0,
        "llp": 55.0,
        "quality": 53.0,
        "avionics": 50.0,
    }
    age_weight = {
        "engine": 1.00,
        "prop": 0.80,
        "llp": 0.70,
        "quality": 0.90,
        "avionics": 1.15,
    }
    year = _coerce_listing_year(listing)
    if year is None:
        age_adjustment = -1.0
    else:
        age_ratio = max(0.0, min(1.0, (year - 1960) / 70.0))
        age_adjustment = (age_ratio - 0.5) * 12.0  # roughly -6 to +6
    aircraft_type = str(listing.get("aircraft_type") or "").upper()
    type_adjustment = 0.0
    if "JET" in aircraft_type:
        type_adjustment = 1.0
    elif "HELI" in aircraft_type or "ROTOR" in aircraft_type:
        type_adjustment = -1.0
    score = (
        base_defaults.get(component, 50.0)
        + age_adjustment * age_weight.get(component, 1.0)
        + type_adjustment
    )
    return max(28.0, min(72.0, round(score, 1)))


def _apply_percentile_normalization(
    raw_score: float,
    data_confidence: str,
    *,
    components_measured: int = 0,
    days_on_market: int | None = None,
    listing_year: int | None = None,
) -> float:
    """
    Population-shape normalization without DB reads.
    Uses confidence + measured-component depth + age/market tie-breakers.
    """
    score = max(0.0, min(100.0, float(raw_score)))
    confidence = str(data_confidence or "LOW").upper()
    measured_bonus = (max(0, min(5, components_measured)) - 2.5) * 1.4
    year_nudge = 0.0
    if listing_year is not None:
        year_nudge = max(-2.0, min(2.0, (listing_year - 1990) / 20.0))
    market_nudge = 0.0
    if days_on_market is not None:
        market_nudge = -2.0 if days_on_market > 180 else (-1.0 if days_on_market > 90 else 0.6)

    if confidence == "HIGH":
        normalized = 50.0 + (score - 50.0) * 1.22 + measured_bonus + year_nudge + market_nudge
        return max(0.0, min(100.0, normalized))
    if confidence == "MEDIUM":
        normalized = 50.0 + (score - 50.0) * 1.05 + measured_bonus * 0.8 + year_nudge * 0.7 + market_nudge
        return max(12.0, min(95.0, normalized))

    # Low-confidence scores remain bounded but spread; avoid narrow midpoint pile-up.
    normalized = 47.0 + (score - 50.0) * 0.48 + measured_bonus * 0.65 + year_nudge + market_nudge
    return max(30.0, min(65.0, normalized))


def _comp_sample_adjustment(sample_size: int) -> float:
    for threshold, bonus in HYBRID_SCORING_PROFILE["comp_sample_bonus"]:
        if sample_size >= threshold:
            return float(bonus)
    return -1.5


def _hybrid_value_score(
    *,
    condition_score: float,
    market_opportunity_score: float,
    execution_score: float,
    engine_score: float,
    prop_score: float,
    llp_score: float,
    avionics_score_value: float,
    deal: dict,
    avionics: dict,
    component_gap_value: float | None,
    signals: dict,
    data_confidence: str,
) -> float:
    profile = HYBRID_SCORING_PROFILE
    base_score = (
        condition_score * profile["condition_weight"]
        + market_opportunity_score * profile["market_weight"]
        + execution_score * profile["execution_weight"]
    )

    comps_sample_size = int(deal.get("comps_sample_size") or 0)
    comps_adjustment = _comp_sample_adjustment(comps_sample_size)
    deal_tier = str(deal.get("deal_tier") or "INSUFFICIENT_DATA")
    deal_tier_adjustment = float(profile["deal_tier_adjustments"].get(deal_tier, 0.0))

    mispricing_zscore = _safe_float(deal.get("mispricing_zscore"))
    mispricing_adjustment = 0.0
    if mispricing_zscore is not None:
        mispricing_adjustment = max(-5.0, min(5.0, -mispricing_zscore * 3.5))

    avionics_source_primary = str(avionics.get("market_value_source_primary") or "none").lower()
    avionics_source_adjustment = float(
        profile["avionics_source_adjustments"].get(avionics_source_primary, -1.0)
    )

    gap_adjustment = 0.0
    if component_gap_value is not None:
        gap_adjustment = max(-3.0, min(4.0, component_gap_value / 4000.0))

    missing_count = len(signals.get("missing_fields", []))
    sparse_penalty = min(6.0, missing_count * 0.5)

    distress_penalty = max(0.0, (50.0 - condition_score) * 0.12)
    quality_uplift = 0.0
    if (
        condition_score >= 80.0
        and llp_score >= 95.0
        and engine_score >= 75.0
        and prop_score >= 70.0
        and missing_count <= 2
    ):
        quality_uplift = 11.0

    confidence_multiplier = float(
        profile["confidence_multiplier"].get(data_confidence, profile["confidence_multiplier"]["LOW"])
    )

    calibrated_score = (
        base_score
        + comps_adjustment
        + deal_tier_adjustment
        + mispricing_adjustment
        + avionics_source_adjustment
        + gap_adjustment
        + quality_uplift
        - sparse_penalty
        - distress_penalty
    )
    calibrated_score *= confidence_multiplier

    # Tiered low-data anchor reduces score pile-ups on sparse records.
    if missing_count >= 4:
        subsystem_anchor = (
            engine_score * 0.32
            + prop_score * 0.18
            + llp_score * 0.24
            + condition_score * 0.16
            + avionics_score_value * 0.10
        )
        calibrated_score = calibrated_score * 0.70 + subsystem_anchor * 0.30
        low, high = profile["low_data_band"].get(data_confidence, profile["low_data_band"]["LOW"])
        calibrated_score = max(low, min(high, calibrated_score))

    return max(0.0, min(100.0, calibrated_score))


def _build_score_explanation(
    engine: dict,
    prop: dict,
    llp: dict,
    deferred: dict,
    avionics: dict,
    confidence: str,
    condition_score: float,
    final_score: float,
) -> list[str]:
    drivers: list[tuple[float, str]] = []
    detected_stcs = avionics.get("detected_stcs") or []

    if not engine.get("engine_time_known"):
        drivers.append((40.0, "Engine time since overhaul unknown; engine scored neutrally"))
    elif not engine.get("tbo_known"):
        drivers.append((30.0, "Engine TBO reference unavailable; uncertainty penalty applied"))
    elif engine.get("remaining_percent") is not None:
        remaining = engine.get("remaining_percent")
        drivers.append((25.0, f"Engine at {remaining:.0f}% of TBO life remaining"))

    if prop.get("hours_remaining") is not None:
        drivers.append((18.0, f"Prop overhaul due in {int(prop['hours_remaining'])} hours"))
    elif prop.get("score", 50) >= 70:
        drivers.append((12.0, "Propeller data supports a favorable lifecycle score"))

    if llp.get("any_unairworthy"):
        drivers.append((28.0, "Life-limited parts include unairworthy findings"))
    elif llp.get("score", 0) >= 90:
        drivers.append((16.0, "No major life-limited parts issues identified"))

    if deferred.get("total", 0) == 0:
        drivers.append((14.0, "No deferred maintenance identified"))
    else:
        drivers.append((20.0, f"Deferred maintenance estimated at ${int(deferred['total']):,}"))

    if avionics.get("installed_value", 0) > 0:
        drivers.append((17.0, f"Installed avionics value estimated at ${int(avionics['installed_value']):,}"))
    elif avionics.get("is_steam_gauge"):
        drivers.append((19.0, "Panel appears to be steam-gauge/legacy avionics"))
    if avionics.get("stc_market_value_premium_total", 0) > 0:
        drivers.append(
            (
                21.0,
                f"Detected STC market premium totals ${int(avionics['stc_market_value_premium_total']):,}",
            )
        )

    if confidence != "HIGH" and final_score < condition_score:
        drivers.append((36.0, f"Confidence adjustment reduced score from {condition_score:.1f} to {final_score:.1f}"))

    stc_lines = [
        f"{stc['stc_name']} detected (+${int(stc.get('market_value_premium') or 0):,} market premium)"
        for stc in detected_stcs
    ]
    top_non_stc = [text for _, text in sorted(drivers, key=lambda item: item[0], reverse=True)]
    return (stc_lines + top_non_stc)[:5]


def _build_risk_reasons(engine: dict, prop: dict, llp: dict, deferred: dict, confidence: str) -> list[str]:
    reasons: list[tuple[float, str]] = []
    if llp.get("any_unairworthy"):
        reasons.append((40.0, "Life-limited parts include unairworthy findings"))
    if engine.get("over_tbo") or engine.get("calendar_exceeded"):
        reasons.append((35.0, "Engine overhaul window is exceeded or due"))
    if prop.get("over_tbo") or prop.get("calendar_overdue"):
        reasons.append((28.0, "Propeller overhaul window is exceeded or due"))
    if deferred.get("total", 0) >= 30000:
        reasons.append((26.0, f"Deferred maintenance burden is high (${int(deferred['total']):,})"))
    if confidence == "LOW":
        reasons.append((24.0, "Low data confidence increases ownership uncertainty"))
    if not reasons:
        reasons.append((10.0, "No major immediate airworthiness risk flags found"))
    return [text for _, text in sorted(reasons, key=lambda item: item[0], reverse=True)[:3]]


def _build_improvement_actions(signals: dict) -> list[str]:
    actions = []
    if not signals.get("engine_time_known"):
        actions.append("Add engine SMOH/SNEW logbook entry to improve condition confidence")
    if not signals.get("engine_tbo_known"):
        actions.append("Add exact engine model or OEM TBO reference to resolve engine lifecycle")
    if not signals.get("prop_data_known"):
        actions.append("Add propeller overhaul hours/date to improve deferred-cost precision")
    if not signals.get("location_known"):
        actions.append("Add listing location (city/state or airport code) for better market context")
    if not signals.get("annual_known"):
        actions.append("Add last annual inspection date to reduce compliance uncertainty")
    if not signals.get("elt_known"):
        actions.append("Add ELT battery expiry date to improve airworthiness completeness")
    return actions[:3]


def _accident_history_adjustment(listing: dict) -> dict:
    has_history = listing.get("has_accident_history")
    count = listing.get("accident_count")
    most_severe_damage = str(listing.get("most_severe_damage") or "").strip().upper()

    try:
        count_int = int(float(count)) if count is not None else None
    except (TypeError, ValueError):
        count_int = None

    if count_int is not None and count_int <= 0:
        count_int = 0

    no_history = has_history is False or count_int == 0
    if no_history:
        return {
            "penalty": 0.0,
            "explanation": None,
            "score_cap": None,
            "risk_override": None,
            "no_history_note": True,
        }

    if most_severe_damage == "DESTROYED":
        return {
            "penalty": 0.0,
            "explanation": "Prior accident history includes a destroyed aircraft event",
            "score_cap": 20.0,
            "risk_override": "CRITICAL",
            "no_history_note": False,
        }

    if most_severe_damage == "SUBSTANTIAL":
        return {
            "penalty": 15.0,
            "explanation": "Prior substantial damage",
            "score_cap": None,
            "risk_override": "CRITICAL",
            "no_history_note": False,
        }

    if count_int is not None and 1 <= count_int <= 2:
        return {
            "penalty": 5.0,
            "explanation": "1-2 minor incidents on record",
            "score_cap": None,
            "risk_override": None,
            "no_history_note": False,
        }

    if most_severe_damage == "MINOR":
        return {
            "penalty": 5.0,
            "explanation": "Prior minor damage history",
            "score_cap": None,
            "risk_override": None,
            "no_history_note": False,
        }

    return {
        "penalty": 0.0,
        "explanation": None,
        "score_cap": None,
        "risk_override": None,
        "no_history_note": False,
    }


def aircraft_intelligence_score(listing: dict) -> dict:
    """
    Layer 2: Full-Hangar Value Score (0–100).
    Engine life, prop life, LLP status, deferred cost impact.
    deferred_maintenance now includes structured breakdown.
    """
    engine = engine_life_remaining(listing)
    prop = prop_life_remaining(listing)
    llp = llp_status(listing)
    deferred = calculate_deferred_cost(listing)
    avionics = avionics_score(listing)
    pricing_enabled = str(os.environ.get("FULL_HANGAR_ENABLE_ENGINE_VALUE_SCORING", "")).strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    engine_pricing = None
    if pricing_enabled:
        pricing_client = _get_market_comps_client()
        primary_model = _first_plausible_engine_lookup_candidate(listing.get("engine_model"))
        faa_model = _first_plausible_engine_lookup_candidate(listing.get("faa_engine_model"))
        pricing_candidates = []
        for candidate in (primary_model, faa_model):
            if candidate and candidate not in pricing_candidates:
                pricing_candidates.append(candidate)

        for candidate in pricing_candidates:
            engine_pricing = lookup_engine_overhaul_pricing(candidate, pricing_client)
            if engine_pricing:
                break

        if not engine_pricing:
            for candidate in pricing_candidates:
                engine_pricing = _estimate_engine_overhaul_pricing_from_family(candidate, pricing_client)
                if engine_pricing:
                    break
    engine_value_result = score_engine_value(listing, engine, engine_pricing)

    total_deferred = deferred["total"]
    if total_deferred == 0:
        deferred_impact_score = 100.0
    else:
        deferred_impact_score = max(0, 100 - (total_deferred / 500))

    engine_measured = bool(engine.get("engine_time_known")) and bool(engine.get("tbo_known"))
    prop_measured = listing.get("time_since_prop_overhaul") is not None or prop.get("hours_remaining") is not None
    llp_measured = bool(llp.get("items")) or bool(listing.get("last_annual_date")) or bool(listing.get("elt_expiry_date"))
    avionics_measured = bool(avionics.get("matched_items")) or _safe_float(avionics.get("installed_value")) is not None
    quality_measured = bool(llp.get("items")) or deferred.get("total", 0) > 0

    engine_component_score = float(engine.get("score") if engine_measured else _age_adjusted_imputed_default("engine", listing))
    prop_component_score = float(prop.get("score") if prop_measured else _age_adjusted_imputed_default("prop", listing))
    llp_component_score = float(llp.get("score") if llp_measured else _age_adjusted_imputed_default("llp", listing))
    quality_component_score = float(
        min(100, deferred_impact_score) if quality_measured else _age_adjusted_imputed_default("quality", listing)
    )
    avionics_component_score = float(
        avionics.get("score") if avionics_measured else _age_adjusted_imputed_default("avionics", listing)
    )

    components_measured = sum(
        1 for measured in (engine_measured, prop_measured, llp_measured, quality_measured, avionics_measured) if measured
    )

    condition_score = (
        INTELLIGENCE_WEIGHTS["engine"] * engine_component_score
        + INTELLIGENCE_WEIGHTS["prop"] * prop_component_score
        + INTELLIGENCE_WEIGHTS["llp"] * llp_component_score
        + INTELLIGENCE_WEIGHTS["quality"] * quality_component_score
        + INTELLIGENCE_WEIGHTS["avionics"] * avionics_component_score
    )
    condition_score = max(0, min(100, condition_score))

    signals = _collect_data_quality_signals(listing, engine, prop)
    confidence_score, data_confidence, confidence_multiplier = _confidence_from_signals(signals)
    accident_adjustment = _accident_history_adjustment(listing)
    accident_penalty = float(accident_adjustment.get("penalty") or 0.0)
    accident_explanation = accident_adjustment.get("explanation")
    accident_score_cap = accident_adjustment.get("score_cap")
    accident_risk_override = accident_adjustment.get("risk_override")
    no_history_note = bool(accident_adjustment.get("no_history_note"))
    market_comps = _get_market_comps(listing.get("make"), listing.get("model"))
    deal = compute_deal_rating(listing, market_comps, deferred_total=float(total_deferred))
    deal_rating = deal.get("deal_rating")
    deal_tier = deal.get("deal_tier")
    engine_component = _estimate_normalized_engine_value(listing, engine)
    normalized_engine_value = _safe_float(engine_component.get("normalized_engine_value"))
    avionics_bundle_adjusted = _safe_float(avionics.get("bundle_adjusted_value")) or _safe_float(avionics.get("installed_value")) or 0.0
    estimated_component_value = None
    if normalized_engine_value is not None:
        estimated_component_value = round(normalized_engine_value + avionics_bundle_adjusted, 2)

    asking_price = _deal_price(listing)
    component_gap_value = None
    if estimated_component_value is not None and asking_price is not None:
        component_gap_value = round(estimated_component_value - asking_price, 2)

    flip_signal = _flip_candidate_signal(listing, deal_rating, component_gap_value)
    market_opportunity_score = _build_market_opportunity_score(
        listing,
        deal,
        float(total_deferred),
        component_gap_value,
    )
    pricing_confidence, pricing_confidence_multiplier = _derive_pricing_confidence(deal)
    execution_score = _build_execution_score(listing, data_confidence, pricing_confidence)
    investment_score = round(
        max(
            0.0,
            min(
                100.0,
                (
                    market_opportunity_score * 0.45
                    + condition_score * 0.35
                    + execution_score * 0.20
                )
                * pricing_confidence_multiplier,
            ),
        ),
        1,
    )
    raw_value_score = _hybrid_value_score(
        condition_score=float(condition_score),
        market_opportunity_score=float(market_opportunity_score),
        execution_score=float(execution_score),
        engine_score=engine_component_score,
        prop_score=prop_component_score,
        llp_score=llp_component_score,
        avionics_score_value=avionics_component_score,
        deal=deal,
        avionics=avionics,
        component_gap_value=component_gap_value,
        signals=signals,
        data_confidence=data_confidence,
    )
    days_on_market = _days_on_market(listing)
    value_score = _apply_percentile_normalization(
        raw_value_score,
        data_confidence,
        components_measured=components_measured,
        days_on_market=days_on_market,
        listing_year=_coerce_listing_year(listing),
    )
    if accident_penalty:
        value_score = max(0.0, value_score - accident_penalty)
    if isinstance(accident_score_cap, (int, float)):
        value_score = min(value_score, float(accident_score_cap))
    faa_registration_alert = listing.get("faa_registration_alert")
    faa_alert_text = str(faa_registration_alert or "").upper()
    severe_ntsb = str(listing.get("most_severe_damage") or "").strip().upper() in {"SUBSTANTIAL", "DESTROYED"}
    hard_safety_override = (
        llp.get("any_unairworthy", False)
        or severe_ntsb
        or any(token in faa_alert_text for token in ("DEREGISTERED", "REVOKED", "EXPIRED"))
    )
    if hard_safety_override:
        value_score = min(value_score, 25.0)
    data_gaps = len(signals["missing_fields"]) > 0
    score_band_low, score_band_high = _score_band(value_score, data_confidence, len(signals["missing_fields"]))
    rank_score = max(0.0, min(100.0, condition_score * (0.7 + 0.3 * (confidence_score / 100))))

    score_explanation = _build_score_explanation(
        engine,
        prop,
        llp,
        deferred,
        avionics,
        data_confidence,
        condition_score,
        value_score,
    )
    if accident_explanation:
        score_explanation = [accident_explanation, *score_explanation]
    if no_history_note:
        score_explanation = [*score_explanation, "✓ No NTSB accident history on record"]
    risk_reasons = _build_risk_reasons(engine, prop, llp, deferred, data_confidence)
    improvement_actions = _build_improvement_actions(signals)

    risk = risk_level_from_score(
        value_score,
        llp.get("any_unairworthy", False),
        faa_alert=faa_registration_alert,
        severe_ntsb=severe_ntsb,
    )
    if isinstance(accident_risk_override, str) and accident_risk_override:
        risk = accident_risk_override
    if days_on_market is not None:
        if days_on_market > 180:
            score_explanation.append("Listed 180+ days — stale listing tie-breaker applied (-2)")
        elif days_on_market > 90:
            score_explanation.append("Listed 90+ days — stale listing tie-breaker applied (-1)")
        elif days_on_market < 7:
            score_explanation.append("New listing")

    if listing.get("price_reduced") is True:
        score_explanation.append("Price reduced recently — high-priority deal candidate")
    if isinstance(component_gap_value, (int, float)):
        if component_gap_value > 0:
            score_explanation.append(f"Component value gap +${int(component_gap_value):,} vs asking")
        else:
            score_explanation.append(f"Component value gap ${int(component_gap_value):,} vs asking")
    if flip_signal.get("flip_candidate_triggered"):
        score_explanation.append("Flip trigger hit: sub-$50k + high deal rating + positive component gap")

    return {
        "value_score": round(value_score, 1),
        "condition_score": round(condition_score, 1),
        "confidence_score": confidence_score,
        "rank_score": round(rank_score, 1),
        "intelligence_version": INTELLIGENCE_VERSION,
        "data_confidence": data_confidence,
        "data_gaps": data_gaps,
        "data_gap_fields": signals["missing_fields"],
        "score_range": {
            "low": score_band_low,
            "high": score_band_high,
        },
        "score_explanation": score_explanation,
        "risk_reasons": risk_reasons,
        "improvement_actions": improvement_actions,
        "engine": engine,
        "prop": prop,
        "llp": llp,
        "avionics": avionics,
        "stc_modifications": avionics.get("detected_stcs", []),
        "stc_market_value_premium_total": avionics.get("stc_market_value_premium_total", 0),
        "deferred_maintenance": {
            "breakdown": deferred["breakdown"],
            "total": deferred["total"],
            "true_cost": deferred["true_cost"],
            "asking_price": deferred["asking_price"],
            "deferred_items": deferred["deferred_items"],
        },
        "risk_level": risk,
        "market_opportunity_score": market_opportunity_score,
        "execution_score": execution_score,
        "investment_score": investment_score,
        "pricing_confidence": pricing_confidence,
        "_components_measured": components_measured,
        "deal_rating": deal_rating,
        "deal_tier": deal_tier,
        "comps_sample_size": deal["comps_sample_size"],
        "vs_median_price": deal["vs_median_price"],
        "deal_comparison_source": deal["deal_comparison_source"],
        "comp_selection_tier": deal.get("comp_selection_tier"),
        "comp_universe_size": deal.get("comp_universe_size"),
        "comp_exact_count": deal.get("comp_exact_count"),
        "comp_family_count": deal.get("comp_family_count"),
        "comp_make_count": deal.get("comp_make_count"),
        "comp_median_price": deal.get("comp_median_price"),
        "comp_p25_price": deal.get("comp_p25_price"),
        "comp_p75_price": deal.get("comp_p75_price"),
        "pricing_mad": deal.get("pricing_mad"),
        "mispricing_zscore": deal.get("mispricing_zscore"),
        "engine_component_comp_sample_size": engine_component.get("sample_size"),
        "sold_engine_median_price": engine_component.get("sold_engine_median_price"),
        "engine_model_normalized": engine_component.get("engine_model_normalized"),
        "engine_remaining_time_factor": engine_component.get("engine_remaining_time_factor"),
        "normalized_engine_value": engine_component.get("normalized_engine_value"),
        "avionics_bundle_multiplier": avionics.get("bundle_multiplier"),
        "avionics_bundle_profile": avionics.get("bundle_profile"),
        "avionics_bundle_adjusted_value": avionics.get("bundle_adjusted_value"),
        "avionics_value_source_breakdown": avionics.get("market_value_source_breakdown"),
        "avionics_value_source_primary": avionics.get("market_value_source_primary"),
        "avionics_market_sample_total": avionics.get("market_sample_total"),
        "estimated_component_value": estimated_component_value,
        "component_gap_value": component_gap_value,
        "flip_candidate_triggered": flip_signal.get("flip_candidate_triggered"),
        "flip_candidate_threshold": flip_signal.get("flip_candidate_threshold"),
        "engine_value": engine_value_result,
        "engine_hours_smoh": engine_value_result.get("engine_hours_smoh"),
        "engine_remaining_value": engine_value_result.get("engine_remaining_value"),
        "engine_overrun_liability": engine_value_result.get("engine_overrun_liability"),
        "engine_reserve_per_hour": engine_value_result.get("engine_reserve_per_hour"),
    }
