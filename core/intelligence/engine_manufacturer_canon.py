"""Canonical display names for engine manufacturers (FAA ref abbreviations, legacy tokens)."""

from __future__ import annotations

import re

# Keys: normalized uppercase, spaces collapsed (alphanumeric + space only for matching).
_ENGINE_MANUFACTURER_CANON: dict[str, str] = {
    "CONT MOTOR": "Continental",
    "CONTINENTAL MOTORS": "Continental",
    "CONTINENTAL MOTORS INC": "Continental",
    "CONTINENTAL": "Continental",
    "TCM": "Continental",
    "TELEDYNE CONTINENTAL": "Continental",
    "TELEDYNE CONTINENTAL MOTORS": "Continental",
    "LYCOMING ENGINES": "Lycoming",
    "LYCOMING": "Lycoming",
    "PRATT WHITNEY": "Pratt & Whitney",
    "PRATT AND WHITNEY": "Pratt & Whitney",
    "PRATT & WHITNEY": "Pratt & Whitney",
    "PWC": "Pratt & Whitney",
    "P W C": "Pratt & Whitney",
    "ROTAX": "Rotax",
    "BOMBARDIER ROTAX": "Rotax",
    "WILLIAMS": "Williams International",
    "WILLIAMS INTERNATIONAL": "Williams International",
}


def _normalize_mfr_key(text: str) -> str:
    t = re.sub(r"[^A-Z0-9\s]+", " ", text.upper())
    return re.sub(r"\s+", " ", t).strip()


def normalize_engine_manufacturer_display(value: str | None) -> str | None:
    """
    Map FAA / listing abbreviations to a consistent product label.
    Returns None if input is empty; otherwise canonical string or original stripped text.
    """
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    key = _normalize_mfr_key(raw)
    if key in _ENGINE_MANUFACTURER_CANON:
        return _ENGINE_MANUFACTURER_CANON[key]
    # Prefix / contains match for noisy FAA strings
    for abbrev, label in _ENGINE_MANUFACTURER_CANON.items():
        if key == abbrev or key.startswith(f"{abbrev} ") or key.endswith(f" {abbrev}") or f" {abbrev} " in f" {key} ":
            return label
    return raw
