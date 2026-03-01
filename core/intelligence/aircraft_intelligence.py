"""
Layer 2: Aircraft Intelligence Score (Full-Hangar Value Score)
Deterministic aviation logic: engine/prop life, LLP, deferred cost.
Uses reference_service for TBO/LLP (Supabase-backed with fallback).
"""

from __future__ import annotations

from datetime import date, datetime

from .model_normalizer import extract_engine_canonical_from_listing, extract_prop_canonical_from_listing
from .reference_service import get_engine_reference, get_prop_reference, get_llp_rules

INTELLIGENCE_VERSION = "1.1.0"


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

    engine_canonical = extract_engine_canonical_from_listing(listing)
    ref = get_engine_reference(engine_canonical, listing.get("aircraft_type"))
    tbo_hours = ref["tbo_hours"]
    calendar_years = ref.get("calendar_years")
    current_year = datetime.now().year
    manufacture_year = year or current_year
    age_years = current_year - manufacture_year

    hours_remaining = None
    remaining_percent = None
    over_tbo = False
    calendar_exceeded = False
    score = 50.0

    if snew is not None:
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
def risk_level_from_score(value_score: float, llp_any_unairworthy: bool, faa_alert: str | None = None) -> str:
    faa_alert_text = str(faa_alert).upper() if faa_alert else ""
    if "DEREGISTERED" in faa_alert_text:
        return "CRITICAL"
    if "REVOKED" in faa_alert_text:
        return "CRITICAL"
    if "EXPIRED" in faa_alert_text:
        return "HIGH"
    if llp_any_unairworthy:
        return "CRITICAL" if value_score < 40 else "HIGH"
    if value_score >= 75:
        return "LOW"
    if value_score >= 50:
        return "MODERATE"
    if value_score >= 25:
        return "HIGH"
    return "CRITICAL"


# ─── Aircraft Intelligence Score (Value Score 0–100) ────────────────────────
INTELLIGENCE_WEIGHTS = {
    "engine": 0.35,
    "prop": 0.20,
    "llp": 0.30,
    "deferred_impact": 0.15,
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

    total_deferred = deferred["total"]
    if total_deferred == 0:
        deferred_impact_score = 100.0
    else:
        deferred_impact_score = max(0, 100 - (total_deferred / 500))

    value_score = (
        INTELLIGENCE_WEIGHTS["engine"] * engine["score"]
        + INTELLIGENCE_WEIGHTS["prop"] * prop["score"]
        + INTELLIGENCE_WEIGHTS["llp"] * llp["score"]
        + INTELLIGENCE_WEIGHTS["deferred_impact"] * min(100, deferred_impact_score)
    )
    value_score = max(0, min(100, value_score))

    faa_registration_alert = listing.get("faa_registration_alert")
    risk = risk_level_from_score(
        value_score,
        llp.get("any_unairworthy", False),
        faa_alert=faa_registration_alert,
    )

    return {
        "value_score": round(value_score, 1),
        "intelligence_version": INTELLIGENCE_VERSION,
        "engine": engine,
        "prop": prop,
        "llp": llp,
        "deferred_maintenance": {
            "breakdown": deferred["breakdown"],
            "total": deferred["total"],
            "true_cost": deferred["true_cost"],
            "asking_price": deferred["asking_price"],
            "deferred_items": deferred["deferred_items"],
        },
        "risk_level": risk,
    }
