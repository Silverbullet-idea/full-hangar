"""
flip_score: 0–100 flip-opportunity composite score.

Replaces value_score as the primary displayed score site-wide.
value_score continues to be computed internally as an input signal.

Core pillars (sum 100 when regional data is absent):
  P1  Pricing Edge          0–35 pts  (true cost vs comp median)
  P2  Airworthiness Base    0–20 pts  (engine life + risk level)
  P3  Improvement Headroom  0–30 pts  (avionics gap + condition gap)
  P4  Exit Liquidity        0–15 pts  (model demand + days on market)

Optional P5 Regional pricing (make/model/state median): 0–15 pts, 15% of flip score
when `market_comps_regional` + parsed US state exist. When active: raw_total =
round(0.85 * (P1+P2+P3+P4) + P5); otherwise raw_total = P1+P2+P3+P4.

Hard caps:
  risk_level == CRITICAL  ->  flip_score capped at 35
  asking_price missing/0  ->  flip_score = None, flip_tier = None

Tier labels:
  80+  HOT
  65+  GOOD
  50+  FAIR
  <50  PASS
"""

from __future__ import annotations

import json
import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Liquidity tier classification
# ---------------------------------------------------------------------------

_HIGH_LIQUIDITY = [
    "cessna 172",
    "cessna 182",
    "cessna 150",
    "cessna 152",
    "piper cherokee",
    "piper warrior",
    "piper archer",
    "piper arrow",
    "beechcraft musketeer",
    "beechcraft sundowner",
    "grumman aa5",
    "grumman cheetah",
    "grumman tiger",
    "mooney m20",
]
_MED_LIQUIDITY = [
    "cessna 210",
    "cessna 206",
    "cessna 205",
    "piper comanche",
    "piper lance",
    "piper seneca",
    "beechcraft bonanza",
    "beechcraft debonair",
    "cirrus sr20",
    "cirrus sr22",
    "diamond da40",
    "diamond da42",
    "robinson r22",
    "robinson r44",
]

_GLASS_PANEL_INDICATORS = {
    "g1000",
    "g2000",
    "g3000",
    "g5000",
    "avidyne entegra",
    "avidyne ifd",
    "g500 txi",
    "g600 txi",
    "g500",
    "g600",
    "g3x touch",
    "g3x",
    "aspen evo 1000",
}


def _avionics_score_value(score_data: dict) -> float:
    raw = score_data.get("avionics_score")
    if raw is not None:
        try:
            return float(raw)
        except (TypeError, ValueError):
            pass
    av = score_data.get("avionics") or {}
    try:
        return float(av.get("score") or 50)
    except (TypeError, ValueError):
        return 50.0


def _deferred_maintenance_total(score_data: dict) -> float:
    direct = score_data.get("deferred_maintenance_total")
    if direct is not None:
        try:
            return float(direct)
        except (TypeError, ValueError):
            pass
    dm = score_data.get("deferred_maintenance") or {}
    try:
        return float(dm.get("total") or 0)
    except (TypeError, ValueError):
        return 0.0


def _ev_pct_life_remaining(listing: dict, score_data: dict) -> float | None:
    ev_pct = score_data.get("ev_pct_life_remaining")
    if ev_pct is not None:
        try:
            return float(ev_pct)
        except (TypeError, ValueError):
            pass
    ev_block = score_data.get("engine_value") or {}
    plr = ev_block.get("pct_life_remaining")
    if plr is not None:
        try:
            f = float(plr)
            return f * 100.0 if f <= 1.0 else f
        except (TypeError, ValueError):
            pass
    return None


def _has_glass_panel(listing: dict, score_data: dict) -> bool:
    if _avionics_score_value(score_data) >= 75:
        return True
    di = listing.get("description_intelligence") or {}
    if isinstance(di, str):
        try:
            di = json.loads(di)
        except Exception:
            di = {}
    if not isinstance(di, dict):
        di = {}
    for unit in di.get("avionics_detailed") or []:
        if not isinstance(unit, dict):
            continue
        canonical = (unit.get("canonical_name") or "").lower()
        if any(ind in canonical for ind in _GLASS_PANEL_INDICATORS):
            return True
    notes = (listing.get("avionics_notes") or listing.get("avionics_description") or "").lower()
    if any(ind in notes for ind in _GLASS_PANEL_INDICATORS):
        return True
    return False


def _get_liquidity_tier(listing: dict) -> str:
    make = (listing.get("make") or "").lower().strip()
    model = (listing.get("model") or "").lower().strip()
    key = f"{make} {model}".strip()
    for h in _HIGH_LIQUIDITY:
        if h in key:
            return "high"
    for m in _MED_LIQUIDITY:
        if m in key:
            return "medium"
    return "low"


def _p1_pricing_edge(listing: dict, score_data: dict) -> tuple[int, str]:
    ask = listing.get("asking_price") or 0
    try:
        ask = float(ask)
    except (TypeError, ValueError):
        ask = 0
    if ask <= 0:
        return 0, "no_price"
    deferred = _deferred_maintenance_total(score_data)
    true_cost = ask + deferred
    comp_median = (
        score_data.get("comp_median_price")
        or score_data.get("market_median_price")
        or score_data.get("comp_price_median")
    )
    try:
        comp_median_f = float(comp_median) if comp_median is not None else 0.0
    except (TypeError, ValueError):
        comp_median_f = 0.0
    if comp_median_f > 0:
        ratio = true_cost / comp_median_f
        if ratio <= 0.72:
            pts = 35
        elif ratio <= 0.80:
            pts = 30
        elif ratio <= 0.87:
            pts = 24
        elif ratio <= 0.93:
            pts = 18
        elif ratio <= 0.98:
            pts = 12
        elif ratio <= 1.03:
            pts = 7
        elif ratio <= 1.10:
            pts = 3
        else:
            pts = 0
        basis = f"true_cost_vs_comps:{ratio:.2f}"
    else:
        fallback_map = {
            "EXCEPTIONAL_DEAL": 28,
            "GOOD_DEAL": 20,
            "FAIR_MARKET": 12,
            "ABOVE_MARKET": 5,
            "OVERPRICED": 2,
            "INSUFFICIENT_DATA": 10,
        }
        tier_key = str(score_data.get("deal_tier") or "INSUFFICIENT_DATA").strip().upper()
        if tier_key in fallback_map:
            pts = fallback_map[tier_key]
            basis = f"deal_tier_fallback:{tier_key}"
        else:
            dr = score_data.get("deal_rating")
            if isinstance(dr, (int, float)):
                if dr >= 80:
                    pts, tag = 28, "numeric_exceptional"
                elif dr >= 65:
                    pts, tag = 20, "numeric_good"
                elif dr >= 45:
                    pts, tag = 12, "numeric_fair"
                elif dr >= 30:
                    pts, tag = 5, "numeric_weak"
                else:
                    pts, tag = 2, "numeric_poor"
                basis = f"deal_rating_fallback:{tag}"
            else:
                pts, basis = 10, "deal_fallback:UNKNOWN"
    return pts, basis


def _p2_airworthiness(listing: dict, score_data: dict) -> tuple[int, str]:
    risk = (score_data.get("risk_level") or "MODERATE").upper()
    ev_pct = _ev_pct_life_remaining(listing, score_data)
    if ev_pct is None:
        smoh = listing.get("engine_hours_smoh") or listing.get("time_since_engine_overhaul") or listing.get(
            "time_since_overhaul"
        )
        tbo = listing.get("engine_tbo_hours")
        try:
            smoh_f = float(smoh) if smoh is not None else None
            tbo_f = float(tbo) if tbo is not None else None
        except (TypeError, ValueError):
            smoh_f, tbo_f = None, None
        if smoh_f is not None and tbo_f and tbo_f > 0:
            ev_pct = max(0.0, (1 - smoh_f / tbo_f) * 100)
    engine_pts = round(max(0, min(ev_pct or 0, 100)) / 100 * 12) if ev_pct is not None else 5
    cond_score = float(score_data.get("condition_score") or 50)
    risk_pts_map = {
        "LOW": 8,
        "MODERATE": min(6, round(cond_score / 100 * 8)),
        "HIGH": 3,
        "CRITICAL": 0,
    }
    cond_pts = risk_pts_map.get(risk, 4)
    return engine_pts + cond_pts, f"engine:{engine_pts}+risk:{cond_pts}({risk})"


def _p3_improvement_headroom(listing: dict, score_data: dict) -> tuple[int, str]:
    risk = (score_data.get("risk_level") or "MODERATE").upper()
    if risk == "CRITICAL":
        return 0, "critical_risk_no_headroom"
    glass = _has_glass_panel(listing, score_data)
    avionics_score = _avionics_score_value(score_data)
    if glass:
        avionics_pts = 0
        av_basis = "glass_panel_neutral"
    else:
        avionics_pts = round((1 - min(avionics_score / 100, 1.0)) * 15)
        av_basis = f"steam_gauge:{avionics_score:.0f}"
    cond_score = float(score_data.get("condition_score") or 50)
    if risk in ("CRITICAL", "HIGH"):
        cond_pts = 2
        cond_basis = f"risk_{risk}_limited"
    else:
        cond_pts = round((1 - min(cond_score / 100, 1.0)) * 15)
        cond_basis = f"condition:{cond_score:.0f}"
    return avionics_pts + cond_pts, f"avionics:{avionics_pts}({av_basis})+condition:{cond_pts}({cond_basis})"


def _p4_exit_liquidity(listing: dict, score_data: dict) -> tuple[int, str]:
    tier = _get_liquidity_tier(listing)
    base_map = {"high": 12, "medium": 8, "low": 4}
    base = base_map[tier]
    dom = listing.get("days_on_market") or 0
    try:
        dom = int(float(dom))
    except (TypeError, ValueError):
        dom = 0
    if dom > 270:
        dom_penalty = 5
    elif dom > 180:
        dom_penalty = 4
    elif dom > 90:
        dom_penalty = 2
    elif dom > 45:
        dom_penalty = 1
    else:
        dom_penalty = 0
    fresh_bonus = 2 if dom <= 7 else 0
    p4 = max(0, min(15, base - dom_penalty + fresh_bonus))
    return p4, f"tier:{tier}(base:{base})-dom:{dom_penalty}+fresh:{fresh_bonus}"


def compute_flip_score(listing: dict, score_data: dict) -> dict:
    """
    Returns dict with keys:
        flip_score       int | None
        flip_tier        str | None   ('HOT', 'GOOD', 'FAIR', 'PASS')
        flip_explanation dict
    """
    ask = listing.get("asking_price") or 0
    try:
        ask = float(ask)
    except (TypeError, ValueError):
        ask = 0
    if ask <= 0:
        return {
            "flip_score": None,
            "flip_tier": None,
            "flip_explanation": {"suppressed": "no_disclosed_price"},
        }
    try:
        p1, p1b = _p1_pricing_edge(listing, score_data)
        p2, p2b = _p2_airworthiness(listing, score_data)
        p3, p3b = _p3_improvement_headroom(listing, score_data)
        p4, p4b = _p4_exit_liquidity(listing, score_data)
    except Exception as exc:
        logger.warning("flip_score pillar error: %s", exc, exc_info=True)
        return {"flip_score": None, "flip_tier": None, "flip_explanation": {"error": str(exc)}}
    subtotal = p1 + p2 + p3 + p4
    p5_raw = score_data.get("regional_flip_pts")
    p5_basis = str(score_data.get("regional_flip_basis") or "skipped")
    p5i: int | None
    if p5_raw is not None:
        try:
            p5i = max(0, min(15, int(p5_raw)))
        except (TypeError, ValueError):
            p5i = None
    else:
        p5i = None
    if p5i is not None:
        raw = round(0.85 * subtotal + p5i)
        p5_explanation = {
            "pts": p5i,
            "max": 15,
            "basis": p5_basis,
            "blend": "0.85*(P1..P4)+P5",
            "subtotal_p1_p4": subtotal,
        }
    else:
        raw = subtotal
        p5_explanation = {
            "pts": None,
            "max": 15,
            "basis": p5_basis,
            "blend": "P1+P2+P3+P4",
            "subtotal_p1_p4": subtotal,
        }
    risk = (score_data.get("risk_level") or "MODERATE").upper()
    if risk == "CRITICAL":
        raw = min(raw, 35)
    flip_score = max(0, min(100, raw))
    tier = (
        "HOT"
        if flip_score >= 80
        else "GOOD"
        if flip_score >= 65
        else "FAIR"
        if flip_score >= 50
        else "PASS"
    )
    return {
        "flip_score": flip_score,
        "flip_tier": tier,
        "flip_explanation": {
            "p1_pricing_edge": {"pts": p1, "max": 35, "basis": p1b},
            "p2_airworthiness": {"pts": p2, "max": 20, "basis": p2b},
            "p3_improvement_room": {"pts": p3, "max": 30, "basis": p3b},
            "p4_exit_liquidity": {"pts": p4, "max": 15, "basis": p4b},
            "p5_regional_pricing": p5_explanation,
            "raw_total": raw,
            "risk_cap_applied": risk == "CRITICAL",
        },
    }
