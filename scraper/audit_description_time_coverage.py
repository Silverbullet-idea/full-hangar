"""
Audit coverage uplift from description-time parsing.

This script estimates potential fill-rate gains (coverage uplift) for selected
time/model fields by comparing current DB values vs parser-extracted values.

Usage:
  .venv312\\Scripts\\python.exe scraper\\audit_description_time_coverage.py --days 90 --limit 3000
  .venv312\\Scripts\\python.exe scraper\\audit_description_time_coverage.py --days 90 --output-json scraper\\description_time_coverage_latest.json --output-md scraper\\description_time_coverage_latest.md
"""

from __future__ import annotations

import argparse
import json
import os
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import create_client

from description_parser import parse_description


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit description parser time/model coverage uplift")
    parser.add_argument("--days", type=int, default=90, help="Lookback window by last_seen_date")
    parser.add_argument("--batch-size", type=int, default=500, help="Supabase page size")
    parser.add_argument("--limit", type=int, default=0, help="Optional max listings to scan (0=all)")
    parser.add_argument("--output-json", default="", help="Optional JSON output file")
    parser.add_argument("--output-md", default="", help="Optional markdown output file")
    return parser.parse_args()


def get_supabase():
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise EnvironmentError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
    return create_client(url, key)


def as_number(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        numeric = float(value)
        return numeric if numeric > 0 else None
    if isinstance(value, str):
        raw = value.strip().replace(",", "")
        if not raw:
            return None
        try:
            numeric = float(raw)
            return numeric if numeric > 0 else None
        except ValueError:
            return None
    return None


def as_text(value: Any) -> str | None:
    if isinstance(value, str):
        text = value.strip()
        return text if text else None
    return None


def write_text(path: str, content: str) -> None:
    if not path:
        return
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def pct(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return round((numerator / denominator) * 100.0, 2)


def main() -> int:
    args = parse_args()

    load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")
    supabase = get_supabase()

    days = max(1, int(args.days))
    cutoff_date = (date.today() - timedelta(days=days)).isoformat()
    batch_size = max(50, int(args.batch_size))
    scan_limit = max(0, int(args.limit))

    field_specs = {
        "engine_time_since_overhaul": "Engine SMOH",
        "time_since_prop_overhaul": "Prop SPOH",
        "prop_model": "Prop Model",
    }

    stats: dict[str, dict[str, int]] = {
        key: {"existing": 0, "parser": 0, "parser_fill_missing": 0} for key in field_specs
    }
    sample_candidates: dict[str, list[dict[str, Any]]] = defaultdict(list)

    scanned = 0
    with_text = 0
    offset = 0

    while True:
        query = (
            supabase.table("aircraft_listings")
            .select(
                "id,source,source_site,source_id,last_seen_date,description,description_full,description_intelligence,"
                "engine_time_since_overhaul,time_since_prop_overhaul,prop_model"
            )
            .eq("is_active", True)
            .gte("last_seen_date", cutoff_date)
            .order("last_seen_date", desc=True)
            .range(offset, offset + batch_size - 1)
        )
        result = query.execute()
        rows = result.data or []
        if not rows:
            break

        for row in rows:
            if scan_limit and scanned >= scan_limit:
                break
            scanned += 1

            description = as_text(row.get("description"))
            description_full = as_text(row.get("description_full"))
            combined_text = "\n".join([value for value in [description_full, description] if value]).strip()
            if not combined_text:
                continue
            with_text += 1

            parsed = parse_description(combined_text, observed_price=None)
            parsed_times = parsed.get("times", {}) if isinstance(parsed, dict) else {}
            parsed_prop = parsed.get("prop", {}) if isinstance(parsed, dict) else {}

            parser_engine_smoh = as_number(parsed_times.get("engine_smoh"))
            parser_prop_spoh = as_number(parsed_times.get("prop_spoh"))
            parser_prop_model = as_text(parsed_prop.get("model"))

            existing_engine_smoh = as_number(row.get("engine_time_since_overhaul"))
            existing_prop_spoh = as_number(row.get("time_since_prop_overhaul"))
            existing_prop_model = as_text(row.get("prop_model"))

            if existing_engine_smoh is not None:
                stats["engine_time_since_overhaul"]["existing"] += 1
            if parser_engine_smoh is not None:
                stats["engine_time_since_overhaul"]["parser"] += 1
                if existing_engine_smoh is None:
                    stats["engine_time_since_overhaul"]["parser_fill_missing"] += 1

            if existing_prop_spoh is not None:
                stats["time_since_prop_overhaul"]["existing"] += 1
            if parser_prop_spoh is not None:
                stats["time_since_prop_overhaul"]["parser"] += 1
                if existing_prop_spoh is None:
                    stats["time_since_prop_overhaul"]["parser_fill_missing"] += 1

            if existing_prop_model is not None:
                stats["prop_model"]["existing"] += 1
            if parser_prop_model is not None:
                stats["prop_model"]["parser"] += 1
                if existing_prop_model is None:
                    stats["prop_model"]["parser_fill_missing"] += 1
                    if len(sample_candidates["prop_model"]) < 12:
                        sample_candidates["prop_model"].append(
                            {
                                "id": row.get("id"),
                                "source": row.get("source") or row.get("source_site"),
                                "source_id": row.get("source_id"),
                                "parsed_prop_model": parser_prop_model,
                            }
                        )

            if parser_prop_spoh is not None and existing_prop_spoh is None and len(sample_candidates["time_since_prop_overhaul"]) < 12:
                sample_candidates["time_since_prop_overhaul"].append(
                    {
                        "id": row.get("id"),
                        "source": row.get("source") or row.get("source_site"),
                        "source_id": row.get("source_id"),
                        "parsed_prop_spoh": parser_prop_spoh,
                    }
                )

        if scan_limit and scanned >= scan_limit:
            break
        if len(rows) < batch_size:
            break
        offset += batch_size

    summary_rows = []
    for key, label in field_specs.items():
        existing = stats[key]["existing"]
        parser_count = stats[key]["parser"]
        fill_missing = stats[key]["parser_fill_missing"]
        baseline_coverage = pct(existing, with_text)
        combined_count = existing + fill_missing
        combined_coverage = pct(combined_count, with_text)
        coverage_uplift_points = round(combined_coverage - baseline_coverage, 2)
        fill_of_missing = pct(fill_missing, max(0, with_text - existing))
        summary_rows.append(
            {
                "field": key,
                "label": label,
                "existing_count": existing,
                "parser_count": parser_count,
                "parser_fill_missing_count": fill_missing,
                "baseline_coverage_pct": baseline_coverage,
                "combined_coverage_pct": combined_coverage,
                "coverage_uplift_pct_points": coverage_uplift_points,
                "fill_rate_of_missing_pct": fill_of_missing,
            }
        )

    report = {
        "lookback_days": days,
        "cutoff_date": cutoff_date,
        "listings_scanned": scanned,
        "listings_with_description_text": with_text,
        "notes": [
            "Coverage uplift estimates parser-fill potential only; not precision/ground-truth accuracy.",
            "Use sampled candidates for manual validation before trusting score-impacting logic.",
        ],
        "summary": summary_rows,
        "sample_candidates": sample_candidates,
    }

    md_lines = [
        "# Description Time Coverage Audit",
        "",
        f"- Lookback days: **{days}**",
        f"- Cutoff date: **{cutoff_date}**",
        f"- Listings scanned: **{scanned}**",
        f"- Listings with description text: **{with_text}**",
        "",
        "| Field | Baseline Coverage | Combined Coverage | Uplift (pp) | Missing Filled | Fill Rate of Missing |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for row in summary_rows:
        md_lines.append(
            f"| {row['label']} | {row['baseline_coverage_pct']}% ({row['existing_count']}) | "
            f"{row['combined_coverage_pct']}% | {row['coverage_uplift_pct_points']} | "
            f"{row['parser_fill_missing_count']} | {row['fill_rate_of_missing_pct']}% |"
        )
    md_lines.extend(
        [
            "",
            "## Notes",
            "",
            "- Coverage uplift is a proxy for potential completeness gain, not strict accuracy.",
            "- Review sampled candidates before any score-impacting rollout.",
            "",
        ]
    )

    if sample_candidates.get("prop_model"):
        md_lines.append("## Sample Parsed Prop Models (missing in DB)")
        md_lines.append("")
        for row in sample_candidates["prop_model"][:8]:
            md_lines.append(
                f"- `{row.get('id')}` ({row.get('source')}:{row.get('source_id')}): `{row.get('parsed_prop_model')}`"
            )
        md_lines.append("")

    if sample_candidates.get("time_since_prop_overhaul"):
        md_lines.append("## Sample Parsed Prop SPOH (missing in DB)")
        md_lines.append("")
        for row in sample_candidates["time_since_prop_overhaul"][:8]:
            md_lines.append(
                f"- `{row.get('id')}` ({row.get('source')}:{row.get('source_id')}): `{row.get('parsed_prop_spoh')}`"
            )
        md_lines.append("")

    print(json.dumps(report, indent=2))
    write_text(args.output_json, json.dumps(report, indent=2))
    write_text(args.output_md, "\n".join(md_lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
