"""
Registration parsing helpers for US and non-US aircraft.

The current platform relies heavily on US N-number flows for FAA enrichment.
This module keeps that path intact while adding a normalized registration model
for international inventory.
"""

from __future__ import annotations

import re
from typing import Any

US_N_RE = re.compile(r"^N[0-9]{1,5}[A-HJ-NP-Z]{0,2}$")
CA_RE = re.compile(r"^C[FGI][A-Z]{3}$")
UK_RE = re.compile(r"^G[A-Z]{4}$")
AU_RE = re.compile(r"^VH[A-Z]{3}$")
NZ_RE = re.compile(r"^ZK[A-Z]{3}$")
DE_RE = re.compile(r"^D[A-Z]{4}$")
FR_RE = re.compile(r"^F[A-Z]{4}$")
ES_RE = re.compile(r"^EC[A-Z0-9]{3,4}$")
MX_RE = re.compile(r"^X[ABC][A-Z0-9]{3}$")
BR_RE = re.compile(r"^(PP|PR|PT|PU)[A-Z0-9]{3,4}$")
GENERIC_HYPHEN_RE = re.compile(r"^[A-Z]{1,2}-[A-Z0-9]{3,5}$")
NOISE_TOKEN_RE = re.compile(r"^[A-Z]{3,12}$")
NOISE_TOKENS = {
    "FRESH",
    "FIXED",
    "PRICE",
    "PRICES",
    "FULLY",
    "GREAT",
    "FLOWN",
    "WARRANTY",
    "REGISTERED",
    "REGISTRATION",
    "ISTERED",
    "ISTRATION",
}

LABEL_CAPTURE_RE = re.compile(
    r"\b(?:registration|reg(?:istration)?|tail(?:\s*number)?|n[\s\-]*number)\b\s*[#:\-]?\s*([A-Z0-9\-]{2,12})\b",
    re.IGNORECASE,
)
PATTERN_CAPTURE_RE = re.compile(
    r"\b("
    r"N[\s\-]*[0-9]{1,5}[A-HJ-NP-Z]{0,2}|"
    r"C[\s\-]*[FGI][A-Z]{3}|"
    r"G[\s\-]*[A-Z]{4}|"
    r"VH[\s\-]*[A-Z]{3}|"
    r"ZK[\s\-]*[A-Z]{3}|"
    r"D[\s\-]*[A-Z]{4}|"
    r"F[\s\-]*[A-Z]{4}|"
    r"EC[\s\-]*[A-Z0-9]{3,4}|"
    r"X[ABC][\s\-]*[A-Z0-9]{3}|"
    r"(?:PP|PR|PT|PU)[\s\-]*[A-Z0-9]{3,4}"
    r")\b",
    re.IGNORECASE,
)
GENERIC_CAPTURE_RE = re.compile(r"\b([A-Z]{1,2}-[A-Z0-9]{3,5})\b", re.IGNORECASE)


def _clean_text(value: Any) -> str:
    text = str(value or "").strip().upper()
    if not text:
        return ""
    text = text.replace("–", "-").replace("—", "-")
    text = re.sub(r"\s+", " ", text)
    return text


def _compact(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", value.upper())


def _sanitize_candidate(value: str | None) -> str | None:
    cleaned = _clean_text(value)
    if not cleaned:
        return None
    token = re.sub(r"[^A-Z0-9\-]", "", cleaned)
    compact = _compact(token)
    if not compact or compact in NOISE_TOKENS:
        return None
    if token in NOISE_TOKENS:
        return None
    if (
        NOISE_TOKEN_RE.fullmatch(token)
        and not (
            US_N_RE.fullmatch(compact)
            or CA_RE.fullmatch(compact)
            or UK_RE.fullmatch(compact)
            or AU_RE.fullmatch(compact)
            or NZ_RE.fullmatch(compact)
            or DE_RE.fullmatch(compact)
            or FR_RE.fullmatch(compact)
            or ES_RE.fullmatch(compact)
            or MX_RE.fullmatch(compact)
            or BR_RE.fullmatch(compact)
        )
    ):
        # Pure alphabetic marketing words are common false positives.
        return None
    return token


def normalize_us_n_number(raw_value: str | None) -> str | None:
    if not raw_value:
        return None
    compact = _compact(raw_value)
    if not compact:
        return None
    if not compact.startswith("N"):
        compact = f"N{compact}"
    return compact if US_N_RE.fullmatch(compact) else None


def extract_registration_from_text(text: str | None) -> str | None:
    cleaned = _clean_text(text)
    if not cleaned:
        return None

    label_match = LABEL_CAPTURE_RE.search(cleaned)
    if label_match:
        candidate = _sanitize_candidate(label_match.group(1))
        if candidate:
            return candidate

    strict_match = PATTERN_CAPTURE_RE.search(cleaned)
    if strict_match:
        candidate = _sanitize_candidate(strict_match.group(1))
        if candidate:
            return candidate

    generic_match = GENERIC_CAPTURE_RE.search(cleaned)
    if generic_match:
        candidate = _sanitize_candidate(generic_match.group(1))
        if candidate:
            return candidate

    return None


def classify_registration(raw_value: str | None) -> dict[str, str | None]:
    sanitized = _sanitize_candidate(raw_value)
    cleaned = _clean_text(sanitized)
    if not cleaned:
        return {
            "registration_normalized": None,
            "registration_scheme": "UNKNOWN",
            "registration_country_code": None,
            "registration_confidence": "low",
            "n_number": None,
        }

    compact = _compact(cleaned)
    normalized_us = normalize_us_n_number(cleaned)
    if normalized_us:
        return {
            "registration_normalized": normalized_us,
            "registration_scheme": "US_N",
            "registration_country_code": "US",
            "registration_confidence": "high",
            "n_number": normalized_us,
        }

    if CA_RE.fullmatch(compact):
        return {
            "registration_normalized": f"C-{compact[1:]}",
            "registration_scheme": "CA_C",
            "registration_country_code": "CA",
            "registration_confidence": "high",
            "n_number": None,
        }
    if UK_RE.fullmatch(compact):
        return {
            "registration_normalized": f"G-{compact[1:]}",
            "registration_scheme": "UK_G",
            "registration_country_code": "GB",
            "registration_confidence": "high",
            "n_number": None,
        }
    if AU_RE.fullmatch(compact):
        return {
            "registration_normalized": f"VH-{compact[2:]}",
            "registration_scheme": "AU_VH",
            "registration_country_code": "AU",
            "registration_confidence": "high",
            "n_number": None,
        }
    if NZ_RE.fullmatch(compact):
        return {
            "registration_normalized": f"ZK-{compact[2:]}",
            "registration_scheme": "NZ_ZK",
            "registration_country_code": "NZ",
            "registration_confidence": "high",
            "n_number": None,
        }
    if DE_RE.fullmatch(compact):
        return {
            "registration_normalized": f"D-{compact[1:]}",
            "registration_scheme": "DE_D",
            "registration_country_code": "DE",
            "registration_confidence": "high",
            "n_number": None,
        }
    if FR_RE.fullmatch(compact):
        return {
            "registration_normalized": f"F-{compact[1:]}",
            "registration_scheme": "FR_F",
            "registration_country_code": "FR",
            "registration_confidence": "high",
            "n_number": None,
        }
    if ES_RE.fullmatch(compact):
        return {
            "registration_normalized": f"EC-{compact[2:]}",
            "registration_scheme": "ES_EC",
            "registration_country_code": "ES",
            "registration_confidence": "high",
            "n_number": None,
        }
    if MX_RE.fullmatch(compact):
        return {
            "registration_normalized": f"{compact[:2]}-{compact[2:]}",
            "registration_scheme": "MX_X",
            "registration_country_code": "MX",
            "registration_confidence": "high",
            "n_number": None,
        }
    if BR_RE.fullmatch(compact):
        return {
            "registration_normalized": f"{compact[:2]}-{compact[2:]}",
            "registration_scheme": "BR_P",
            "registration_country_code": "BR",
            "registration_confidence": "high",
            "n_number": None,
        }

    hyphen = re.sub(r"[^A-Z0-9\-]", "", cleaned)
    if GENERIC_HYPHEN_RE.fullmatch(hyphen):
        return {
            "registration_normalized": hyphen,
            "registration_scheme": "OTHER",
            "registration_country_code": None,
            "registration_confidence": "medium",
            "n_number": None,
        }

    # Avoid persisting obvious free-text residue as registration data.
    if NOISE_TOKEN_RE.fullmatch(compact):
        return {
            "registration_normalized": None,
            "registration_scheme": "UNKNOWN",
            "registration_country_code": None,
            "registration_confidence": "low",
            "n_number": None,
        }

    return {
        "registration_normalized": compact if compact else cleaned,
        "registration_scheme": "OTHER",
        "registration_country_code": None,
        "registration_confidence": "low",
        "n_number": None,
    }


def derive_registration_fields(raw_value: str | None, fallback_text: str | None = None) -> dict[str, str | None]:
    selected_raw = _clean_text(_sanitize_candidate(raw_value))
    inferred_from_fallback = False
    if not selected_raw and fallback_text:
        selected_raw = _clean_text(_sanitize_candidate(extract_registration_from_text(fallback_text)))
        inferred_from_fallback = bool(selected_raw)

    classified = classify_registration(selected_raw)
    if inferred_from_fallback and classified["registration_scheme"] == "UNKNOWN":
        selected_raw = ""
    return {
        "registration_raw": selected_raw or None,
        "registration_normalized": classified["registration_normalized"],
        "registration_scheme": classified["registration_scheme"],
        "registration_country_code": classified["registration_country_code"],
        "registration_confidence": classified["registration_confidence"],
        "n_number": classified["n_number"],
    }


def apply_registration_fields(
    target: dict[str, Any],
    raw_value: str | None,
    fallback_text: str | None = None,
    *,
    keep_existing_n_number: bool = True,
) -> dict[str, Any]:
    fields = derive_registration_fields(raw_value=raw_value, fallback_text=fallback_text)
    existing_scheme = str(target.get("registration_scheme") or "").strip().upper()
    incoming_scheme = str(fields.get("registration_scheme") or "").strip().upper()
    if existing_scheme and existing_scheme != "UNKNOWN" and incoming_scheme == "UNKNOWN":
        return target

    for key in (
        "registration_raw",
        "registration_normalized",
        "registration_scheme",
        "registration_country_code",
        "registration_confidence",
    ):
        # Keep prior normalized registration when incoming parse is weak/unknown.
        if key == "registration_normalized" and target.get(key) and not fields.get(key):
            continue
        if fields.get(key) is not None:
            target[key] = fields[key]
    if fields.get("n_number"):
        target["n_number"] = fields["n_number"]
    elif not keep_existing_n_number:
        target["n_number"] = None
    return target

