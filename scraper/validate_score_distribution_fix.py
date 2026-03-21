"""
Dry-run validator for score distribution fix.

Loads 50 active listings from DB, scores them with the NEW logic, prints a distribution
report. Does NOT write any changes to the database.

Run:
  .venv312\\Scripts\\python.exe scraper\\validate_score_distribution_fix.py

Then if distribution looks good, run:
  .venv312\\Scripts\\python.exe scraper\\backfill_scores.py --all --compute-comps

Baseline output captured before this fix (from scraper/audit_score_distribution.py):

=== Score Distribution Audit ===
Total active listings: 10449
Scored listings: 10449
Null value_score: 0

Score buckets (0-9, 10-19, ...):
   0- 9:     0  (  0.0%)
  10-19:     0  (  0.0%)
  20-29:     6  (  0.1%)
  30-39:   263  (  2.5%)
  40-49:   685  (  6.6%)
  50-59:  9094  ( 87.0%)
  60-69:   309  (  3.0%)
  70-79:    92  (  0.9%)
  80-89:     0  (  0.0%)
  90-99:     0  (  0.0%)

Top 10 most common exact scores:
   51.70:  3333 (31.9%)
   52.00:  2234 (21.4%)
   54.20:   277 (2.7%)
   54.00:   220 (2.1%)
   54.30:   217 (2.1%)
   56.80:   145 (1.4%)
   58.70:   132 (1.3%)
   55.40:   121 (1.2%)
   53.90:   104 (1.0%)
   38.00:    96 (0.9%)

Risk level distribution:
  LOW     : 2
  MODERATE: 9485
  HIGH    : 726
  CRITICAL: 236
"""

from __future__ import annotations

import os
import sys
from collections import Counter
from pathlib import Path

# Allow importing `core` when run as `python scraper/validate_score_distribution_fix.py`
_ROOT = Path(__file__).resolve().parent
if _ROOT.name == "scraper":
    sys.path.insert(0, str(_ROOT.parent))

from dotenv import load_dotenv
from supabase import create_client

from core.intelligence.aircraft_intelligence import aircraft_intelligence_score
from backfill_scores import listing_for_intelligence

load_dotenv(dotenv_path=_ROOT / ".env")


def _get_supabase():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return create_client(url, key)


def _fetch_sample_rows(limit: int = 50) -> list[dict]:
    sb = _get_supabase()
    cols = ",".join(
        [
            "id",
            "year",
            "make",
            "model",
            "asking_price",
            "description",
            "description_full",
            "description_intelligence",
            "avionics_description",
            "avionics_notes",
            "title",
            "source",
            "total_time_airframe",
            "time_since_overhaul",
            "time_since_new_engine",
            "time_since_prop_overhaul",
            "engine_time_since_overhaul",
            "aircraft_type",
            "engine_model",
            "faa_engine_model",
            "prop_model",
            "days_on_market",
            "price_reduced",
            "accident_count",
            "most_recent_accident_date",
            "most_severe_damage",
            "has_accident_history",
            "faa_registration_alert",
            "value_score",
            "risk_level",
        ]
    )
    rows = (
        sb.table("aircraft_listings")
        .select(cols)
        .eq("is_active", True)
        .not_.is_("year", "null")
        .order("year", desc=False)
        .limit(limit)
        .execute()
        .data
        or []
    )
    if len(rows) >= limit:
        return rows[:limit]

    additional = (
        sb.table("aircraft_listings")
        .select(cols)
        .eq("is_active", True)
        .order("id", desc=False)
        .limit(limit - len(rows))
        .execute()
        .data
        or []
    )
    dedupe = {row["id"]: row for row in rows if row.get("id")}
    for row in additional:
        row_id = row.get("id")
        if row_id and row_id not in dedupe and len(dedupe) < limit:
            dedupe[row_id] = row
    return list(dedupe.values())[:limit]


def _print_distribution(scores: list[float], risk_counts: Counter):
    buckets = Counter()
    for score in scores:
        bucket = min(int(score // 10) * 10, 90)
        buckets[bucket] += 1

    most_common = Counter(round(score, 2) for score in scores).most_common(10)
    print("\n=== Score Distribution Audit ===")
    print(f"Scored listings in sample: {len(scores)}")
    print("\nScore buckets (0-9, 10-19, ...):")
    for bucket in range(0, 100, 10):
        count = buckets.get(bucket, 0)
        pct = count / len(scores) * 100 if scores else 0
        bar = "#" * int(pct / 2)
        print(f"  {bucket:2d}-{bucket+9:2d}: {count:5d}  ({pct:5.1f}%)  {bar}")

    print("\nTop 10 most common exact scores:")
    for score, count in most_common:
        pct = count / len(scores) * 100 if scores else 0
        print(f"  {score:6.2f}: {count:5d} ({pct:.1f}%)")

    print("\nRisk level distribution:")
    for level in ["LOW", "MODERATE", "HIGH", "CRITICAL"]:
        print(f"  {level:8s}: {risk_counts.get(level, 0)}")


def main():
    rows = _fetch_sample_rows(limit=50)
    if not rows:
        print("No active listings returned; check DB connectivity/permissions.")
        return

    scores: list[float] = []
    risk_counts: Counter = Counter()
    measured_counts: list[int] = []

    for row in rows:
        listing = listing_for_intelligence(row)
        listing["faa_registration_alert"] = row.get("faa_registration_alert")
        listing["last_annual_date"] = row.get("last_annual_date")
        listing["elt_expiry_date"] = row.get("elt_expiry_date")
        intel = aircraft_intelligence_score(listing)
        value_score = intel.get("value_score")
        if value_score is not None:
            scores.append(float(value_score))
        if intel.get("risk_level"):
            risk_counts[str(intel["risk_level"])] += 1
        measured_counts.append(int(intel.get("_components_measured") or 0))

    _print_distribution(scores, risk_counts)
    unique_scores = len(set(round(s, 2) for s in scores))
    avg_measured = (sum(measured_counts) / len(measured_counts)) if measured_counts else 0.0
    print(f"\nUnique score values in sample: {unique_scores}")
    print(f"Average _components_measured: {avg_measured:.2f}")
    print()


if __name__ == "__main__":
    main()
