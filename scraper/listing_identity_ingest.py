"""
Apply curated make/model rules at scrape ingest so new rows match identity backfill conventions.

Uses the same rule pack as make_model_identity_lib / backfill_make_model_identity.py.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from make_model_identity_lib import apply_curated_rules, load_rules


@lru_cache(maxsize=1)
def _rules() -> dict[str, Any]:
    return load_rules()


def normalize_scraped_make_model(make: str | None, model: str | None) -> tuple[str | None, str | None]:
    m = (make or "").strip()
    mo = (model or "").strip() or None
    if not m:
        return ((make or "").strip() or None, mo)
    curated = apply_curated_rules(m, mo, _rules())
    if curated:
        out_model = (curated.model or mo or "").strip() or None
        return curated.make, out_model
    return m, mo
