"""
Listing model display normalization and comp-family resolution for market comps.
"""

from __future__ import annotations

import re

from scraper.config import COMP_FAMILY_GROUPS

MODEL_CASE_OVERRIDES = {
    "king air c90gtx": "King Air C90GTX",
    "king air c90gt": "King Air C90GT",
    "king air b200gt": "King Air B200GT",
    "king air b200gtr": "King Air B200GTR",
    "king air 350er": "King Air 350ER",
    "king air 350ier": "King Air 350iER",
    "g1000": "G1000",
    "g600": "G600",
    "gfc500": "GFC500",
}


def _normalize_spaces(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip())


def normalize_model_case(make: str, model: str) -> str:
    """
    Title-case the model string with known overrides; collapse whitespace.
    `make` is reserved for future make-specific rules.
    """
    _ = make
    s = _normalize_spaces(str(model or ""))
    if not s:
        return ""
    key = s.lower()
    if key in MODEL_CASE_OVERRIDES:
        return MODEL_CASE_OVERRIDES[key]
    return s.title()


def _model_in_family(model_n: str, family_models: list[str]) -> bool:
    """True if normalized model string belongs to the given comp family token list."""
    if not model_n:
        return False
    for fm in family_models:
        fl = fm.lower().strip()
        if model_n == fl:
            return True
        if fl.endswith(" " + model_n) or fl.endswith("-" + model_n):
            return True
        if fl.split() and model_n == fl.split()[-1] and len(model_n) <= 8:
            if fl.endswith(" " + model_n) or fl == model_n:
                return True
    return False


def resolve_comp_family_key(make: str, model: str) -> tuple[str, str] | None:
    """
    Returns (make_normalized, family_slug) when model maps to a comp family, else None.
    """
    make_n = str(make or "").strip().lower()
    if not make_n or not str(model or "").strip():
        return None
    model_n = _normalize_spaces(str(model).lower())
    for (mk, slug), models in COMP_FAMILY_GROUPS.items():
        if mk != make_n:
            continue
        if _model_in_family(model_n, models):
            return (make_n, slug)
    return None


def resolve_comp_family(make: str, model: str) -> list[str] | None:
    """
    If the listing matches a comp family, return that family's full model token list (lowercase).
    Otherwise None — callers should fall back to exact model match.
    """
    key = resolve_comp_family_key(make, model)
    if not key:
        return None
    mk, slug = key
    return list(COMP_FAMILY_GROUPS.get((mk, slug), []))
