"""Lightweight STC detection helpers used by avionics scoring."""

from __future__ import annotations

import re
from typing import Dict, List


# Market-value premium estimates for common STC upgrade families.
STC_PREMIUMS: Dict[str, int] = {
    "engine_conversion": 35000,
    "gross_weight_increase": 12000,
    "vortex_generators": 5000,
    "stol_kit": 8000,
    "float_kit": 12000,
    "avionics_stc": 7000,
}


STC_PATTERNS = {
    "engine_conversion": re.compile(r"\b(engine conversion|turbo normaliz|diesel conversion|stc engine)\b", re.I),
    "gross_weight_increase": re.compile(r"\b(gross weight increase|gross wt stc)\b", re.I),
    "vortex_generators": re.compile(r"\b(vortex generators?|vg kit)\b", re.I),
    "stol_kit": re.compile(r"\b(stol kit|short takeoff and landing kit)\b", re.I),
    "float_kit": re.compile(r"\b(float kit|amphib|seaplane conversion)\b", re.I),
    "avionics_stc": re.compile(r"\b(avionics stc|ifd stc|panel stc)\b", re.I),
}


def detect_stcs(listing: dict) -> dict:
    """Detect likely STC modifications from listing text and return premium estimate."""
    text = " ".join(
        str(v or "")
        for v in (
            listing.get("description"),
            listing.get("description_full"),
            listing.get("avionics_description"),
            listing.get("modifications"),
            listing.get("extra_json"),
        )
    )

    detected: List[dict] = []
    total_premium = 0

    for stc_type, pattern in STC_PATTERNS.items():
        if not pattern.search(text):
            continue
        premium = STC_PREMIUMS.get(stc_type, 0)
        total_premium += premium
        detected.append(
            {
                "type": stc_type,
                "market_value_premium": premium,
            }
        )

    return {
        "detected_stcs": detected,
        "total_market_value_premium": total_premium,
    }

