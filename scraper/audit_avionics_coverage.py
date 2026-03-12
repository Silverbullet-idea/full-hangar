"""
Audit avionics extraction coverage and quality from recent listings.

Usage:
  .venv312\\Scripts\\python.exe scraper\\audit_avionics_coverage.py --days 90 --top 20
  .venv312\\Scripts\\python.exe scraper\\audit_avionics_coverage.py --days 30 --output-json scraper\\avionics_coverage_audit_latest.json --output-md scraper\\avionics_coverage_audit_latest.md
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import create_client

def setup_logging(verbose: bool = False) -> logging.Logger:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(level=level, format="%(asctime)s [%(levelname)s] %(message)s")
    return logging.getLogger(__name__)


def env_check(required: list[str] | None = None) -> None:
    required_vars = required or ["SUPABASE_URL", "SUPABASE_SERVICE_KEY"]
    missing = [name for name in required_vars if not os.getenv(name)]
    if missing:
        raise EnvironmentError(f"Missing required environment variables: {', '.join(missing)}")


def get_supabase():
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise EnvironmentError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
    return create_client(url, key)

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

AVIONICS_HINT_RE = re.compile(
    r"\b("
    r"avionics|panel|autopilot|transponder|waas|ads[\s\-]?b|"
    r"gtn[\s\-]?\d{3}|gns[\s\-]?\d{3}|gfc[\s\-]?\d{3}|gtx[\s\-]?\d{2,4}|"
    r"ifd[\s\-]?\d{3}|g1000|g500|g600|aspen|stormscope|taws|svt|esp|"
    r"engine\s*monitor|jpi|pma[\s\-]?\d{2,4}|kx[\s\-]?\d{2,4}|kap[\s\-]?\d{2,4}|kfc[\s\-]?\d{2,4}"
    r")\b",
    flags=re.IGNORECASE,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit avionics extraction coverage from listing intelligence")
    parser.add_argument("--days", type=int, default=90, help="Lookback window in days by last_seen_date")
    parser.add_argument("--top", type=int, default=20, help="Number of top unresolved tokens to emit")
    parser.add_argument("--batch-size", type=int, default=500, help="Supabase page size")
    parser.add_argument("--limit", type=int, default=0, help="Optional max listings to scan (0=all)")
    parser.add_argument("--output-json", default="", help="Optional JSON output path")
    parser.add_argument("--output-md", default="", help="Optional markdown output path")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging")
    return parser.parse_args()


def _json_parse(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return {}
        try:
            parsed = json.loads(text)
        except Exception:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _normalize_token(value: str | None) -> str:
    lowered = (value or "").lower()
    alnum_spaces = re.sub(r"[^a-z0-9]+", " ", lowered)
    return re.sub(r"\s+", " ", alnum_spaces).strip()


def _write_text(path: str, content: str) -> None:
    if not path:
        return
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def main() -> int:
    args = parse_args()
    log = setup_logging(args.verbose)
    env_check()
    supabase = get_supabase()

    lookback_days = max(1, int(args.days))
    cutoff_date = (date.today() - timedelta(days=lookback_days)).isoformat()
    batch_size = max(50, int(args.batch_size))
    scan_limit = max(0, int(args.limit))
    top_n = max(1, int(args.top))

    log.info(
        "Running avionics coverage audit: cutoff=%s days=%s batch_size=%s limit=%s",
        cutoff_date,
        lookback_days,
        batch_size,
        scan_limit or "all",
    )

    totals: dict[str, Any] = {
        "lookback_days": lookback_days,
        "cutoff_date": cutoff_date,
        "listings_scanned": 0,
        "listings_with_text": 0,
        "listings_with_avionics_text": 0,
        "listings_with_observations": 0,
        "listings_with_observations_in_avionics_text": 0,
        "listings_with_unresolved": 0,
        "observation_rows_total": 0,
        "matched_rows": 0,
        "unresolved_rows": 0,
        "avg_match_confidence": 0.0,
    }

    confidence_sum = 0.0
    confidence_count = 0
    unresolved_counts: Counter[str] = Counter()
    parser_versions: Counter[str] = Counter()
    source_metrics: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "listings_scanned": 0,
            "listings_with_avionics_text": 0,
            "listings_with_observations": 0,
            "listings_with_observations_in_avionics_text": 0,
            "listings_with_unresolved": 0,
            "matched_rows": 0,
            "unresolved_rows": 0,
        }
    )

    offset = 0
    while True:
        if scan_limit and totals["listings_scanned"] >= scan_limit:
            break
        page_size = batch_size
        if scan_limit:
            page_size = min(page_size, scan_limit - totals["listings_scanned"])
            if page_size <= 0:
                break

        response = (
            supabase.table("aircraft_listings")
            .select("id,source_site,last_seen_date,description,avionics_description,description_full,description_intelligence")
            .gte("last_seen_date", cutoff_date)
            .order("last_seen_date", desc=True)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = response.data or []
        if not rows:
            break

        for row in rows:
            source = str(row.get("source_site") or "unknown").strip() or "unknown"
            source_metrics[source]["listings_scanned"] += 1
            totals["listings_scanned"] += 1

            text = " ".join(
                [
                    str(row.get("avionics_description") or ""),
                    str(row.get("description_full") or ""),
                    str(row.get("description") or ""),
                ]
            ).strip()
            has_text = len(text) >= 12
            has_avionics_text = bool(AVIONICS_HINT_RE.search(text))
            if has_text:
                totals["listings_with_text"] += 1
            if has_avionics_text:
                totals["listings_with_avionics_text"] += 1
                source_metrics[source]["listings_with_avionics_text"] += 1

            parsed = _json_parse(row.get("description_intelligence"))
            parser_version = str(parsed.get("avionics_parser_version") or "").strip()
            if parser_version:
                parser_versions[parser_version] += 1

            detailed = parsed.get("avionics_detailed", []) if isinstance(parsed.get("avionics_detailed"), list) else []
            unresolved = (
                parsed.get("avionics_unresolved", []) if isinstance(parsed.get("avionics_unresolved"), list) else []
            )

            matched_rows = 0
            unresolved_rows = 0

            for item in detailed:
                if not isinstance(item, dict):
                    continue
                canonical_name = str(item.get("canonical_name") or "").strip()
                if not canonical_name:
                    continue
                matched_rows += 1
                confidence = item.get("confidence")
                try:
                    conf_value = float(confidence)
                except (TypeError, ValueError):
                    conf_value = None
                if conf_value is not None:
                    confidence_sum += conf_value
                    confidence_count += 1

            for token in unresolved:
                token_norm = _normalize_token(str(token or ""))
                if not token_norm:
                    continue
                unresolved_rows += 1
                unresolved_counts[token_norm] += 1

            row_observation_total = matched_rows + unresolved_rows
            has_observations = row_observation_total > 0
            if has_observations:
                totals["listings_with_observations"] += 1
                source_metrics[source]["listings_with_observations"] += 1
                if has_avionics_text:
                    totals["listings_with_observations_in_avionics_text"] += 1
                    source_metrics[source]["listings_with_observations_in_avionics_text"] += 1
            if unresolved_rows > 0:
                totals["listings_with_unresolved"] += 1
                source_metrics[source]["listings_with_unresolved"] += 1

            totals["matched_rows"] += matched_rows
            totals["unresolved_rows"] += unresolved_rows
            totals["observation_rows_total"] += row_observation_total
            source_metrics[source]["matched_rows"] += matched_rows
            source_metrics[source]["unresolved_rows"] += unresolved_rows

        offset += len(rows)
        if len(rows) < page_size:
            break

    observation_total = int(totals["observation_rows_total"])
    matched_total = int(totals["matched_rows"])
    unresolved_total = int(totals["unresolved_rows"])
    avionics_text_total = int(totals["listings_with_avionics_text"])
    observation_listings_total = int(totals["listings_with_observations_in_avionics_text"])

    matched_rate_pct = round((matched_total / observation_total) * 100.0, 2) if observation_total else 0.0
    unresolved_rate_pct = round((unresolved_total / observation_total) * 100.0, 2) if observation_total else 0.0
    extraction_coverage_pct = (
        round((observation_listings_total / avionics_text_total) * 100.0, 2) if avionics_text_total else 0.0
    )
    avg_confidence = round((confidence_sum / confidence_count), 4) if confidence_count else 0.0

    top_unresolved = [
        {"token": token, "count": count}
        for token, count in unresolved_counts.most_common(top_n)
    ]
    parser_version_breakdown = dict(parser_versions.most_common())

    source_rows: list[dict[str, Any]] = []
    for source, stats in sorted(
        source_metrics.items(),
        key=lambda item: item[1]["matched_rows"] + item[1]["unresolved_rows"],
        reverse=True,
    ):
        src_obs_total = int(stats["matched_rows"]) + int(stats["unresolved_rows"])
        src_matched_pct = round((int(stats["matched_rows"]) / src_obs_total) * 100.0, 2) if src_obs_total else 0.0
        src_extract_cov_scoped = (
            round(
                (int(stats["listings_with_observations_in_avionics_text"]) / int(stats["listings_with_avionics_text"]))
                * 100.0,
                2,
            )
            if int(stats["listings_with_avionics_text"]) > 0
            else 0.0
        )
        source_rows.append(
            {
                "source_site": source,
                **stats,
                "observation_rows_total": src_obs_total,
                "matched_rate_pct": src_matched_pct,
                "extraction_coverage_pct": src_extract_cov_scoped,
            }
        )

    result = {
        **totals,
        "matched_rate_pct": matched_rate_pct,
        "unresolved_rate_pct": unresolved_rate_pct,
        "extraction_coverage_pct": extraction_coverage_pct,
        "avg_match_confidence": avg_confidence,
        "top_unresolved_tokens": top_unresolved,
        "parser_version_breakdown": parser_version_breakdown,
        "source_breakdown": source_rows,
    }

    markdown_lines = [
        "# Avionics Coverage Audit",
        "",
        f"- Window: last `{lookback_days}` days",
        f"- Cutoff date: `{cutoff_date}`",
        f"- Listings scanned: `{result['listings_scanned']}`",
        f"- Listings with text: `{result['listings_with_text']}`",
        f"- Listings with avionics text: `{result['listings_with_avionics_text']}`",
        f"- Listings with observations: `{result['listings_with_observations']}`",
        f"- Listings with observations (scoped to avionics-text listings): `{result['listings_with_observations_in_avionics_text']}`",
        f"- Observation coverage over avionics-text listings: `{result['extraction_coverage_pct']}%`",
        f"- Total observation rows: `{result['observation_rows_total']}`",
        f"- Matched rows: `{result['matched_rows']}`",
        f"- Unresolved rows: `{result['unresolved_rows']}`",
        f"- Match rate: `{result['matched_rate_pct']}%`",
        f"- Unresolved rate: `{result['unresolved_rate_pct']}%`",
        f"- Avg match confidence: `{result['avg_match_confidence']}`",
        "",
        "## Top Unresolved Tokens",
        "",
    ]

    if top_unresolved:
        for row in top_unresolved:
            markdown_lines.append(f"- `{row['token']}`: `{row['count']}`")
    else:
        markdown_lines.append("- None")

    markdown_lines.extend(["", "## Parser Version Breakdown", ""])
    if parser_version_breakdown:
        for version, count in parser_version_breakdown.items():
            markdown_lines.append(f"- `{version}`: `{count}`")
    else:
        markdown_lines.append("- None detected")

    markdown_lines.extend(["", "## Source Breakdown", ""])
    if source_rows:
        for row in source_rows:
            markdown_lines.append(
                "- "
                f"`{row['source_site']}`: scanned={row['listings_scanned']}, "
                f"avionics_text={row['listings_with_avionics_text']}, "
                f"observations={row['listings_with_observations']}, "
                f"coverage={row['extraction_coverage_pct']}%, "
                f"matched={row['matched_rows']}, unresolved={row['unresolved_rows']}, "
                f"match_rate={row['matched_rate_pct']}%"
            )
    else:
        markdown_lines.append("- None")

    markdown_output = "\n".join(markdown_lines).strip() + "\n"

    if args.output_json:
        _write_text(args.output_json, json.dumps(result, indent=2, sort_keys=False))
        log.info("Wrote JSON audit output to %s", args.output_json)
    if args.output_md:
        _write_text(args.output_md, markdown_output)
        log.info("Wrote markdown audit output to %s", args.output_md)

    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
