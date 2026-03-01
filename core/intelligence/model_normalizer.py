"""
Deterministic normalization for engine and propeller model matching.
Critical for matching listing text to reference table rows.
"""

from __future__ import annotations

import re


def normalize_engine_model(raw: str | None) -> str:
    """
    Normalize engine model to a canonical form for reference lookup.
    Examples:
      O-320-D2J  -> O320D2J
      O320D2J    -> O320D2J
      Lycoming O320 D2J -> O320D2J (manufacturer stripped for matching)
    """
    if not raw or not str(raw).strip():
        return ""
    s = str(raw).upper().strip()
    # Remove spaces, dashes, underscores; keep alphanumeric only
    s = re.sub(r"[\s\-_]+", "", s)
    s = re.sub(r"[^A-Z0-9]", "", s)
    return s


def normalize_prop_model(raw: str | None) -> str:
    """Normalize propeller make/model for reference lookup."""
    if not raw or not str(raw).strip():
        return ""
    s = str(raw).upper().strip()
    s = re.sub(r"[\s\-_]+", "", s)
    s = re.sub(r"[^A-Z0-9]", "", s)
    return s


def extract_engine_canonical_from_listing(listing: dict) -> str:
    """
    Build searchable engine string from listing (engine_model + description).
    Returns normalized form for get_engine_reference.
    """
    engine = (listing.get("engine_model") or "").strip()
    desc = (listing.get("description") or "") + " " + (listing.get("description_full") or "")
    combined = (engine + " " + desc).upper()
    # Common patterns: Lycoming O-320, IO-360-L2A, Continental IO-550, PT6A-42
    combined = re.sub(r"[\s\-_]+", " ", combined)
    return normalize_engine_model(engine or combined)


def extract_prop_canonical_from_listing(listing: dict) -> str:
    """Build searchable prop string from listing (description)."""
    desc = (listing.get("description") or "") + " " + (listing.get("description_full") or "")
    # Often "McCauley", "Hartzell", "Sensenich" in text
    return normalize_prop_model(desc)
