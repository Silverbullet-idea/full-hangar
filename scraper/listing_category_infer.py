"""
Infer aircraft_listings.aircraft_type from URLs and raw JSON.

Shared by:
- backfill_aircraft_type.py (historical rows)
- controller_scraper.py (canonical Controller category IDs; keep in sync with
  browser-extension/background.js CONTROLLER_CATEGORY_ROUTES + slug maps)

Browse/filter tokens align with lib/listings/categoryMap.ts.
"""

from __future__ import annotations

import re
from typing import Any, Optional
from urllib.parse import parse_qs, urlparse

try:
    from config import normalize_manufacturer
except ImportError:  # pragma: no cover
    from scraper.config import normalize_manufacturer


def normalized_make_model_key(make: str | None, model: str | None) -> tuple[str, str] | None:
    """
    Stable identity for peer lookup: (make.lower(), model.lower()) after manufacturer + whitespace cleanup.
    Used to infer aircraft_type from other listings with the same make/model.
    """
    m = normalize_manufacturer(make)
    mod = re.sub(r"\s+", " ", str(model or "").strip())
    if not m or not mod:
        return None
    return (m.lower(), mod.lower())

# Controller.com numeric category IDs (same as browser-extension CONTROLLER_CATEGORY_ROUTES values).
CONTROLLER_CATEGORY_ID_TO_AIRCRAFT_TYPE: dict[int, str] = {
    1: "amphibian",  # piston-amphibious-floatplanes
    71: "amphibian",  # turbine-amphibious-floatplanes
    3: "jet",
    5: "helicopter",  # piston-helicopters
    7: "helicopter",  # turbine-helicopters
    6: "single_engine_piston",
    8: "turboprop",
    9: "multi_engine_piston",
    2: "single_engine_piston",  # experimental-homebuilt
    433: "light_sport",
    47: "single_engine_piston",  # piston-ag
    70: "turboprop",  # turbine-ag
    10004: "single_engine_piston",  # piston-military
    10072: "jet",  # turbine-military
}

# Path segment after /listings/for-sale/ (before numeric id), e.g. piston-single-aircraft/6
CONTROLLER_SLUG_TO_AIRCRAFT_TYPE: dict[str, str] = {
    "piston-single-aircraft": "single_engine_piston",
    "piston-twin-aircraft": "multi_engine_piston",
    "jet-aircraft": "jet",
    "turboprop-aircraft": "turboprop",
    "light-sport-aircraft": "light_sport",
    "experimental-homebuilt-aircraft": "single_engine_piston",
    "piston-agricultural-aircraft": "single_engine_piston",
    "turbine-agricultural-aircraft": "turboprop",
    "piston-military-aircraft": "single_engine_piston",
    "turbine-military-aircraft": "jet",
    "piston-amphibious-floatplanes": "amphibian",
    "turbine-amphibious-floatplanes": "amphibian",
    "piston-helicopters": "helicopter",
    "turbine-helicopters": "helicopter",
}

GLOBALAIR_SLUG_TO_AIRCRAFT_TYPE: dict[str, str] = {
    "single-engine-piston": "single_engine_piston",
    "twin-engine-piston": "multi_engine_piston",
    "single-engine-turbine": "turboprop",
    "twin-engine-turbine": "turboprop",
    "private-jet": "jet",
    "helicopters": "helicopter",
    "amphibian": "amphibian",
    "commercial": "single_engine_piston",
    "experimental-kit": "single_engine_piston",
    "light-sport": "light_sport",
    "vintage": "single_engine_piston",
    "warbird": "single_engine_piston",
}


def _normalize_cat_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def infer_aircraft_type_from_tap_category_text(category_text: str | None) -> Optional[str]:
    """Match tradaplane_scraper._infer_aircraft_type behavior."""
    if not category_text:
        return None
    normalized = _normalize_cat_text(category_text)
    if "single engine piston" in normalized:
        return "piston_single"
    if "multi engine piston" in normalized:
        return "piston_multi"
    if "turboprop" in normalized:
        return "turboprop"
    if re.search(r"\bjets?\b", normalized):
        return "jet"
    if "helicopter" in normalized or "rotor" in normalized:
        return "rotorcraft"
    return None


def _infer_controller_from_url(url: str) -> Optional[str]:
    if not url or "controller.com" not in url.lower():
        return None
    parsed = urlparse(url.strip())
    qs = parse_qs(parsed.query)
    for key in ("Category", "category"):
        vals = qs.get(key)
        if vals:
            try:
                cid = int(str(vals[0]).strip())
                return CONTROLLER_CATEGORY_ID_TO_AIRCRAFT_TYPE.get(cid)
            except ValueError:
                pass
    # Category browse pages: /listings/for-sale/{slug}/{id}
    m = re.search(r"/listings/for-sale/([^/]+)/(\d+)", parsed.path, re.I)
    if m:
        slug = m.group(1).strip().lower()
        if slug in CONTROLLER_SLUG_TO_AIRCRAFT_TYPE:
            return CONTROLLER_SLUG_TO_AIRCRAFT_TYPE[slug]
        try:
            cid = int(m.group(2))
            return CONTROLLER_CATEGORY_ID_TO_AIRCRAFT_TYPE.get(cid)
        except ValueError:
            pass
    return None


def _infer_globalair_from_url(url: str) -> Optional[str]:
    if not url or "globalair.com" not in url.lower():
        return None
    m = re.search(r"/aircraft-for-sale/([^/]+)/", url, re.I)
    if not m:
        return None
    slug = m.group(1).strip().lower()
    if slug == "listing-detail" or slug.startswith("search"):
        return None
    return GLOBALAIR_SLUG_TO_AIRCRAFT_TYPE.get(slug)


def _infer_tap_from_url(url: str) -> Optional[str]:
    if not url or "trade-a-plane.com" not in url.lower():
        return None
    qs = parse_qs(urlparse(url).query)
    for key in ("category_level1", "category-level1"):
        vals = qs.get(key)
        if vals:
            t = infer_aircraft_type_from_tap_category_text(vals[0])
            if t:
                return t
    return None


def _dig_raw_data(raw: Any, *keys: str) -> Any:
    if not isinstance(raw, dict):
        return None
    for k in keys:
        v = raw.get(k)
        if v:
            return v
    bu = raw.get("bridge_unmapped")
    if isinstance(bu, dict):
        for k in keys:
            v = bu.get(k)
            if v:
                return v
    return None


def infer_aircraft_type_from_listing_fields(
    *,
    source_site: str | None,
    url: str | None,
    source_url: str | None,
    raw_data: Any = None,
) -> Optional[str]:
    """
    Best-effort inference for rows missing aircraft_type.
    Order: source-specific URL, then raw_data (TAP category text).
    """
    site = (source_site or "").strip().lower()
    primary = (url or "").strip() or (source_url or "").strip()
    secondary = (source_url or "").strip() if primary != (source_url or "").strip() else ""

    if site == "controller":
        for candidate in (primary, secondary):
            if candidate:
                t = _infer_controller_from_url(candidate)
                if t:
                    return t
        return None

    if site == "globalair":
        for candidate in (primary, secondary):
            if candidate:
                t = _infer_globalair_from_url(candidate)
                if t:
                    return t
        return None

    if site == "trade_a_plane":
        for candidate in (primary, secondary):
            if candidate:
                t = _infer_tap_from_url(candidate)
                if t:
                    return t
        cat = _dig_raw_data(raw_data, "tap_category_level1")
        if isinstance(cat, str):
            return infer_aircraft_type_from_tap_category_text(cat)
        return None

    return None


# (cli_key, category_id, aircraft_type) — category_id used in build_category_url Category=param
CONTROLLER_SCRAPER_CATEGORY_ROWS: tuple[tuple[str, int, str], ...] = (
    ("single_piston", 6, "single_engine_piston"),
    ("single_engine_piston", 6, "single_engine_piston"),
    ("twin_piston", 9, "multi_engine_piston"),
    ("twin_engine_piston", 9, "multi_engine_piston"),
    ("multi_engine_piston", 9, "multi_engine_piston"),
    ("jet", 3, "jet"),
    ("jets", 3, "jet"),
    ("turboprop", 8, "turboprop"),
    ("turbine_helicopter", 7, "helicopter"),
    ("piston_helicopter", 5, "helicopter"),
    ("light_sport", 433, "light_sport"),
    ("light_sport_aircraft", 433, "light_sport"),
    ("experimental", 2, "single_engine_piston"),
    ("experimental_homebuilt", 2, "single_engine_piston"),
    ("piston_float", 1, "amphibian"),
    ("piston_amphibious_floatplanes", 1, "amphibian"),
    ("turbine_float", 71, "amphibian"),
    ("turbine_amphibious_floatplanes", 71, "amphibian"),
)
