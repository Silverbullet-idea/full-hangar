"""
Shared listing schema sanitizer used by scraper pipelines.

Several source scrapers import `validate_listing` and expect a tuple:
  (cleaned_row: dict, warnings: list[str])
"""

from __future__ import annotations

from typing import Any

from listing_identity_ingest import normalize_scraped_make_model


_INT_FIELDS = {
    "year",
    "asking_price",
    "price_asking",
    "total_time_airframe",
    "engine_time_since_overhaul",
    "time_since_overhaul",
    "time_since_prop_overhaul",
    "time_since_new_engine",
    "price_reduction_amount",
}

_STRING_FIELDS = {
    "source",
    "source_site",
    "listing_source",
    "source_id",
    "source_listing_id",
    "url",
    "source_url",
    "title",
    "make",
    "model",
    "serial_number",
    "n_number",
    "registration_raw",
    "registration_normalized",
    "registration_scheme",
    "registration_country_code",
    "registration_confidence",
    "location_raw",
    "location_city",
    "location_state",
    "state",
    "seller_name",
    "seller_type",
    "description",
    "description_full",
    "primary_image_url",
    "aircraft_type",
}


def _to_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    text = str(value).strip().replace(",", "")
    if not text:
        return None
    try:
        return int(float(text))
    except Exception:
        return None


def _to_string(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def validate_listing(raw: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    cleaned: dict[str, Any] = dict(raw or {})

    for field in _INT_FIELDS:
        if field in cleaned:
            coerced = _to_int(cleaned.get(field))
            if cleaned.get(field) not in (None, "", 0) and coerced is None:
                warnings.append(f"invalid_int:{field}")
            cleaned[field] = coerced

    for field in _STRING_FIELDS:
        if field in cleaned:
            cleaned[field] = _to_string(cleaned.get(field))

    if cleaned.get("price_asking") is None and cleaned.get("asking_price") is not None:
        cleaned["price_asking"] = cleaned["asking_price"]
    if cleaned.get("asking_price") is None and cleaned.get("price_asking") is not None:
        cleaned["asking_price"] = cleaned["price_asking"]

    source_id = cleaned.get("source_id")
    source_url = cleaned.get("url") or cleaned.get("source_url")
    if not source_id and not source_url:
        warnings.append("missing_identity:source_id_or_url")
    if not cleaned.get("source_site"):
        warnings.append("missing_source_site")

    nm, nmdl = normalize_scraped_make_model(cleaned.get("make"), cleaned.get("model"))
    if nm is not None and nm != cleaned.get("make"):
        cleaned["make"] = nm
    if nmdl is not None and nmdl != cleaned.get("model"):
        cleaned["model"] = nmdl

    return cleaned, warnings

