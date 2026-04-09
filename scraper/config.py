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

# Comp buckets: (make_normalized, family_slug) -> model tokens (lowercase) for matching.
COMP_FAMILY_GROUPS = {
    # ── BEECHCRAFT KING AIR ──────────────────────────────────────────────
    ("beechcraft", "king_air_90"): [
        "king air 90",
        "king air a90",
        "king air b90",
        "king air c90",
        "king air c90a",
        "king air c90b",
        "king air c90gt",
        "king air c90gtx",
        "king air c90gti",
        "king air e90",
        "king air f90",
        "king air f90-1",
        "king air b100",
        "king air 100",
    ],
    ("beechcraft", "king_air_200"): [
        "king air 200",
        "king air a200",
        "king air b200",
        "king air b200gt",
        "king air b200gtr",
        "king air 250",
        "king air 260",
    ],
    ("beechcraft", "king_air_300"): [
        "king air 300",
        "king air 300lw",
        "king air 300-lw",
        "king air 350",
        "king air 350er",
        "king air 350i",
        "king air 350ier",
        "king air 360",
        "king air 360er",
    ],
    # ── BEECHCRAFT BONANZA ───────────────────────────────────────────────
    ("beechcraft", "bonanza"): [
        "bonanza",
        "bonanza 33",
        "bonanza 35",
        "bonanza 36",
        "bonanza a36",
        "bonanza b36tc",
        "bonanza a36tc",
        "bonanza v35",
        "bonanza v35b",
        "debonair",
        "33",
        "35",
        "36",
        "a36",
        "b36tc",
        "v35",
        "v35b",
    ],
    # ── BEECHCRAFT BARON ─────────────────────────────────────────────────
    ("beechcraft", "baron"): [
        "baron",
        "baron 55",
        "baron 58",
        "baron 58p",
        "baron 58tc",
        "55",
        "56",
        "58",
        "58p",
        "58tc",
    ],
    # ── CESSNA CITATION ──────────────────────────────────────────────────
    ("cessna", "citation_cj"): [
        "citation cj",
        "citation cj1",
        "citation cj2",
        "citation cj3",
        "citation cj4",
        "citationjet",
        "525",
        "525a",
        "525b",
        "525c",
    ],
    ("cessna", "citation_excel"): [
        "citation excel",
        "citation xls",
        "citation xls+",
        "560xl",
        "560 xl",
    ],
    ("cessna", "citation_mustang"): [
        "citation mustang",
        "510",
    ],
    ("cessna", "citation_sovereign"): [
        "citation sovereign",
        "citation sovereign+",
        "680",
        "680a",
    ],
    ("cessna", "citation_x"): [
        "citation x",
        "citation x+",
        "750",
    ],
    # ── PIPER PA-28 ──────────────────────────────────────────────────────
    ("piper", "pa28_warrior"): [
        "cherokee 140",
        "cherokee 150",
        "cherokee 160",
        "cherokee 180",
        "warrior",
        "warrior ii",
        "warrior iii",
        "pa-28-140",
        "pa-28-150",
        "pa-28-160",
        "pa-28-180",
        "pa-28-161",
    ],
    ("piper", "pa28_archer"): [
        "archer",
        "archer ii",
        "archer iii",
        "archer dx",
        "archer lx",
        "pa-28-181",
    ],
    ("piper", "pa28_arrow"): [
        "arrow",
        "arrow ii",
        "arrow iii",
        "arrow iv",
        "pa-28r",
        "pa-28r-200",
        "pa-28r-201",
    ],
}

# Sub-model filter display labels for Beechcraft raw codes (API only; does not change DB values).
BEECHCRAFT_MODEL_DISPLAY_NAMES = {
    "17": "Staggerwing (Model 17)",
    "d17s": "Staggerwing D17S",
    "18": "Model 18 (Twin Beech)",
    "c18s": "Model 18C",
    "d18s": "Model 18D",
    "h18": "Model 18H",
    "19": "Musketeer Sport 19",
    "23": "Musketeer 23",
    "24": "Musketeer Super / Sierra",
    "a24r": "Sierra A24R",
    "33": "Bonanza 33 (Debonair)",
    "35": "Bonanza 35 (V-Tail)",
    "36": "Bonanza 36",
    "a36": "Bonanza A36",
    "b36tc": "Bonanza B36TC",
    "a36tc": "Bonanza A36TC",
    "v35": "Bonanza V35",
    "v35b": "Bonanza V35B",
    "f33a": "Bonanza F33A",
    "55": "Baron 55",
    "56": "Baron 56TC",
    "58": "Baron 58",
    "58p": "Baron 58P (Pressurized)",
    "58tc": "Baron 58TC",
    "baron": "Baron",
    "60": "Duke 60",
    "65": "Queen Air 65",
    "70": "Queen Air 70",
    "80": "Queen Air 80",
    "88": "Queen Air 88",
    "76": "Duchess 76",
    "90": "King Air 90",
    "a90": "King Air A90",
    "b90": "King Air B90",
    "c90": "King Air C90",
    "c90a": "King Air C90A",
    "c90b": "King Air C90B",
    "c90gt": "King Air C90GT",
    "c90gtx": "King Air C90GTX",
    "e90": "King Air E90",
    "f90": "King Air F90",
    "f90-1": "King Air F90-1",
    "100": "King Air 100",
    "a100": "King Air A100",
    "b100": "King Air B100",
    "200": "King Air 200",
    "a200": "King Air A200",
    "b200": "King Air B200",
    "b200gt": "King Air B200GT",
    "b200gtr": "King Air B200GTR",
    "250": "King Air 250",
    "260": "King Air 260",
    "300": "King Air 300",
    "300lw": "King Air 300LW",
    "350": "King Air 350",
    "350er": "King Air 350ER",
    "350i": "King Air 350i",
    "360": "King Air 360",
    "360er": "King Air 360ER",
    "1900": "1900 Airliner",
    "1900c": "1900C Airliner",
    "1900d": "1900D Airliner",
}
