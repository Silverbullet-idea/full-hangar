"""Lightweight STC detection helpers used by avionics scoring."""

from __future__ import annotations

import re
from typing import Any


def _normalize_text(value: str) -> str:
    lowered = (value or "").lower()
    alnum_spaces = re.sub(r"[^a-z0-9]+", " ", lowered)
    return re.sub(r"\s+", " ", alnum_spaces).strip()


STC_RULES: list[dict[str, Any]] = [
    {
        "stc_name": "Penn Yan 180HP Superhawk",
        "market_value_premium": 9000,
        "patterns": [r"\bpenn\s*yan\b", r"\bsuperhawk\b", r"\b180\s*hp\b", r"\bo[\s\-]?360\b"],
    },
    {
        "stc_name": "Constant Speed Prop Conversion",
        "market_value_premium": 5000,
        "patterns": [
            r"\bconstant\s*speed\s*prop\b",
            r"\bconstant\s*speed\s*propeller\b",
            r"\bcs\s*prop\b",
        ],
    },
    {
        "stc_name": "Vortex Generators",
        "market_value_premium": 5000,
        "patterns": [r"\bvortex\s*generators?\b", r"\bvg\s*kit\b"],
    },
    {
        "stc_name": "STOL Kit",
        "market_value_premium": 8000,
        "patterns": [r"\bstol\s*kit\b", r"\bshort\s*takeoff\s*and\s*landing\s*kit\b"],
    },
]


def detect_stcs(listing: dict[str, Any]) -> dict[str, Any]:
    text = " ".join(
        [
            str(listing.get("description") or ""),
            str(listing.get("description_full") or ""),
            str(listing.get("avionics_description") or ""),
            str(listing.get("modifications") or ""),
            str(listing.get("extra_json") or ""),
        ]
    )
    normalized = _normalize_text(text)
    if not normalized:
        return {"detected_stcs": [], "total_market_value_premium": 0}

    detected: list[dict[str, Any]] = []
    total_market_value_premium = 0
    for rule in STC_RULES:
        patterns = rule.get("patterns", [])
        if not patterns:
            continue
        if not any(re.search(pattern, normalized, flags=re.IGNORECASE) for pattern in patterns):
            continue
        premium = int(rule.get("market_value_premium") or 0)
        total_market_value_premium += premium
        detected.append(
            {
                "stc_name": str(rule.get("stc_name") or "Unknown STC"),
                "market_value_premium": premium,
                "match_confidence": 0.9,
            }
        )

    return {
        "detected_stcs": detected,
        "total_market_value_premium": total_market_value_premium,
    }

