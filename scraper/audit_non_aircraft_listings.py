"""
Strict audit for listings that clearly are not aircraft-for-sale rows.

Usage:
    .venv312\\Scripts\\python.exe scraper\\audit_non_aircraft_listings.py
    .venv312\\Scripts\\python.exe scraper\\audit_non_aircraft_listings.py --output scraper\\non_aircraft_review_latest.json
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

DEFAULT_OUTPUT = Path("scraper/non_aircraft_review_latest.json")


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


def _build_candidate(row: dict[str, Any], reasons: list[str]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "source_site": row.get("source_site"),
        "source_id": row.get("source_id"),
        "url": row.get("url"),
        "title": row.get("title"),
        "make": row.get("make"),
        "model": row.get("model"),
        "year": row.get("year"),
        "seller_name": row.get("seller_name"),
        "reasons": reasons,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Strict audit for non-aircraft listing candidates")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="Output JSON path")
    args = parser.parse_args()

    load_dotenv(Path("scraper/.env"))
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_service_key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not supabase_url or not supabase_service_key:
        raise SystemExit("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in scraper/.env")

    sb = create_client(supabase_url, supabase_service_key)
    active_rows = _load_active_rows(sb)

    candidates: list[dict[str, Any]] = []
    reason_counts: Counter[str] = Counter()
    source_counts: Counter[str] = Counter()
    for row in active_rows:
        reasons = _strict_reasons(row)
        if not reasons:
            continue
        candidate = _build_candidate(row, reasons)
        candidates.append(candidate)
        reason_counts.update(reasons)
        source_counts.update([str(candidate.get("source_site") or "unknown")])

    report = {
        "scan_type": "strict_non_aircraft",
        "active_rows_scanned": len(active_rows),
        "candidate_count": len(candidates),
        "reason_counts": dict(reason_counts),
        "source_counts": dict(source_counts),
        "candidates": candidates,
    }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print("")
    print("Non-Aircraft Listing Audit")
    print("==========================")
    print(f"Active rows scanned : {report['active_rows_scanned']}")
    print(f"Candidates found    : {report['candidate_count']}")
    print(f"Output file         : {output_path}")
    if reason_counts:
        print("")
        print("Candidates by reason:")
        for reason, count in sorted(reason_counts.items(), key=lambda item: item[1], reverse=True):
            print(f"- {reason}: {count}")
    if source_counts:
        print("")
        print("Candidates by source:")
        for source, count in sorted(source_counts.items(), key=lambda item: item[1], reverse=True):
            print(f"- {source}: {count}")


if __name__ == "__main__":
    main()
