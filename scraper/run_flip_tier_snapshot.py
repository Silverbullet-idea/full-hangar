"""
Aggregate flip_tier / implied score bands from aircraft_listings and write a markdown snapshot.

Usage:
  .venv312\\Scripts\\python.exe scraper\\run_flip_tier_snapshot.py
"""

from __future__ import annotations

import os
from collections import Counter
from pathlib import Path

from dotenv import load_dotenv


def main() -> None:
    from supabase import create_client

    load_dotenv(Path(__file__).resolve().parent / ".env")
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise SystemExit("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")

    client = create_client(url, key)
    page_size = 1000
    offset = 0
    tier_ct: Counter[str] = Counter()
    band_ct: Counter[str] = Counter()
    total_rows = 0
    with_tier = 0
    with_score = 0
    null_tier = 0

    while True:
        rows = (
            client.table("aircraft_listings")
            .select("flip_tier,flip_score,is_active")
            .eq("is_active", True)
            .order("id")
            .range(offset, offset + page_size - 1)
            .execute()
            .data
            or []
        )
        if not rows:
            break
        for r in rows:
            total_rows += 1
            ft = r.get("flip_tier")
            if ft:
                tier_ct[str(ft)] += 1
                with_tier += 1
            else:
                null_tier += 1
            fs = r.get("flip_score")
            if fs is not None:
                with_score += 1
                try:
                    v = float(fs)
                except (TypeError, ValueError):
                    continue
                if v >= 80:
                    band_ct["HOT_band_ge_80"] += 1
                elif v >= 65:
                    band_ct["GOOD_band_ge_65"] += 1
                elif v >= 50:
                    band_ct["FAIR_band_ge_50"] += 1
                else:
                    band_ct["PASS_band_lt_50"] += 1
        if len(rows) < page_size:
            break
        offset += page_size

    log_dir = Path(__file__).resolve().parent / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    out_path = log_dir / "flip_tier_distribution_latest.md"
    lines = [
        "# Flip tier snapshot",
        "",
        f"- active_rows_scanned: {total_rows}",
        f"- rows_with_flip_tier: {with_tier}",
        f"- rows_with_flip_score: {with_score}",
        f"- rows_without_flip_tier: {null_tier}",
        "",
        "## flip_tier counts",
        "",
        "| tier | count | pct |",
        "|------|------:|-----|",
    ]
    denom = with_tier or 1
    for tier, n in tier_ct.most_common():
        pct = 100.0 * n / denom
        lines.append(f"| {tier} | {n} | {pct:.2f}% |")
    lines.extend(
        [
            "",
            "## Implied band from flip_score (80/65/50 thresholds)",
            "",
            "| band | count |",
            "|------|------:|",
        ]
    )
    for band, n in sorted(band_ct.items(), key=lambda x: -x[1]):
        lines.append(f"| {band} | {n} |")
    lines.append("")
    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
