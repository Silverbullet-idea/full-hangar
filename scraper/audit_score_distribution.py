"""
Audit script - reads the current score distribution from Supabase and prints a report.
Run BEFORE and AFTER the scoring fix to validate the improvement.
Safe to run at any time - read-only, no writes.

Usage:
  .venv312\\Scripts\\python.exe scraper\\audit_score_distribution.py
"""

import os
from collections import Counter

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path="scraper/.env")

url = os.environ["SUPABASE_URL"]
key = os.environ["SUPABASE_SERVICE_KEY"]
sb = create_client(url, key)


def fetch_active_rows(page_size: int = 1000):
    rows = []
    offset = 0
    select_cols = (
        "value_score,"
        "risk_level,"
        "intelligence_version,"
        "engine_score,"
        "avionics_score,"
        "prop_score"
    )
    while True:
        page = (
            sb.table("aircraft_listings")
            .select(select_cols)
            .eq("is_active", True)
            .range(offset, offset + page_size - 1)
            .execute()
            .data
            or []
        )
        if not page:
            break
        rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size
    return rows


rows = fetch_active_rows()
scores = [r["value_score"] for r in rows if r.get("value_score") is not None]
risk_counts = Counter(r.get("risk_level") for r in rows if r.get("risk_level"))
version_counts = Counter(r.get("intelligence_version") for r in rows)

# Distribution buckets 0-9, 10-19, ... 90-100
buckets = Counter()
for s in scores:
    bucket = min(int(s // 10) * 10, 90)
    buckets[bucket] += 1

most_common = Counter(round(s, 2) for s in scores).most_common(10)
null_score_count = sum(1 for r in rows if r.get("value_score") is None)

print("\n=== Score Distribution Audit ===")
print(f"Total active listings: {len(rows)}")
print(f"Scored listings: {len(scores)}")
print(f"Null value_score: {null_score_count}")
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
print("\nIntelligence version distribution (top 5):")
for ver, count in version_counts.most_common(5):
    print(f"  {ver}: {count}")
print()
