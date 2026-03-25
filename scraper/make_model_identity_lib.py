"""
Shared helpers for make/model audit + backfill (see make_model_rules.json).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

_RULES_PATH = Path(__file__).resolve().parent / "data" / "identity" / "make_model_rules.json"


def rules_path() -> Path:
    return _RULES_PATH


def load_rules(path: Path | None = None) -> dict[str, Any]:
    p = path or _RULES_PATH
    with p.open("r", encoding="utf-8") as f:
        return json.load(f)


def normalize_compare(s: str | None) -> str:
    if not s:
        return ""
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def token_set(s: str | None) -> set[str]:
    if not s:
        return set()
    parts = re.split(r"[^a-z0-9]+", s.lower())
    return {p for p in parts if len(p) >= 2}


def token_jaccard(a: str | None, b: str | None) -> float:
    sa, sb = token_set(a), token_set(b)
    if not sa and not sb:
        return 1.0
    if not sa or not sb:
        return 0.0
    inter = len(sa & sb)
    union = len(sa | sb)
    return inter / union if union else 0.0


def titleish_words(s: str) -> str:
    """Light title-case without wrecking 'PA-24-250'."""
    out: list[str] = []
    for w in s.split():
        if re.match(r"^[\dA-Z]{2,}[\d\-A-Z]*$", w):
            out.append(w)
        elif "-" in w:
            out.append("-".join(x[:1].upper() + x[1:].lower() if x else x for x in w.split("-")))
        else:
            out.append(w[:1].upper() + w[1:].lower() if w else w)
    return " ".join(out).strip()


def build_listing_title(year: int | None, make: str | None, model: str | None) -> str:
    parts: list[str] = []
    if year and year > 1900:
        parts.append(str(year))
    if make:
        parts.append(make.strip())
    if model:
        parts.append(model.strip())
    return " ".join(parts).strip() or "Aircraft Listing"


@dataclass
class CuratedResult:
    make: str
    model: str | None
    rule_id: str
    kind: str


def apply_curated_rules(
    make: str | None,
    model: str | None,
    rules: dict[str, Any],
) -> CuratedResult | None:
    m = (make or "").strip()
    mo = (model or "").strip() or None
    if not m:
        return None

    # Longest prefix wins
    prefix_rules = sorted(
        rules.get("make_prefix_merge") or [],
        key=lambda r: len(str(r.get("prefix") or "")),
        reverse=True,
    )
    for pr in prefix_rules:
        prefix = str(pr.get("prefix") or "")
        if not prefix:
            continue
        if m.lower().startswith(prefix.lower()):
            canonical = str(pr.get("canonical_make") or "").strip()
            if not canonical:
                continue
            rest = m[len(prefix) :].strip()
            default_pref = str(pr.get("model_prefix_default") or "").strip()
            pieces: list[str] = []
            if default_pref:
                pieces.append(default_pref)
            if rest:
                pieces.append(rest)
            if mo:
                pieces.append(mo)
            new_model = " ".join(pieces).strip() or None
            return CuratedResult(
                make=titleish_words(canonical),
                model=new_model,
                rule_id=str(pr.get("id") or "make_prefix_merge"),
                kind="make_prefix_merge",
            )

    m_lower = m.lower()
    for entry in rules.get("model_as_make") or []:
        wrong = str(entry.get("wrong_make") or "").strip()
        if not wrong:
            continue
        if m_lower != wrong.lower():
            continue
        canonical = str(entry.get("canonical_make") or "").strip()
        if not canonical:
            continue
        prepend = bool(entry.get("prepend_wrong_make_to_model", True))
        if prepend:
            tail = mo or ""
            new_model = f"{wrong} {tail}".strip()
        else:
            new_model = mo
        return CuratedResult(
            make=titleish_words(canonical),
            model=new_model or None,
            rule_id=str(entry.get("id") or "model_as_make"),
            kind="model_as_make",
        )

    for entry in rules.get("make_display_aliases") or []:
        match = str(entry.get("match") or "").strip()
        canonical = str(entry.get("canonical") or "").strip()
        if not match or not canonical:
            continue
        if m.upper() == match.upper() and m != canonical:
            return CuratedResult(
                make=canonical,
                model=mo,
                rule_id=f"alias:{match}",
                kind="make_display_alias",
            )

    return None


def _faa_would_degrade_listing_identity(lm: str, lmo: str, fm: str, fmdl: str, j_mdl: float) -> bool:
    """
    Block FAA-only swaps that harm UX (seen in dry-runs): e.g. Beechcraft + B58 BARON -> BEECH + 58.
    """
    ll = lm.lower().strip()
    fmu = fm.strip().upper().replace(".", "")

    if ll == "beechcraft" and fmu == "BEECH":
        return True

    if ll == "diamond" and "diamond" in fm.lower():
        return True

    # Good listing make + rich model text; FAA model token is a poor / much shorter match.
    _keep_make = frozenset(
        {
            "beechcraft",
            "cessna",
            "piper",
            "cirrus",
            "diamond",
            "mooney",
            "pilatus",
            "gulfstream",
            "bombardier",
            "dassault",
            "embraer",
            "airbus",
            "bell",
            "robinson",
            "cubcrafters",
        }
    )
    if ll in _keep_make and len(lmo) >= 10 and j_mdl < 0.22 and len(fmdl) + 6 < len(lmo):
        return True

    return False


def faa_identity_suggestion(
    listing_make: str | None,
    listing_model: str | None,
    faa_mfr: str | None,
    faa_mdl: str | None,
    rules: dict[str, Any],
) -> tuple[str, str] | None:
    """
    Conservative suggestion from FAA ACFTREF names.
    Returns (make, model) or None if we should not auto-apply.
    """
    fm = (faa_mfr or "").strip()
    fmdl = (faa_mdl or "").strip()
    if not fm or not fmdl:
        return None

    lm = (listing_make or "").strip()
    lmo = (listing_model or "").strip()

    wrong_makes = {str(e.get("wrong_make") or "").strip().lower() for e in (rules.get("model_as_make") or [])}
    wrong_makes.discard("")

    numeric_make = bool(lm) and lm.replace(" ", "").isdigit()
    model_as_make = lm.lower() in wrong_makes

    j_mfr = token_jaccard(lm, fm)
    j_mdl = token_jaccard(lmo, fmdl)

    if lm and _faa_would_degrade_listing_identity(lm, lmo, fm, fmdl, j_mdl):
        return None

    nm_l = normalize_compare(lm)
    nm_f = normalize_compare(fm)
    same_make = bool(nm_l and nm_l == nm_f)

    if same_make and j_mdl >= 0.35:
        return None
    if same_make and not lmo:
        return titleish_words(fm), titleish_words(fmdl)

    if numeric_make or model_as_make:
        return titleish_words(fm), titleish_words(fmdl)

    if lm and not same_make and j_mfr < 0.25 and j_mdl < 0.2:
        return titleish_words(fm), titleish_words(fmdl)

    if lm and not same_make and j_mfr < 0.4 and lmo and j_mdl < 0.15:
        return titleish_words(fm), titleish_words(fmdl)

    return None


def should_promote_faa_make_model(
    listing_make: str | None,
    listing_model: str | None,
    faa_mfr: str | None,
    faa_mdl: str | None,
    identity_correction: Any,
    rules: dict[str, Any],
) -> tuple[str, str] | None:
    """Runtime gate for enrich_faa: never override curated corrections."""
    if identity_correction:
        return None
    return faa_identity_suggestion(listing_make, listing_model, faa_mfr, faa_mdl, rules)
