"""
Triage borderline non-aircraft candidates into likely buckets for manual review.

Usage:
    .venv312\\Scripts\\python.exe scraper\\triage_non_aircraft_borderline.py
"""

from __future__ import annotations

import argparse
import json
import os
from collections import Counter
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import create_client

DEFAULT_INPUT = Path("scraper/non_aircraft_borderline_review_latest.json")
DEFAULT_JSON_OUTPUT = Path("scraper/non_aircraft_borderline_triage_latest.json")
DEFAULT_MD_OUTPUT = Path("scraper/non_aircraft_borderline_triage_latest.md")

STRONG_NON_AIRCRAFT_TERMS = (
    "tow bar",
    "towbar",
    "tow-bar",
    "tug",
    "towflexx",
    "ground power unit",
    "gpu",
)

URL_NON_AIRCRAFT_TERMS = (
    "tow-bars",
    "tow-bars-and-tugs",
    "towbar",
    "tugs",
    "tug",
)


def _load_candidate_ids(path: Path) -> list[str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    candidates = payload.get("candidates") if isinstance(payload, dict) else None
    if not isinstance(candidates, list):
        raise SystemExit("Input must be borderline report JSON with `candidates` list.")
    ids = [str(row.get("id")).strip() for row in candidates if isinstance(row, dict) and row.get("id")]
    deduped = sorted(set(ids))
    return deduped


def _load_rows(sb: Any, ids: list[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    chunk_size = 100
    select_cols = (
        "id,source_site,source_id,url,title,description,description_full,"
        "make,model,year,asking_price,price_asking,is_active,seller_name"
    )
    for i in range(0, len(ids), chunk_size):
        chunk = ids[i : i + chunk_size]
        batch = sb.table("aircraft_listings").select(select_cols).in_("id", chunk).execute().data or []
        rows.extend(batch)
    return rows


def _normalized_text(row: dict[str, Any]) -> str:
    return " ".join(
        [
            str(row.get("title") or ""),
            str(row.get("description") or ""),
            str(row.get("description_full") or ""),
            str(row.get("make") or ""),
            str(row.get("model") or ""),
        ]
    ).lower()


def _missing_core_fields(row: dict[str, Any]) -> int:
    missing = 0
    has_price = bool((row.get("asking_price") or 0) > 0 or (row.get("price_asking") or 0) > 0)
    if not row.get("make"):
        missing += 1
    if not row.get("model"):
        missing += 1
    if not row.get("year"):
        missing += 1
    if not has_price:
        missing += 1
    return missing


def _term_hits(row: dict[str, Any]) -> list[str]:
    text = _normalized_text(row)
    url = str(row.get("url") or "").lower()
    hits: list[str] = []
    for term in STRONG_NON_AIRCRAFT_TERMS:
        if term in text:
            hits.append(term)
    for term in URL_NON_AIRCRAFT_TERMS:
        if term in url:
            hits.append(f"url:{term}")
    # Keep unique order
    ordered = []
    for hit in hits:
        if hit not in ordered:
            ordered.append(hit)
    return ordered


def _triage_bucket(row: dict[str, Any]) -> tuple[str, str]:
    hits = _term_hits(row)
    missing = _missing_core_fields(row)
    core_complete = missing == 0

    # Strong signals for non-aircraft listing.
    if any(hit.startswith("url:") for hit in hits):
        return ("likely_non_aircraft", "HIGH")
    if "towflexx" in hits:
        return ("likely_non_aircraft", "HIGH")
    if len(hits) >= 2:
        return ("likely_non_aircraft", "HIGH")

    # Single ambiguous term often appears in legit aircraft descriptions.
    if len(hits) == 1 and core_complete:
        return ("likely_false_positive", "MEDIUM")
    if len(hits) == 1 and missing >= 2:
        return ("manual_review_priority", "MEDIUM")

    return ("likely_false_positive", "LOW")


def _row_summary(row: dict[str, Any]) -> dict[str, Any]:
    bucket, confidence = _triage_bucket(row)
    hits = _term_hits(row)
    return {
        "id": row.get("id"),
        "bucket": bucket,
        "triage_confidence": confidence,
        "source_site": row.get("source_site"),
        "source_id": row.get("source_id"),
        "url": row.get("url"),
        "title": row.get("title"),
        "make": row.get("make"),
        "model": row.get("model"),
        "year": row.get("year"),
        "seller_name": row.get("seller_name"),
        "is_active": bool(row.get("is_active")),
        "missing_core_field_count": _missing_core_fields(row),
        "evidence_hits": hits,
    }


def _write_markdown(path: Path, rows: list[dict[str, Any]]) -> None:
    bucket_counts = Counter(row.get("bucket") for row in rows)
    lines: list[str] = []
    lines.append("# Borderline Non-Aircraft Triage")
    lines.append("")
    lines.append("## Summary")
    lines.append(f"- Total triaged: `{len(rows)}`")
    for key in ("likely_non_aircraft", "manual_review_priority", "likely_false_positive"):
        lines.append(f"- {key}: `{bucket_counts.get(key, 0)}`")
    lines.append("")
    lines.append("## Likely Non-Aircraft")
    lines.append("")
    lines.append("| Source | Listing | Evidence | URL |")
    lines.append("|---|---|---|---|")
    for row in [r for r in rows if r.get("bucket") == "likely_non_aircraft"][:80]:
        listing = f"{row.get('year') or 'N/A'} {row.get('make') or 'N/A'} {row.get('model') or 'N/A'}"
        evidence = ", ".join(row.get("evidence_hits") or []) or "-"
        lines.append(
            f"| {row.get('source_site') or 'N/A'} | {listing} | {evidence} | {row.get('url') or 'N/A'} |"
        )
    lines.append("")
    lines.append("## Manual Review Priority")
    lines.append("")
    lines.append("| Source | Listing | Evidence | URL |")
    lines.append("|---|---|---|---|")
    for row in [r for r in rows if r.get("bucket") == "manual_review_priority"][:80]:
        listing = f"{row.get('year') or 'N/A'} {row.get('make') or 'N/A'} {row.get('model') or 'N/A'}"
        evidence = ", ".join(row.get("evidence_hits") or []) or "-"
        lines.append(
            f"| {row.get('source_site') or 'N/A'} | {listing} | {evidence} | {row.get('url') or 'N/A'} |"
        )
    lines.append("")
    lines.append("## Likely False Positives")
    lines.append("")
    lines.append("| Source | Listing | Evidence | URL |")
    lines.append("|---|---|---|---|")
    for row in [r for r in rows if r.get("bucket") == "likely_false_positive"][:80]:
        listing = f"{row.get('year') or 'N/A'} {row.get('make') or 'N/A'} {row.get('model') or 'N/A'}"
        evidence = ", ".join(row.get("evidence_hits") or []) or "-"
        lines.append(
            f"| {row.get('source_site') or 'N/A'} | {listing} | {evidence} | {row.get('url') or 'N/A'} |"
        )
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Triage borderline non-aircraft candidates")
    parser.add_argument("--input", default=str(DEFAULT_INPUT), help="Borderline input JSON path")
    parser.add_argument("--output-json", default=str(DEFAULT_JSON_OUTPUT), help="Triage JSON output path")
    parser.add_argument("--output-md", default=str(DEFAULT_MD_OUTPUT), help="Triage Markdown output path")
    args = parser.parse_args()

    load_dotenv(Path("scraper/.env"))
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_service_key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not supabase_url or not supabase_service_key:
        raise SystemExit("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in scraper/.env")

    input_path = Path(args.input)
    ids = _load_candidate_ids(input_path)

    sb = create_client(supabase_url, supabase_service_key)
    rows = _load_rows(sb, ids) if ids else []
    summaries = [_row_summary(row) for row in rows]
    summaries.sort(
        key=lambda row: (
            {"likely_non_aircraft": 3, "manual_review_priority": 2, "likely_false_positive": 1}.get(
                str(row.get("bucket")), 0
            ),
            len(row.get("evidence_hits") or []),
            row.get("missing_core_field_count") or 0,
        ),
        reverse=True,
    )

    bucket_counts = Counter(row.get("bucket") for row in summaries)
    report = {
        "input_file": str(input_path),
        "triaged_count": len(summaries),
        "bucket_counts": dict(bucket_counts),
        "rows": summaries,
    }

    output_json_path = Path(args.output_json)
    output_json_path.parent.mkdir(parents=True, exist_ok=True)
    output_json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    output_md_path = Path(args.output_md)
    output_md_path.parent.mkdir(parents=True, exist_ok=True)
    _write_markdown(output_md_path, summaries)

    print("")
    print("Borderline Triage Summary")
    print("=========================")
    print(f"Input file            : {input_path}")
    print(f"Rows triaged          : {len(summaries)}")
    print(f"Likely non-aircraft   : {bucket_counts.get('likely_non_aircraft', 0)}")
    print(f"Manual review priority: {bucket_counts.get('manual_review_priority', 0)}")
    print(f"Likely false positive : {bucket_counts.get('likely_false_positive', 0)}")
    print(f"Output JSON           : {output_json_path}")
    print(f"Output Markdown       : {output_md_path}")


if __name__ == "__main__":
    main()
