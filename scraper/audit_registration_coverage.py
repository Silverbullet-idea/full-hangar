r"""
Registration coverage audit for active aircraft listings.

Outputs:
  - scraper/registration_coverage_latest.json
  - scraper/registration_coverage_latest.md

Usage:
  .venv312\Scripts\python.exe scraper\audit_registration_coverage.py
"""

from __future__ import annotations

import json
import os
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from dotenv import load_dotenv
from supabase import Client, create_client

from registration_parser import derive_registration_fields

ROOT = Path(__file__).resolve().parent
JSON_OUT = ROOT / "registration_coverage_latest.json"
MD_OUT = ROOT / "registration_coverage_latest.md"

DOMAIN_SOURCE_HINTS: list[tuple[str, str]] = [
    ("aerotrader", "aerotrader"),
    ("controller", "controller"),
    ("trade-a-plane", "tradaplane"),
    ("tradeaplane", "tradaplane"),
    ("barnstormers", "barnstormers"),
    ("globalair", "globalair"),
    ("aircraftforsale", "afs"),
    ("aso", "aso"),
    ("avbuyer", "avbuyer"),
]


def get_supabase() -> Client:
    load_dotenv("scraper/.env")
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not url or not key:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in scraper/.env")
    return create_client(url, key)


def normalize_source(value: object) -> str:
    raw = str(value or "").strip().lower()
    if not raw:
        return "unknown"
    if raw in {"tap", "trade-a-plane", "tradeaplane", "trade_a_plane"}:
        return "tradaplane"
    if raw.startswith("controller"):
        return "controller"
    if raw == "aircraftforsale":
        return "afs"
    if raw == "aero_trader":
        return "aerotrader"
    if raw == "global_air":
        return "globalair"
    return raw


def parse_domain(url_value: object) -> str:
    raw = str(url_value or "").strip()
    if not raw:
        return ""
    if not raw.startswith(("http://", "https://")):
        raw = f"https://{raw}"
    try:
        return (urlparse(raw).hostname or "").lower().replace("www.", "")
    except Exception:
        return ""


def infer_source(row: dict[str, object]) -> str:
    for candidate in (row.get("source_site"), row.get("listing_source"), row.get("source")):
        normalized = normalize_source(candidate)
        if normalized != "unknown":
            return normalized

    domain = parse_domain(row.get("source_url") or row.get("url"))
    if domain:
        for needle, source in DOMAIN_SOURCE_HINTS:
            if needle in domain:
                return source
    return "unknown"


def has_value(value: object) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return True


def registration_class(row: dict[str, Any]) -> str:
    scheme = str(row.get("registration_scheme") or "").strip().upper()
    if scheme == "US_N":
        return "US_N"
    if scheme and scheme != "UNKNOWN":
        return "NON_US"
    if has_value(row.get("registration_normalized")):
        return "NON_US"
    if has_value(row.get("n_number")):
        return "US_N"
    return "UNKNOWN"


def unresolved_token(raw: str) -> str | None:
    token = re.sub(r"[^A-Z0-9\- ]", " ", raw.upper())
    token = re.sub(r"\s+", " ", token).strip()
    if len(token) < 3:
        return None
    return token[:32]


def fetch_rows(supabase: Client) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    page_size = 1000
    from_idx = 0
    columns_full = (
        "id,source,source_site,listing_source,source_url,url,n_number,"
        "registration_raw,registration_normalized,registration_scheme,registration_country_code,registration_confidence,"
        "title,description,description_full,is_active"
    )
    columns_fallback = "id,source,source_site,listing_source,source_url,url,n_number,title,description,description_full,is_active"
    selected_columns = columns_full

    while True:
        to_idx = from_idx + page_size - 1
        try:
            page = (
                supabase.table("aircraft_listings")
                .select(selected_columns)
                .eq("is_active", True)
                .range(from_idx, to_idx)
                .execute()
            )
        except Exception:
            if selected_columns == columns_fallback:
                raise
            selected_columns = columns_fallback
            page = (
                supabase.table("aircraft_listings")
                .select(selected_columns)
                .eq("is_active", True)
                .range(from_idx, to_idx)
                .execute()
            )
        data = page.data or []
        if not data:
            break
        rows.extend(data)
        if len(data) < page_size:
            break
        from_idx += page_size
    return rows


def main() -> int:
    supabase = get_supabase()
    rows = fetch_rows(supabase)
    total = len(rows)

    by_source: dict[str, Counter[str]] = defaultdict(Counter)
    unresolved_by_source: dict[str, Counter[str]] = defaultdict(Counter)

    with_n_number = 0
    with_any_registration = 0
    us_n = 0
    non_us = 0
    unknown = 0

    for row in rows:
        source = infer_source(row)
        reg_cls = registration_class(row)
        by_source[source]["total"] += 1
        by_source[source][reg_cls] += 1

        if has_value(row.get("n_number")):
            with_n_number += 1
        if has_value(row.get("registration_normalized")) or has_value(row.get("registration_raw")) or has_value(row.get("n_number")):
            with_any_registration += 1

        if reg_cls == "US_N":
            us_n += 1
        elif reg_cls == "NON_US":
            non_us += 1
        else:
            unknown += 1
            candidate = str(
                row.get("registration_raw")
                or derive_registration_fields(
                    raw_value=None,
                    fallback_text=" ".join(
                        str(value or "") for value in (row.get("title"), row.get("description"), row.get("description_full"))
                    ),
                ).get("registration_raw")
                or ""
            ).strip()
            token = unresolved_token(candidate)
            if token:
                unresolved_by_source[source][token] += 1

    def pct(numerator: int, denominator: int) -> float:
        if denominator <= 0:
            return 0.0
        return round((numerator / denominator) * 100.0, 2)

    source_rows: list[dict[str, Any]] = []
    for source, counter in sorted(by_source.items(), key=lambda item: item[1]["total"], reverse=True):
        total_source = counter["total"]
        source_rows.append(
            {
                "source": source,
                "active_listings": total_source,
                "with_n_number": counter["US_N"],
                "pct_with_n_number": pct(counter["US_N"], total_source),
                "with_any_registration": counter["US_N"] + counter["NON_US"],
                "pct_with_any_registration": pct(counter["US_N"] + counter["NON_US"], total_source),
                "registration_class_breakdown": {
                    "US_N": counter["US_N"],
                    "NON_US": counter["NON_US"],
                    "UNKNOWN": counter["UNKNOWN"],
                },
                "unresolved_top_tokens": [
                    {"token": token, "count": count}
                    for token, count in unresolved_by_source[source].most_common(10)
                ],
            }
        )

    payload = {
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "total_active_listings": total,
        "overall": {
            "with_n_number": with_n_number,
            "pct_with_n_number": pct(with_n_number, total),
            "with_any_registration": with_any_registration,
            "pct_with_any_registration": pct(with_any_registration, total),
            "registration_class_breakdown": {
                "US_N": us_n,
                "NON_US": non_us,
                "UNKNOWN": unknown,
            },
        },
        "source_breakdown": source_rows,
    }

    JSON_OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    lines: list[str] = []
    lines.append("# Registration Coverage Audit")
    lines.append("")
    lines.append(f"- Computed at: {payload['computed_at']}")
    lines.append(f"- Active listings: {total:,}")
    lines.append(f"- % with N-number: {payload['overall']['pct_with_n_number']:.2f}%")
    lines.append(f"- % with any registration: {payload['overall']['pct_with_any_registration']:.2f}%")
    lines.append("")
    lines.append("## Overall class breakdown")
    lines.append("")
    lines.append(
        f"- US_N: {us_n:,} | NON_US: {non_us:,} | UNKNOWN: {unknown:,}"
    )
    lines.append("")
    lines.append("## Source breakdown")
    lines.append("")
    lines.append("| Source | Active | % N-number | % Any Registration | US_N | NON_US | UNKNOWN |")
    lines.append("|---|---:|---:|---:|---:|---:|---:|")
    for row in source_rows:
        breakdown = row["registration_class_breakdown"]
        lines.append(
            f"| {row['source']} | {row['active_listings']:,} | {row['pct_with_n_number']:.2f}% | "
            f"{row['pct_with_any_registration']:.2f}% | {breakdown['US_N']:,} | {breakdown['NON_US']:,} | {breakdown['UNKNOWN']:,} |"
        )

    lines.append("")
    lines.append("## Top unresolved registration tokens by source")
    lines.append("")
    for row in source_rows:
        tokens = row.get("unresolved_top_tokens") or []
        if not tokens:
            continue
        lines.append(f"### {row['source']}")
        lines.append("")
        for item in tokens[:5]:
            lines.append(f"- `{item['token']}` ({item['count']})")
        lines.append("")

    MD_OUT.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")
    print(f"Wrote {JSON_OUT}")
    print(f"Wrote {MD_OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

