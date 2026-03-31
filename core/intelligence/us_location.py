"""
US state extraction from `state` and `location_raw` listing fields.
Shared by market comp aggregation and per-listing regional pricing signals.
"""

from __future__ import annotations

import re

# 50 states + DC (validated codes only).
US_STATE_CODES: frozenset[str] = frozenset(
    {
        "AL",
        "AK",
        "AZ",
        "AR",
        "CA",
        "CO",
        "CT",
        "DE",
        "FL",
        "GA",
        "HI",
        "ID",
        "IL",
        "IN",
        "IA",
        "KS",
        "KY",
        "LA",
        "ME",
        "MD",
        "MA",
        "MI",
        "MN",
        "MS",
        "MO",
        "MT",
        "NE",
        "NV",
        "NH",
        "NJ",
        "NM",
        "NY",
        "NC",
        "ND",
        "OH",
        "OK",
        "OR",
        "PA",
        "RI",
        "SC",
        "SD",
        "TN",
        "TX",
        "UT",
        "VT",
        "VA",
        "WA",
        "WV",
        "WI",
        "WY",
        "DC",
    }
)

_US_STATE_NAME_TO_CODE: dict[str, str] = {
    "alabama": "AL",
    "alaska": "AK",
    "arizona": "AZ",
    "arkansas": "AR",
    "california": "CA",
    "colorado": "CO",
    "connecticut": "CT",
    "delaware": "DE",
    "florida": "FL",
    "georgia": "GA",
    "hawaii": "HI",
    "idaho": "ID",
    "illinois": "IL",
    "indiana": "IN",
    "iowa": "IA",
    "kansas": "KS",
    "kentucky": "KY",
    "louisiana": "LA",
    "maine": "ME",
    "maryland": "MD",
    "massachusetts": "MA",
    "michigan": "MI",
    "minnesota": "MN",
    "mississippi": "MS",
    "missouri": "MO",
    "montana": "MT",
    "nebraska": "NE",
    "nevada": "NV",
    "new hampshire": "NH",
    "new jersey": "NJ",
    "new mexico": "NM",
    "new york": "NY",
    "north carolina": "NC",
    "north dakota": "ND",
    "ohio": "OH",
    "oklahoma": "OK",
    "oregon": "OR",
    "pennsylvania": "PA",
    "rhode island": "RI",
    "south carolina": "SC",
    "south dakota": "SD",
    "tennessee": "TN",
    "texas": "TX",
    "utah": "UT",
    "vermont": "VT",
    "virginia": "VA",
    "washington": "WA",
    "west virginia": "WV",
    "wisconsin": "WI",
    "wyoming": "WY",
    "district of columbia": "DC",
}


def parse_us_state_from_listing_fields(
    *,
    state: object | None,
    location_raw: object | None,
) -> str | None:
    """
    Return a two-letter US state code or None if parsing fails.
    Never raises.
    """
    try:
        raw_state = str(state or "").strip().upper()
        if len(raw_state) == 2 and raw_state in US_STATE_CODES:
            return raw_state
        loc = str(location_raw or "").strip()
        if not loc:
            return None
        up = re.sub(r"\s+", " ", loc).strip().upper()
        m = re.search(r"(?:,\s*|\b)([A-Z]{2})(?:\b|[,/])", up)
        if m:
            code = m.group(1)
            if code in US_STATE_CODES:
                return code
        low = loc.lower()
        for name, code in _US_STATE_NAME_TO_CODE.items():
            if name in low:
                return code
        return None
    except Exception:
        return None
