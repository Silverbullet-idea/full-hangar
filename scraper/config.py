from __future__ import annotations

from typing import Iterable, Optional

AVIONICS_MANUFACTURER_ALIASES = {
    "KING": "BendixKing",
    "BENDIX/KING": "BendixKing",
    "BENDIX KING": "BendixKing",
    "BENDIXKING": "BendixKing",
    "GARMIN LTD": "Garmin",
    "GARMIN INTL": "Garmin",
    "GARMIN INTERNATIONAL": "Garmin",
    "COLLINS": "Collins Aerospace",
    "ROCKWELL COLLINS": "Collins Aerospace",
    "UNIVERSAL": "Universal Avionics",
    "UNIVERSAL AVIONICS": "Universal Avionics",
    "UAVIONIX": "uAvionix",
    "U-AVIONIX": "uAvionix",
    "AVIDYNE CORP": "Avidyne",
    "ASPEN AVIONICS": "Aspen Avionics",
    "S TEC": "S-TEC",
    "S-TEC": "S-TEC",
    "L3": "L3Harris",
    "L3HARRIS": "L3Harris",
}


# Lightweight shared scraper config.
# This restores the common API expected by scraper modules:
# - normalize_manufacturer()
# - get_manufacturer_tier()
# - get_makes_for_tiers()
# - BARNSTORMERS_CATEGORIES / SCRAPE_ORDER

_TIER_1_MAKES = [
    "Cessna",
    "Piper",
    "Beechcraft",
    "Cirrus",
    "Mooney",
    "Diamond",
]

_TIER_2_MAKES = [
    "Commander",
    "Grumman",
    "Maule",
    "Bellanca",
    "Luscombe",
    "Taylorcraft",
    "Aeronca",
    "Stinson",
    "Robin",
    "Socata",
]

_TIER_3_MAKES = [
    "King Air",
    "TBM",
    "PC-12",
    "Citation",
    "Learjet",
    "Falcon",
    "Gulfstream",
    "Hawker",
    "Embraer",
    "Bell",
    "Robinson",
    "Sikorsky",
    "Eurocopter",
]

_ALL_MAKES = _TIER_1_MAKES + _TIER_2_MAKES + _TIER_3_MAKES


def normalize_manufacturer(value: object) -> str:
    return str(value or "").strip().title()


def get_manufacturer_tier(value: object) -> Optional[int]:
    make = normalize_manufacturer(value)
    if not make:
        return None
    if make in _TIER_1_MAKES:
        return 1
    if make in _TIER_2_MAKES:
        return 2
    if make in _TIER_3_MAKES:
        return 3
    return None


def get_makes_for_tiers(tiers: Iterable[str] | None) -> list[str]:
    requested = {str(t).strip().lower() for t in (tiers or []) if str(t).strip()}
    if not requested or "all" in requested:
        return list(_ALL_MAKES)

    makes: list[str] = []
    if "1" in requested:
        makes.extend(_TIER_1_MAKES)
    if "2" in requested:
        makes.extend(_TIER_2_MAKES)
    if "3" in requested:
        makes.extend(_TIER_3_MAKES)
    # Preserve order while de-duping.
    return list(dict.fromkeys(makes))


BARNSTORMERS_CATEGORIES = {
    "single_engine": "https://www.barnstormers.com/cat.php?catid=1",
    "multi_engine": "https://www.barnstormers.com/cat.php?catid=2",
    "turboprop": "https://www.barnstormers.com/cat.php?catid=3",
    "jet": "https://www.barnstormers.com/cat.php?catid=4",
    "helicopter": "https://www.barnstormers.com/cat.php?catid=5",
}

TRADAPLANE_CATEGORIES = {
    "All Aircraft": {
        "params": {"s-type": "aircraft", "_minimal": "1"},
        "aircraft_type": "unknown",
    },
    "Single Engine Piston": {
        "params": {"category_level1": "Single Engine Piston", "s-type": "aircraft"},
        "aircraft_type": "single_engine_piston",
    },
    "Multi-Engine Piston": {
        "params": {"category_level1": "Multi Engine Piston", "s-type": "aircraft"},
        "aircraft_type": "multi_engine_piston",
    },
    "Turboprop": {
        "params": {"category_level1": "Turboprop", "s-type": "aircraft"},
        "aircraft_type": "turboprop",
    },
    "Jet": {
        "params": {"category_level1": "Jets", "s-type": "aircraft", "_minimal": "1"},
        "aircraft_type": "jet",
    },
    "Helicopter": {
        "params": {"category_level1": "Turbine Helicopters", "s-type": "aircraft"},
        "aircraft_type": "helicopter",
    },
    "Piston Helicopter": {
        "params": {"category_level1": "Piston Helicopters", "s-type": "aircraft"},
        "aircraft_type": "helicopter",
    },
    "Amphibious / Float": {
        "params": {"category_level1": "Single Engine Piston", "make": "LAKE", "s-type": "aircraft"},
        "aircraft_type": "amphibious_float",
    },
    "Light Sport Aircraft": {
        "params": {"category_level1": "LSA | Ultralight", "s-type": "aircraft"},
        "aircraft_type": "light_sport",
    },
    "Gliders | Sailplanes": {
        "params": {"category_level1": "Gliders | Sailplanes", "s-type": "aircraft"},
        "aircraft_type": "glider",
    },
    "Rotary Wing": {
        "params": {"category_level1": "Rotary Wing", "s-type": "aircraft"},
        "aircraft_type": "helicopter",
    },
    "Balloons | Airships": {
        "params": {"category_level1": "Balloons | Airships", "s-type": "aircraft"},
        "aircraft_type": "unknown",
    },
    "Warbird / Vintage": {
        "params": {"category_level1": "Single Engine Piston", "vintage": "t", "s-type": "aircraft"},
        "aircraft_type": "warbird_vintage",
    },
    "Experimental / Homebuilt": {
        "params": {"category_level1": "Single Engine Piston", "make": "HOMEBUILT", "s-type": "aircraft"},
        "aircraft_type": "experimental_homebuilt",
    },
    "Agricultural": {
        "params": {"make": "AIR TRACTOR", "s-type": "aircraft"},
        "aircraft_type": "agricultural",
    },
}

SCRAPE_ORDER = list(_ALL_MAKES)
