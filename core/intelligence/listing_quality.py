"""
Layer 1: Listing Quality Score
Used for: sorting search results, ranking cards, filtering low-quality junk.
Does NOT use TBO or aviation-specific logic — that is Layer 2.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

DEFAULT_WEIGHTS = {
    "completeness": 0.25,
    "maintenance": 0.25,
    "documentation": 0.20,
    "presentation": 0.15,
    "recency": 0.15,
}


def score_completeness(listing: dict) -> float:
    """Data completeness 0–100. More fields populated = higher."""
    valuable = [
        "year", "make", "model", "asking_price",
        "n_number", "description", "total_time_airframe",
        "time_since_overhaul", "time_since_prop_overhaul",
        "location_raw", "state", "seller_name", "seller_type",
        "primary_image_url", "aircraft_type",
    ]
    # Only score second-engine timing on aircraft that are actually multi-engine.
    # Singles should never be penalized for not having an engine #2.
    if _is_multi_engine_listing(listing):
        valuable.append("second_engine_time_since_overhaul")
    present = sum(1 for k in valuable if listing.get(k) is not None and listing.get(k) != "")
    return min(100, (present / len(valuable)) * 100)


def _is_multi_engine_listing(listing: dict) -> bool:
    engine_count = listing.get("engine_count")
    try:
        if engine_count is not None and int(engine_count) >= 2:
            return True
    except (TypeError, ValueError):
        pass

    aircraft_type = str(listing.get("aircraft_type") or "").lower()
    model = str(listing.get("model") or "").lower()
    make = str(listing.get("make") or "").lower()
    joined = f"{aircraft_type} {make} {model}"
    return any(token in joined for token in ("twin", "multi_engine", "multi-engine", "multi engine"))


def score_maintenance(listing: dict) -> float:
    """
    Maintenance freshness for LISTING quality (not engine TBO).
    Fresh overhauls = higher. Missing data = mid-range.
    """
    smoh = listing.get("time_since_overhaul")
    spoh = listing.get("time_since_prop_overhaul")
    snew = listing.get("time_since_new_engine")
    year = listing.get("year")
    tt = listing.get("total_time_airframe")

    if tt is None and smoh is None and snew is None:
        return 50.0

    if snew is not None and year and (datetime.now().year - year) < 10:
        return min(100, 70 + (5000 - min(snew, 5000)) / 100)
    if snew is not None:
        return max(0, 80 - snew / 500)

    if smoh is not None:
        if smoh == 0:
            return 100.0
        if smoh < 500:
            return 90
        if smoh < 1200:
            return 80 - (smoh - 500) / 35
        if smoh < 2000:
            return 60 - (smoh - 1200) / 40
        return max(20, 50 - smoh / 100)

    if tt is not None:
        return 55
    return 50.0


def score_documentation(listing: dict) -> float:
    """Documentation quality: N-number, description length, keywords."""
    score = 0.0
    if listing.get("n_number"):
        score += 25
    if listing.get("serial_number"):
        score += 15
    desc = listing.get("description") or listing.get("description_full") or ""
    if len(desc) >= 200:
        score += 30
    elif len(desc) >= 100:
        score += 20
    elif len(desc) >= 50:
        score += 10
    keywords = ["annual", "log", "records", "compression", "overhaul", "inspection"]
    if any(k in desc.lower() for k in keywords):
        score += 15
    return min(100, score + 25)


def score_presentation(listing: dict) -> float:
    """Presentation: image, avionics, paint/interior ratings."""
    score = 0.0
    if listing.get("primary_image_url"):
        score += 35
    if listing.get("avionics_notes"):
        score += 25
    paint = listing.get("paint_condition")
    interior = listing.get("interior_condition")
    if paint is not None:
        score += 20 * (paint / 10)
    elif interior is not None:
        score += 15
    if interior is not None:
        score += 20 * (interior / 10)
    return min(100, score + 20)


def score_recency(listing: dict) -> float:
    """Listing recency: fresh listing_date = higher."""
    ld = listing.get("listing_date")
    if not ld:
        return 60
    try:
        if isinstance(ld, str):
            dt = datetime.fromisoformat(ld.replace("Z", "+00:00")[:10])
        else:
            dt = ld
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        days_ago = (datetime.now(timezone.utc) - dt).days
        if days_ago < 0:
            days_ago = 0
        if days_ago <= 7:
            return 100
        if days_ago <= 30:
            return 90 - days_ago / 3
        if days_ago <= 90:
            return 80 - (days_ago - 30) / 3
        return max(30, 70 - days_ago / 10)
    except Exception:
        return 60


def listing_quality_score(
    listing: dict,
    weights: Optional[dict] = None,
) -> dict:
    """
    Layer 1: Listing Quality Score (0–100).
    For sorting, ranking cards, filtering junk. Keeps aviation logic out.
    """
    w = weights or DEFAULT_WEIGHTS
    c = score_completeness(listing)
    m = score_maintenance(listing)
    d = score_documentation(listing)
    p = score_presentation(listing)
    r = score_recency(listing)

    total = (
        w.get("completeness", 0.25) * c
        + w.get("maintenance", 0.25) * m
        + w.get("documentation", 0.20) * d
        + w.get("presentation", 0.15) * p
        + w.get("recency", 0.15) * r
    )

    return {
        "total": round(total, 1),
        "completeness": round(c, 1),
        "maintenance": round(m, 1),
        "documentation": round(d, 1),
        "presentation": round(p, 1),
        "recency": round(r, 1),
    }
