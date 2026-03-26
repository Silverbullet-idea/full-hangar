"""Detect displayable engine model strings vs maintenance / narrative junk."""

from __future__ import annotations

import re

# Aligned with aircraft_intelligence._ENGINE_MODEL_PATTERNS (avoid circular import).
_COMPACT_ENGINE_MODEL_PATTERNS = [
    re.compile(r"\b(?:AE|GO|GIO|HIO|IO|IVO|LIO|LO|LTIO|LTSIO|O|TIO|TO|TSIO|VO)-?\d{3,4}[A-Z0-9-]*\b"),
    re.compile(r"\bR-?\d{3,4}[A-Z0-9-]*\b"),
    re.compile(
        r"\b(?:PT6A|PT6T|JT15D|PW\d{3,4}[A-Z]?|TPE331|M601|RR300|CF34|FJ44|TFE731|AS907|HTF7700)[A-Z0-9-]*\b"
    ),
]

# Narrative / logbook fragments that should not be shown as the engine *model* identity.
_PROSE_MARKERS = re.compile(
    r"\b("
    r"adapter|cylinder|repaired|repair|pre[-\s]?heat|mags?|magnetos?|"
    r"\bo\s*/\s*h\b|overhaul|poplar|reiff|filter|annual|inspection|"
    r"log\s*book|logbook|since\s+new|ttaf|smoh|spoh"
    r")\b",
    re.IGNORECASE,
)

_VENDOR_ONLY = {
    "CONTINENTAL",
    "LYCOMING",
    "PRATT & WHITNEY",
    "PRATT AND WHITNEY",
    "ROTAX",
    "CONT MOTOR",
    "TCM",
}


def extract_compact_engine_model(value: str | None) -> str | None:
    """If a known compact model token appears inside noisy text, return it."""
    if not value:
        return None
    upper = str(value).upper()
    for pat in _COMPACT_ENGINE_MODEL_PATTERNS:
        m = pat.search(upper)
        if m:
            token = m.group(0).replace("/", "-").strip()
            return token or None
    return None


def is_plausible_engine_identity_model(value: str | None) -> bool:
    """
    True if the string is suitable as an engine model line (not maintenance prose).
    """
    if value is None:
        return False
    raw = str(value).strip()
    if not raw:
        return False
    upper = raw.upper()
    collapsed = re.sub(r"\s+", " ", upper).strip()
    if collapsed in _VENDOR_ONLY:
        return False

    if extract_compact_engine_model(raw):
        return True

    # Long strings with maintenance vocabulary are not model identities.
    if len(raw) > 44 and _PROSE_MARKERS.search(raw):
        return False
    if len(raw) > 56:
        return False

    # Short-ish token: allow typical "IO-360 C1E" style without forcing pattern match for every edge case.
    if len(raw) <= 44:
        if not re.search(r"\d", raw):
            return False
        if collapsed.count(" ") > 4:
            return False
        if _PROSE_MARKERS.search(raw) and len(raw) > 24:
            return False
        return True

    return False
