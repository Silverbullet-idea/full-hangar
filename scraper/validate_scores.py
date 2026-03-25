"""
Validate scored aircraft listings and print a readable report.

Usage:
  python validate_scores.py
  python validate_scores.py --make Cessna
"""

from __future__ import annotations

import argparse
import os
import statistics
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv()

PAGE_SIZE = 1000

# Ensure imports from project root work even when launched from scraper/.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def get_supabase():
    """Create Supabase client using service credentials from .env."""
    from supabase import create_client

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise EnvironmentError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env")
    return create_client(url, key)


def resolve_default_intelligence_version() -> str:
    """
    Resolve the current intelligence version from scoring engine source-of-truth.
    """
    from core.intelligence.aircraft_intelligence import INTELLIGENCE_VERSION

    return str(INTELLIGENCE_VERSION)


def safe_float(value: Any) -> float | None:
    """Best-effort numeric conversion for DB values."""
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def fetch_listings(
    supabase,
    *,
    intelligence_version: str,
    make_filter: str | None = None,
) -> list[dict[str, Any]]:
    """Fetch listings by intelligence_version (and optional make) with pagination."""
    select_cols = ",".join(
        [
            "id",
            "source_id",
            "source",
            "year",
            "make",
            "model",
            "asking_price",
            "risk_level",
            "value_score",
            "flip_score",
            "flip_tier",
            "engine_score",
            "deferred_total",
        ]
    )

    rows: list[dict[str, Any]] = []
    offset = 0

    while True:
        query = (
            supabase.table("aircraft_listings")
            .select(select_cols)
            .eq("intelligence_version", intelligence_version)
            .order("id", desc=False)
            .range(offset, offset + PAGE_SIZE - 1)
        )
        if make_filter:
            query = query.ilike("make", make_filter.strip())

        page = query.execute().data or []
        if not page:
            break

        rows.extend(page)
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE

    return rows


def avg(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def fmt_num(value: float | None, decimals: int = 2) -> str:
    if value is None:
        return "N/A"
    return f"{value:.{decimals}f}"


def fmt_money(value: float | None) -> str:
    if value is None:
        return "N/A"
    return f"${value:,.0f}"


def listing_label(row: dict[str, Any]) -> str:
    year = row.get("year") or "?"
    make = row.get("make") or "UnknownMake"
    model = row.get("model") or "UnknownModel"
    source = row.get("source") or "unknown"
    source_id = row.get("source_id") or row.get("id") or "?"
    return f"{year} {make} {model} | source={source} | id={source_id}"


def print_section(title: str) -> None:
    print()
    print(f"=== {title} ===")


def print_ranked_list(
    rows: list[dict[str, Any]],
    *,
    metric_key: str,
    descending: bool,
    max_rows: int = 25,
) -> None:
    if not rows:
        print("None")
        return

    sortable = [(row, safe_float(row.get(metric_key))) for row in rows]
    sortable = [item for item in sortable if item[1] is not None]
    sortable.sort(key=lambda item: item[1], reverse=descending)

    for idx, (row, metric_value) in enumerate(sortable[:max_rows], start=1):
        deferred = safe_float(row.get("deferred_total"))
        value_score = safe_float(row.get("value_score"))
        engine_score = safe_float(row.get("engine_score"))
        print(
            f"{idx:>2}. {listing_label(row)} | deferred={fmt_money(deferred)} | "
            f"value_score={fmt_num(value_score)} | engine_score={fmt_num(engine_score)}"
        )

    if len(sortable) > max_rows:
        print(f"... {len(sortable) - max_rows} more rows not shown")


def build_report(
    rows: list[dict[str, Any]],
    make_filter: str | None,
    intelligence_version: str,
) -> None:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    risk_counts = Counter()
    value_scores_all: list[float] = []
    value_scores_by_make: dict[str, list[float]] = defaultdict(list)

    high_deferred_rows: list[dict[str, Any]] = []
    potential_deals_rows: list[dict[str, Any]] = []
    low_engine_rows: list[dict[str, Any]] = []
    null_value_rows: list[dict[str, Any]] = []

    for row in rows:
        risk = (row.get("risk_level") or "").strip().upper()
        if risk in {"LOW", "MODERATE", "HIGH", "CRITICAL"}:
            risk_counts[risk] += 1

        make = (row.get("make") or "Unknown").strip()
        value_score = safe_float(row.get("value_score"))
        engine_score = safe_float(row.get("engine_score"))
        deferred_total = safe_float(row.get("deferred_total"))

        if value_score is None:
            null_value_rows.append(row)
        else:
            value_scores_all.append(value_score)
            value_scores_by_make[make].append(value_score)

        if deferred_total is not None and deferred_total > 50000:
            high_deferred_rows.append(row)
        if value_score is not None and value_score > 80:
            potential_deals_rows.append(row)
        if engine_score is not None and engine_score < 20:
            low_engine_rows.append(row)

    print("Aircraft Scoring Validation Report")
    print("----------------------------------")
    print(f"Generated: {now}")
    print(f"Intelligence version: {intelligence_version}")
    print(f"Make filter: {make_filter or 'ALL'}")

    print_section("1) Total listings scored")
    print(f"Total listings scored: {len(rows)}")

    print_section("2) Score distribution by risk")
    print(f"LOW:      {risk_counts['LOW']}")
    print(f"MODERATE: {risk_counts['MODERATE']}")
    print(f"HIGH:     {risk_counts['HIGH']}")
    print(f"CRITICAL: {risk_counts['CRITICAL']}")

    print_section("3) Average value_score (overall and by make)")
    print(f"Overall average value_score: {fmt_num(avg(value_scores_all))}")
    if not value_scores_by_make:
        print("By make: None")
    else:
        for make in sorted(value_scores_by_make):
            make_avg = avg(value_scores_by_make[make])
            print(f"- {make}: {fmt_num(make_avg)} (n={len(value_scores_by_make[make])})")

    print_section("3b) Score spread & tie-rate")
    if not value_scores_all:
        print("No non-null value scores.")
    else:
        score_counts = Counter(round(v, 1) for v in value_scores_all)
        unique_count = len(score_counts)
        top_score, top_count = score_counts.most_common(1)[0]
        tie_rate = (top_count / len(value_scores_all)) * 100
        min_score = min(value_scores_all)
        max_score = max(value_scores_all)
        std_dev = statistics.pstdev(value_scores_all) if len(value_scores_all) > 1 else 0.0
        print(f"Unique score values: {unique_count}")
        print(f"Min / Max value_score: {fmt_num(min_score)} / {fmt_num(max_score)}")
        print(f"Population stddev: {fmt_num(std_dev)}")
        print(f"Most common score: {fmt_num(top_score)} (n={top_count}, {tie_rate:.1f}% of listings)")

    print_section("4) Listings where deferred_total > 50000")
    print(f"Count: {len(high_deferred_rows)}")
    print_ranked_list(high_deferred_rows, metric_key="deferred_total", descending=True)

    print_section("5) Listings where value_score > 80")
    print(f"Count: {len(potential_deals_rows)}")
    print_ranked_list(potential_deals_rows, metric_key="value_score", descending=True)

    print_section("6) Listings where engine_score < 20")
    print(f"Count: {len(low_engine_rows)}")
    print_ranked_list(low_engine_rows, metric_key="engine_score", descending=False)

    print_section("7) Listings where value_score IS NULL")
    print(f"Count: {len(null_value_rows)}")
    if not null_value_rows:
        print("None")
    else:
        for idx, row in enumerate(null_value_rows, start=1):
            deferred = safe_float(row.get("deferred_total"))
            engine_score = safe_float(row.get("engine_score"))
            print(
                f"{idx:>2}. {listing_label(row)} | deferred={fmt_money(deferred)} | "
                f"engine_score={fmt_num(engine_score)}"
            )


def main() -> None:
    default_intelligence_version = resolve_default_intelligence_version()

    parser = argparse.ArgumentParser(
        description="Validate aircraft_listings scoring outputs in Supabase"
    )
    parser.add_argument(
        "--make",
        type=str,
        default=None,
        help="Filter report to a specific manufacturer (case-insensitive exact match)",
    )
    parser.add_argument(
        "--intelligence-version",
        type=str,
        default=default_intelligence_version,
        help=(
            "Intelligence version to validate. Defaults to current "
            "core.intelligence.aircraft_intelligence version."
        ),
    )
    args = parser.parse_args()

    supabase = get_supabase()
    rows = fetch_listings(
        supabase,
        intelligence_version=args.intelligence_version,
        make_filter=args.make,
    )
    build_report(rows, args.make, args.intelligence_version)


if __name__ == "__main__":
    main()
