from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

try:
    from env_check import env_check
    from scraper_base import get_supabase, setup_logging
except ImportError:  # pragma: no cover
    from .env_check import env_check
    from .scraper_base import get_supabase, setup_logging


DEFAULT_JSON_OUTPUT = Path("scraper/listing_media_coverage_latest.json")
DEFAULT_MD_OUTPUT = Path("scraper/listing_media_coverage_latest.md")
DEFAULT_CANDIDATE_DIR = Path("scraper/state/media_refresh")
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")


@dataclass
class CoverageStats:
    source_site: str
    total: int = 0
    no_picture_count: int = 0
    at_least_one_picture_count: int = 0
    more_than_one_picture_count: int = 0
    missing_media_count: int = 0
    single_image_only_count: int = 0

    def to_percentages(self) -> dict[str, float]:
        denom = self.total if self.total > 0 else 1
        return {
            "no_picture_pct": round((self.no_picture_count / denom) * 100.0, 2),
            "at_least_one_picture_pct": round((self.at_least_one_picture_count / denom) * 100.0, 2),
            "more_than_one_picture_pct": round((self.more_than_one_picture_count / denom) * 100.0, 2),
            "missing_media_pct": round((self.missing_media_count / denom) * 100.0, 2),
            "single_image_only_pct": round((self.single_image_only_count / denom) * 100.0, 2),
        }


def _is_usable_url(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    text = value.strip()
    if not text:
        return False
    return text.startswith("http://") or text.startswith("https://")


def _parse_gallery_list(raw_value: Any) -> list[str]:
    if isinstance(raw_value, list):
        return [str(item).strip() for item in raw_value if _is_usable_url(item)]
    if isinstance(raw_value, str):
        text = raw_value.strip()
        if not text:
            return []
        if text.startswith("[") and text.endswith("]"):
            try:
                parsed = json.loads(text)
                if isinstance(parsed, list):
                    return [str(item).strip() for item in parsed if _is_usable_url(item)]
            except Exception:
                return []
        if _is_usable_url(text):
            return [text]
    return []


def _load_rows(
    supabase: Any,
    *,
    source: str | None,
    active_only: bool,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    batch_size = 1000
    offset = 0
    while True:
        query = (
            supabase.table("aircraft_listings")
            .select("source_site,source_id,is_active,primary_image_url,image_urls")
            .order("source_site")
            .order("source_id")
        )
        if source:
            query = query.eq("source_site", source)
        if active_only:
            query = query.eq("is_active", True)
        response = query.range(offset, offset + batch_size - 1).execute()
        chunk = response.data or []
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < batch_size:
            break
        offset += batch_size
    return rows


def _compute_coverage(rows: list[dict[str, Any]]) -> tuple[CoverageStats, dict[str, CoverageStats], dict[str, dict[str, list[str]]]]:
    overall = CoverageStats(source_site="ALL_SOURCES")
    per_source: dict[str, CoverageStats] = {}
    candidates: dict[str, dict[str, list[str]]] = {}

    for row in rows:
        source_site = str(row.get("source_site") or "unknown").strip().lower() or "unknown"
        source_id = str(row.get("source_id") or "").strip()
        primary = row.get("primary_image_url")
        gallery = _parse_gallery_list(row.get("image_urls"))
        gallery_count = len(gallery)
        has_primary = _is_usable_url(primary)
        has_any_picture = has_primary or gallery_count > 0
        has_more_than_one = gallery_count >= 2
        missing_media = (not has_primary) and gallery_count == 0
        single_image_only = gallery_count <= 1

        if source_site not in per_source:
            per_source[source_site] = CoverageStats(source_site=source_site)
            candidates[source_site] = {"missing_media": [], "single_image_only": []}
        stats = per_source[source_site]

        for bucket in (overall, stats):
            bucket.total += 1
            if has_any_picture:
                bucket.at_least_one_picture_count += 1
            else:
                bucket.no_picture_count += 1
            if has_more_than_one:
                bucket.more_than_one_picture_count += 1
            if missing_media:
                bucket.missing_media_count += 1
            if single_image_only:
                bucket.single_image_only_count += 1

        if source_id:
            if missing_media:
                candidates[source_site]["missing_media"].append(source_id)
            if single_image_only:
                candidates[source_site]["single_image_only"].append(source_id)

    return overall, per_source, candidates


def _build_payload(
    *,
    rows: list[dict[str, Any]],
    overall: CoverageStats,
    per_source: dict[str, CoverageStats],
) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc).isoformat()
    ordered_sources = sorted(per_source.keys())
    return {
        "generated_at": generated_at,
        "total_rows_scanned": len(rows),
        "overall": {**asdict(overall), **overall.to_percentages()},
        "by_source": [
            {**asdict(per_source[source_site]), **per_source[source_site].to_percentages()}
            for source_site in ordered_sources
        ],
    }


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")


def _format_pct(value: float) -> str:
    return f"{value:.2f}%"


def _write_markdown(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    overall = payload.get("overall", {})
    lines: list[str] = [
        "# Listing Media Coverage Report",
        "",
        f"- Generated (UTC): {payload.get('generated_at')}",
        f"- Rows scanned: {payload.get('total_rows_scanned', 0)}",
        "",
        "## Overall",
        "",
        "| Metric | Count | Percent |",
        "|---|---:|---:|",
        f"| No picture | {overall.get('no_picture_count', 0)} | {_format_pct(float(overall.get('no_picture_pct', 0.0)))} |",
        f"| At least one picture | {overall.get('at_least_one_picture_count', 0)} | {_format_pct(float(overall.get('at_least_one_picture_pct', 0.0)))} |",
        f"| More than one picture | {overall.get('more_than_one_picture_count', 0)} | {_format_pct(float(overall.get('more_than_one_picture_pct', 0.0)))} |",
        "",
        "## By Source",
        "",
        "| Source | Total | No picture | At least one | More than one | Missing media | Single image only |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for row in payload.get("by_source", []):
        lines.append(
            f"| {row.get('source_site')} | {row.get('total', 0)} "
            f"| {_format_pct(float(row.get('no_picture_pct', 0.0)))} "
            f"| {_format_pct(float(row.get('at_least_one_picture_pct', 0.0)))} "
            f"| {_format_pct(float(row.get('more_than_one_picture_pct', 0.0)))} "
            f"| {_format_pct(float(row.get('missing_media_pct', 0.0)))} "
            f"| {_format_pct(float(row.get('single_image_only_pct', 0.0)))} |"
        )
    path.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")


def _write_candidate_exports(candidate_dir: Path, candidates: dict[str, dict[str, list[str]]]) -> dict[str, dict[str, str]]:
    candidate_dir.mkdir(parents=True, exist_ok=True)
    export_paths: dict[str, dict[str, str]] = {}
    for source_site, pools in candidates.items():
        safe_source = source_site.replace("/", "_")
        source_dir = candidate_dir / safe_source
        source_dir.mkdir(parents=True, exist_ok=True)
        export_paths[source_site] = {}
        for pool_name in ("missing_media", "single_image_only"):
            ids = sorted(set(str(x).strip() for x in pools.get(pool_name, []) if str(x).strip()))
            output_file = source_dir / f"{pool_name}.txt"
            output_file.write_text("\n".join(ids) + ("\n" if ids else ""), encoding="utf-8")
            export_paths[source_site][pool_name] = str(output_file)
    return export_paths


def main() -> None:
    parser = argparse.ArgumentParser(description="Report listing image coverage by source site")
    parser.add_argument("--source", default=None, help="Limit report to a specific source_site")
    parser.add_argument("--active-only", action="store_true", help="Only include active listings")
    parser.add_argument("--out-json", default=str(DEFAULT_JSON_OUTPUT), help="Path to JSON report output")
    parser.add_argument("--out-md", default=str(DEFAULT_MD_OUTPUT), help="Path to markdown report output")
    parser.add_argument(
        "--candidate-dir",
        default=str(DEFAULT_CANDIDATE_DIR),
        help="Directory to write per-source candidate ID lists",
    )
    parser.add_argument("--no-candidate-export", action="store_true", help="Skip per-source candidate export files")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging")
    args = parser.parse_args()

    log = setup_logging(args.verbose)
    env_check()
    supabase = get_supabase()

    rows = _load_rows(supabase, source=args.source, active_only=args.active_only)
    overall, per_source, candidates = _compute_coverage(rows)
    payload = _build_payload(rows=rows, overall=overall, per_source=per_source)

    json_path = Path(args.out_json)
    md_path = Path(args.out_md)
    _write_json(json_path, payload)
    _write_markdown(md_path, payload)

    exported = {}
    if not args.no_candidate_export:
        exported = _write_candidate_exports(Path(args.candidate_dir), candidates)

    log.info("Media coverage report complete: rows=%s sources=%s", len(rows), len(per_source))
    log.info("JSON report: %s", json_path)
    log.info("Markdown report: %s", md_path)
    if exported:
        log.info("Candidate exports written under: %s", args.candidate_dir)


if __name__ == "__main__":
    main()
