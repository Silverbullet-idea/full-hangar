"""
Audit unknown bridge-ingest fields captured in aircraft_listings.raw_data.

Usage:
  .venv312\\Scripts\\python.exe scraper\\audit_bridge_unmapped_fields.py
  .venv312\\Scripts\\python.exe scraper\\audit_bridge_unmapped_fields.py --source-site controller --max-rows 15000
"""

from __future__ import annotations

import argparse
import json
import os
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import create_client


ROOT = Path(__file__).resolve().parent.parent
SCRAPER_DIR = ROOT / "scraper"
DEFAULT_JSON_OUT = SCRAPER_DIR / "bridge_unmapped_fields_latest.json"
DEFAULT_MD_OUT = SCRAPER_DIR / "bridge_unmapped_fields_latest.md"


def get_supabase():
    load_dotenv(SCRAPER_DIR / ".env")
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise EnvironmentError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in scraper/.env")
    return create_client(url, key)


def fetch_rows(client: Any, source_site: str | None, max_rows: int, page_size: int = 1000) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    while offset < max_rows:
        end = min(offset + page_size - 1, max_rows - 1)
        query = (
            client.table("aircraft_listings")
            .select("source_site,source_id,title,updated_at,raw_data")
            .order("updated_at", desc=True)
            .range(offset, end)
        )
        if source_site:
            query = query.eq("source_site", source_site)
        page = query.execute().data or []
        if not page:
            break
        rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size
    return rows[:max_rows]


def build_report(rows: list[dict[str, Any]], source_site_filter: str | None) -> dict[str, Any]:
    key_counter: Counter[str] = Counter()
    key_source_counter: dict[str, Counter[str]] = defaultdict(Counter)
    key_samples: dict[str, list[dict[str, Any]]] = defaultdict(list)
    rows_with_unmapped = 0

    for row in rows:
        raw_data = row.get("raw_data")
        if not isinstance(raw_data, dict):
            continue
        unmapped = raw_data.get("bridge_unmapped")
        if not isinstance(unmapped, dict) or not unmapped:
            continue

        rows_with_unmapped += 1
        source = str(row.get("source_site") or "unknown")
        source_id = str(row.get("source_id") or "")
        title = str(row.get("title") or "")[:120]

        for key, value in unmapped.items():
            key_str = str(key)
            key_counter[key_str] += 1
            key_source_counter[key_str][source] += 1

            if len(key_samples[key_str]) < 3:
                value_preview = value
                try:
                    rendered = json.dumps(value, ensure_ascii=True)
                    if len(rendered) > 240:
                        rendered = rendered[:240] + "..."
                    value_preview = rendered
                except Exception:
                    value_preview = str(value)[:240]
                key_samples[key_str].append(
                    {
                        "source_site": source,
                        "source_id": source_id,
                        "title": title,
                        "value_preview": value_preview,
                    }
                )

    top_keys = []
    for key, count in key_counter.most_common():
        top_keys.append(
            {
                "key": key,
                "rows": count,
                "source_breakdown": dict(key_source_counter[key]),
                "samples": key_samples.get(key, []),
            }
        )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_site_filter": source_site_filter,
        "rows_scanned": len(rows),
        "rows_with_unmapped": rows_with_unmapped,
        "distinct_unmapped_keys": len(key_counter),
        "top_keys": top_keys,
    }


def write_outputs(report: dict[str, Any], json_out: Path, md_out: Path) -> None:
    json_out.write_text(json.dumps(report, indent=2, ensure_ascii=True), encoding="utf-8")

    lines: list[str] = []
    lines.append("# Bridge Unmapped Field Audit")
    lines.append("")
    lines.append(f"- Generated: `{report['generated_at']}`")
    lines.append(f"- Source filter: `{report.get('source_site_filter') or 'all'}`")
    lines.append(f"- Rows scanned: `{report['rows_scanned']}`")
    lines.append(f"- Rows with unmapped fields: `{report['rows_with_unmapped']}`")
    lines.append(f"- Distinct unmapped keys: `{report['distinct_unmapped_keys']}`")
    lines.append("")
    lines.append("## Top Keys")
    lines.append("")

    top_keys = report.get("top_keys") or []
    if not top_keys:
        lines.append("_No unmapped keys found in scanned rows._")
    else:
        for item in top_keys[:100]:
            lines.append(f"### `{item['key']}`")
            lines.append(f"- Rows: `{item['rows']}`")
            source_breakdown = item.get("source_breakdown") or {}
            if source_breakdown:
                parts = [f"`{k}`: `{v}`" for k, v in sorted(source_breakdown.items(), key=lambda kv: kv[1], reverse=True)]
                lines.append(f"- Source breakdown: {', '.join(parts)}")
            samples = item.get("samples") or []
            if samples:
                lines.append("- Samples:")
                for sample in samples:
                    lines.append(
                        f"  - `{sample['source_site']}` / `{sample['source_id']}`: {sample['value_preview']}"
                    )
            lines.append("")

    md_out.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-site", default="controller", help="Filter source_site (default: controller). Use 'all' for no filter.")
    parser.add_argument("--max-rows", type=int, default=12000, help="Max rows to scan ordered by updated_at desc.")
    parser.add_argument("--json-out", default=str(DEFAULT_JSON_OUT))
    parser.add_argument("--md-out", default=str(DEFAULT_MD_OUT))
    args = parser.parse_args()

    source_site = None if str(args.source_site).strip().lower() == "all" else str(args.source_site).strip().lower()
    client = get_supabase()
    rows = fetch_rows(client, source_site=source_site, max_rows=max(1, args.max_rows))
    report = build_report(rows, source_site_filter=source_site)

    json_out = Path(args.json_out)
    md_out = Path(args.md_out)
    write_outputs(report, json_out=json_out, md_out=md_out)

    print(f"Rows scanned: {report['rows_scanned']}")
    print(f"Rows with unmapped fields: {report['rows_with_unmapped']}")
    print(f"Distinct unmapped keys: {report['distinct_unmapped_keys']}")
    print(f"Wrote: {json_out}")
    print(f"Wrote: {md_out}")


if __name__ == "__main__":
    main()
