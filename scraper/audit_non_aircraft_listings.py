"""
Hybrid non-aircraft audit for strict auto-hide and borderline manual review.

Usage:
    .venv312\\Scripts\\python.exe scraper\\audit_non_aircraft_listings.py
    .venv312\\Scripts\\python.exe scraper\\audit_non_aircraft_listings.py --strict-output scraper\\non_aircraft_strict_candidates_latest.json --borderline-output scraper\\non_aircraft_borderline_review_latest.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
from collections import Counter
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import create_client

DEFAULT_STRICT_OUTPUT = Path("scraper/non_aircraft_strict_candidates_latest.json")
DEFAULT_BORDERLINE_OUTPUT = Path("scraper/non_aircraft_borderline_review_latest.json")
DEFAULT_COMBINED_OUTPUT = Path("scraper/non_aircraft_review_latest.json")

STRICT_REASON_CONFIDENCE: dict[str, str] = {
    "placeholder_liner_row": "HIGH",
    "wanted_ad": "HIGH",
    "appraisal_ad_not_listing": "HIGH",
    "ground_equipment_listing": "HIGH",
}

BORDERLINE_REASON_CONFIDENCE: dict[str, str] = {
    "sparse_core_fields": "MEDIUM",
    "ad_copy_phrase": "MEDIUM",
    "ground_equipment_hint": "MEDIUM",
    "placeholder_like_source_id": "MEDIUM",
}

WEAK_AD_COPY_PHRASES = (
    "call today",
    "free written appraisal",
    "guaranteed offer to purchase",
    "we buy aircraft",
    "consignment wanted",
    "want to know what your airplane is worth",
)

GROUND_EQUIPMENT_STRONG_TEXT_HINTS = (
    "towflexx",
    "tugs/slash/tow bars",
    "tow bars and tugs",
)

GROUND_EQUIPMENT_STRONG_URL_HINTS = (
    "tugs-slash-tow-bars",
    "tow-bars-and-tugs",
    "towflexx",
)


def _load_active_rows(sb: Any, batch_size: int = 1000) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    select_cols = (
        "id,source_site,source_id,url,title,description,description_full,"
        "make,model,year,asking_price,price_asking,is_active,seller_name"
    )
    while True:
        batch = (
            sb.table("aircraft_listings")
            .select(select_cols)
            .eq("is_active", True)
            .range(offset, offset + batch_size - 1)
            .execute()
            .data
            or []
        )
        rows.extend(batch)
        if len(batch) < batch_size:
            break
        offset += batch_size
    return rows


def _join_text(row: dict[str, Any]) -> str:
    return " ".join(
        [
            str(row.get("title") or ""),
            str(row.get("description") or ""),
            str(row.get("description_full") or ""),
            str(row.get("model") or ""),
        ]
    ).lower()


def _is_critical_fields_missing(row: dict[str, Any]) -> bool:
    has_price = bool((row.get("asking_price") or 0) > 0 or (row.get("price_asking") or 0) > 0)
    return (not row.get("make")) and (not row.get("model")) and (not row.get("year")) and (not has_price)


def _missing_core_field_count(row: dict[str, Any]) -> int:
    has_price = bool((row.get("asking_price") or 0) > 0 or (row.get("price_asking") or 0) > 0)
    missing = 0
    if not row.get("make"):
        missing += 1
    if not row.get("model"):
        missing += 1
    if not row.get("year"):
        missing += 1
    if not has_price:
        missing += 1
    return missing


def _strict_reasons(row: dict[str, Any]) -> list[str]:
    reasons: list[str] = []
    source_id = str(row.get("source_id") or "").strip().lower()
    url = str(row.get("url") or "").strip().lower()
    make = str(row.get("make") or "").strip().lower()
    model = str(row.get("model") or "").strip().lower()
    text = _join_text(row)

    if re.match(r"^liner\d+$", source_id):
        reasons.append("placeholder_liner_row")

    if "wanted -" in text:
        reasons.append("wanted_ad")

    if ("free written appraisal" in text or "guaranteed offer to purchase" in text) and _is_critical_fields_missing(row):
        reasons.append("appraisal_ad_not_listing")

    if ("tugs-slash-tow-bars" in url) or ("towflexx" in make) or ("towflexx" in model):
        reasons.append("ground_equipment_listing")

    return reasons


def _borderline_reasons(row: dict[str, Any], strict_reasons: list[str]) -> list[str]:
    if strict_reasons:
        return []

    reasons: list[str] = []
    source_id = str(row.get("source_id") or "").strip().lower()
    url = str(row.get("url") or "").strip().lower()
    text = _join_text(row)
    missing_core = _missing_core_field_count(row)

    if missing_core >= 3:
        reasons.append("sparse_core_fields")

    if any(phrase in text for phrase in WEAK_AD_COPY_PHRASES):
        reasons.append("ad_copy_phrase")

    strong_ground_text = any(hint in text for hint in GROUND_EQUIPMENT_STRONG_TEXT_HINTS)
    strong_ground_url = any(hint in url for hint in GROUND_EQUIPMENT_STRONG_URL_HINTS)
    if strong_ground_text or strong_ground_url:
        reasons.append("ground_equipment_hint")

    if source_id.startswith("liner") and not re.match(r"^liner\d+$", source_id):
        reasons.append("placeholder_like_source_id")

    # Borderline classification rule:
    # - ad-like + sparse fields
    # - or ground-equipment hint
    # - or placeholder-like source ID
    allow_borderline = (
        ("ad_copy_phrase" in reasons and "sparse_core_fields" in reasons)
        or ("ground_equipment_hint" in reasons)
        or ("placeholder_like_source_id" in reasons)
    )
    return reasons if allow_borderline else []


def _build_candidate(row: dict[str, Any], reasons: list[str], confidence_by_reason: dict[str, str], bucket: str) -> dict[str, Any]:
    unique_reasons = []
    for reason in reasons:
        if reason not in unique_reasons:
            unique_reasons.append(reason)
    return {
        "bucket": bucket,
        "id": row.get("id"),
        "source_site": row.get("source_site"),
        "source_id": row.get("source_id"),
        "url": row.get("url"),
        "title": row.get("title"),
        "make": row.get("make"),
        "model": row.get("model"),
        "year": row.get("year"),
        "seller_name": row.get("seller_name"),
        "reasons": unique_reasons,
        "reason_confidence": {reason: confidence_by_reason.get(reason, "MEDIUM") for reason in unique_reasons},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Hybrid audit for non-aircraft listing candidates")
    parser.add_argument("--strict-output", default=str(DEFAULT_STRICT_OUTPUT), help="Strict candidate JSON output path")
    parser.add_argument(
        "--borderline-output",
        default=str(DEFAULT_BORDERLINE_OUTPUT),
        help="Borderline candidate JSON output path",
    )
    parser.add_argument(
        "--combined-output",
        default=str(DEFAULT_COMBINED_OUTPUT),
        help="Combined compatibility JSON output path",
    )
    args = parser.parse_args()

    load_dotenv(Path("scraper/.env"))
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_service_key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not supabase_url or not supabase_service_key:
        raise SystemExit("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in scraper/.env")

    sb = create_client(supabase_url, supabase_service_key)
    active_rows = _load_active_rows(sb)

    strict_candidates: list[dict[str, Any]] = []
    borderline_candidates: list[dict[str, Any]] = []
    strict_reason_counts: Counter[str] = Counter()
    borderline_reason_counts: Counter[str] = Counter()
    strict_source_counts: Counter[str] = Counter()
    borderline_source_counts: Counter[str] = Counter()
    for row in active_rows:
        strict_reasons = _strict_reasons(row)
        if strict_reasons:
            candidate = _build_candidate(
                row,
                strict_reasons,
                STRICT_REASON_CONFIDENCE,
                bucket="strict",
            )
            strict_candidates.append(candidate)
            strict_reason_counts.update(candidate["reasons"])
            strict_source_counts.update([str(candidate.get("source_site") or "unknown")])
            continue

        borderline_reasons = _borderline_reasons(row, strict_reasons)
        if borderline_reasons:
            candidate = _build_candidate(
                row,
                borderline_reasons,
                BORDERLINE_REASON_CONFIDENCE,
                bucket="borderline",
            )
            borderline_candidates.append(candidate)
            borderline_reason_counts.update(candidate["reasons"])
            borderline_source_counts.update([str(candidate.get("source_site") or "unknown")])

    strict_report = {
        "scan_type": "strict_non_aircraft",
        "active_rows_scanned": len(active_rows),
        "candidate_count": len(strict_candidates),
        "reason_counts": dict(strict_reason_counts),
        "source_counts": dict(strict_source_counts),
        "candidates": strict_candidates,
    }
    borderline_report = {
        "scan_type": "borderline_non_aircraft",
        "active_rows_scanned": len(active_rows),
        "candidate_count": len(borderline_candidates),
        "reason_counts": dict(borderline_reason_counts),
        "source_counts": dict(borderline_source_counts),
        "candidates": borderline_candidates,
    }
    combined_report = {
        "scan_type": "hybrid_non_aircraft",
        "active_rows_scanned": len(active_rows),
        "strict_candidate_count": len(strict_candidates),
        "borderline_candidate_count": len(borderline_candidates),
        "strict_reason_counts": dict(strict_reason_counts),
        "borderline_reason_counts": dict(borderline_reason_counts),
        "strict_source_counts": dict(strict_source_counts),
        "borderline_source_counts": dict(borderline_source_counts),
        "strict_candidates": strict_candidates,
        "borderline_candidates": borderline_candidates,
    }

    strict_output_path = Path(args.strict_output)
    strict_output_path.parent.mkdir(parents=True, exist_ok=True)
    strict_output_path.write_text(json.dumps(strict_report, indent=2), encoding="utf-8")

    borderline_output_path = Path(args.borderline_output)
    borderline_output_path.parent.mkdir(parents=True, exist_ok=True)
    borderline_output_path.write_text(json.dumps(borderline_report, indent=2), encoding="utf-8")

    combined_output_path = Path(args.combined_output)
    combined_output_path.parent.mkdir(parents=True, exist_ok=True)
    combined_output_path.write_text(json.dumps(combined_report, indent=2), encoding="utf-8")

    print("")
    print("Non-Aircraft Listing Hybrid Audit")
    print("=================================")
    print(f"Active rows scanned     : {combined_report['active_rows_scanned']}")
    print(f"Strict candidates       : {combined_report['strict_candidate_count']}")
    print(f"Borderline candidates   : {combined_report['borderline_candidate_count']}")
    print(f"Strict output           : {strict_output_path}")
    print(f"Borderline output       : {borderline_output_path}")
    print(f"Combined output         : {combined_output_path}")
    if strict_reason_counts:
        print("")
        print("Strict candidates by reason:")
        for reason, count in sorted(strict_reason_counts.items(), key=lambda item: item[1], reverse=True):
            print(f"- {reason}: {count}")
    if borderline_reason_counts:
        print("")
        print("Borderline candidates by reason:")
        for reason, count in sorted(borderline_reason_counts.items(), key=lambda item: item[1], reverse=True):
            print(f"- {reason}: {count}")
    if strict_source_counts:
        print("")
        print("Strict candidates by source:")
        for source, count in sorted(strict_source_counts.items(), key=lambda item: item[1], reverse=True):
            print(f"- {source}: {count}")
    if borderline_source_counts:
        print("")
        print("Borderline candidates by source:")
        for source, count in sorted(borderline_source_counts.items(), key=lambda item: item[1], reverse=True):
            print(f"- {source}: {count}")


if __name__ == "__main__":
    main()
