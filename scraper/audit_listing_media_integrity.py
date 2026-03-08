from __future__ import annotations

import argparse
import json
import logging
import os
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from dotenv import load_dotenv
from supabase import Client, create_client

DEFAULT_JSON_OUTPUT = Path("scraper/listing_media_integrity_latest.json")
DEFAULT_MD_OUTPUT = Path("scraper/listing_media_integrity_latest.md")
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")


def _setup_logging(verbose: bool) -> logging.Logger:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    return logging.getLogger(__name__)


def _get_supabase() -> Client:
    env_path = Path(__file__).resolve().parent / ".env"
    load_dotenv(dotenv_path=env_path)
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in scraper/.env")
    return create_client(url, key)


@dataclass
class ListingResult:
    source_site: str
    source_id: str
    title: str
    urls_checked: int
    has_live_image: bool
    first_live_url: str | None
    failure_reasons: list[str]


def _is_http_url(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    text = value.strip()
    return text.startswith("http://") or text.startswith("https://")


def _parse_gallery_urls(raw: Any) -> list[str]:
    if isinstance(raw, list):
        return [str(item).strip() for item in raw if _is_http_url(item)]
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return []
        if text.startswith("[") and text.endswith("]"):
            try:
                parsed = json.loads(text)
                if isinstance(parsed, list):
                    return [str(item).strip() for item in parsed if _is_http_url(item)]
            except Exception:
                return []
        if "," in text:
            return [part.strip() for part in text.split(",") if _is_http_url(part)]
        if _is_http_url(text):
            return [text]
    return []


def _listing_urls(row: dict[str, Any], max_urls_per_listing: int) -> list[str]:
    urls: list[str] = []
    primary = row.get("primary_image_url")
    if _is_http_url(primary):
        urls.append(str(primary).strip())
    urls.extend(_parse_gallery_urls(row.get("image_urls")))
    deduped = list(dict.fromkeys(urls))
    return deduped[: max(1, max_urls_per_listing)]


def _request_url(url: str, timeout: float, method: str) -> tuple[bool, str]:
    parsed = urlparse(url)
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "image/avif,image/webp,image/*,*/*;q=0.8",
    }
    if parsed.hostname:
        headers["Referer"] = f"{parsed.scheme}://{parsed.hostname}/"
    if method == "GET":
        headers["Range"] = "bytes=0-0"

    req = Request(url, headers=headers, method=method)
    try:
        with urlopen(req, timeout=timeout) as response:
            status = int(getattr(response, "status", 0) or 0)
            if 200 <= status < 400:
                return True, f"{method}:{status}"
            return False, f"{method}:{status}"
    except HTTPError as exc:
        return False, f"{method}:{exc.code}"
    except URLError as exc:
        return False, f"{method}:url_error:{exc.reason}"
    except TimeoutError:
        return False, f"{method}:timeout"
    except Exception:
        return False, f"{method}:error"


def _url_is_live(url: str, timeout: float) -> tuple[bool, str]:
    head_ok, head_reason = _request_url(url, timeout=timeout, method="HEAD")
    if head_ok:
        return True, head_reason
    if "HEAD:405" in head_reason or "HEAD:403" in head_reason:
        return _request_url(url, timeout=timeout, method="GET")
    return False, head_reason


def _load_rows(
    supabase: Any,
    *,
    source: str | None,
    source_ids: list[str],
    active_only: bool,
    limit: int | None,
) -> list[dict[str, Any]]:
    columns = "source_site,source_id,title,is_active,primary_image_url,image_urls"
    if source_ids:
        rows: list[dict[str, Any]] = []
        unique_ids = list(dict.fromkeys(source_ids))
        if limit and limit > 0:
            unique_ids = unique_ids[:limit]
        for idx in range(0, len(unique_ids), 200):
            chunk = unique_ids[idx : idx + 200]
            query = supabase.table("aircraft_listings").select(columns).in_("source_id", chunk)
            if source:
                query = query.eq("source_site", source)
            if active_only:
                query = query.eq("is_active", True)
            response = query.execute()
            rows.extend(response.data or [])
        return rows

    rows = []
    batch_size = 500
    offset = 0
    while True:
        query = (
            supabase.table("aircraft_listings")
            .select(columns)
            .order("source_site")
            .order("source_id")
            .range(offset, offset + batch_size - 1)
        )
        if source:
            query = query.eq("source_site", source)
        if active_only:
            query = query.eq("is_active", True)
        response = query.execute()
        chunk = response.data or []
        if not chunk:
            break
        rows.extend(chunk)
        if limit and limit > 0 and len(rows) >= limit:
            return rows[:limit]
        if len(chunk) < batch_size:
            break
        offset += batch_size
    return rows


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")


def _write_markdown(path: Path, payload: dict[str, Any]) -> None:
    summary = payload.get("summary", {})
    by_source = payload.get("by_source", [])
    dead_sample = payload.get("dead_all_sample", [])
    lines = [
        "# Listing Media Integrity Audit",
        "",
        f"- Generated (UTC): {payload.get('generated_at')}",
        f"- Rows scanned: {summary.get('rows_scanned', 0)}",
        f"- Listings with at least one live image: {summary.get('listings_with_live_image', 0)}",
        f"- Listings with all checked images dead: {summary.get('listings_all_dead', 0)}",
        "",
        "## By Source",
        "",
        "| Source | Scanned | Live image | All dead |",
        "|---|---:|---:|---:|",
    ]
    for row in by_source:
        lines.append(
            f"| {row.get('source_site')} | {row.get('scanned', 0)} | {row.get('live', 0)} | {row.get('all_dead', 0)} |"
        )
    lines.extend(
        [
            "",
            "## Dead-All Sample",
            "",
            "| Source | Source ID | Title | URLs checked |",
            "|---|---|---|---:|",
        ]
    )
    for row in dead_sample:
        lines.append(
            f"| {row.get('source_site')} | {row.get('source_id')} | {row.get('title')} | {row.get('urls_checked', 0)} |"
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit whether listing image URLs are actually reachable.")
    parser.add_argument("--source", default=None, help="Limit to one source_site (e.g. aerotrader)")
    parser.add_argument("--source-id", action="append", default=[], help="Specific source_id to audit (repeatable)")
    parser.add_argument("--active-only", action="store_true", help="Only include active listings")
    parser.add_argument("--limit", type=int, default=None, help="Max rows to scan")
    parser.add_argument("--max-urls-per-listing", type=int, default=5, help="Max URLs to test per listing")
    parser.add_argument("--timeout", type=float, default=8.0, help="Per-request timeout in seconds")
    parser.add_argument("--out-json", default=str(DEFAULT_JSON_OUTPUT), help="JSON output file path")
    parser.add_argument("--out-md", default=str(DEFAULT_MD_OUTPUT), help="Markdown output file path")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging")
    args = parser.parse_args()

    log = _setup_logging(args.verbose)
    supabase = _get_supabase()

    rows = _load_rows(
        supabase,
        source=args.source,
        source_ids=[str(v).strip() for v in args.source_id if str(v).strip()],
        active_only=args.active_only,
        limit=args.limit,
    )

    results: list[ListingResult] = []
    by_source_counter: dict[str, dict[str, int]] = defaultdict(lambda: {"scanned": 0, "live": 0, "all_dead": 0})

    for row in rows:
        source_site = str(row.get("source_site") or "unknown").strip().lower() or "unknown"
        source_id = str(row.get("source_id") or "").strip()
        title = str(row.get("title") or "").strip()
        urls = _listing_urls(row, args.max_urls_per_listing)
        has_live = False
        first_live_url: str | None = None
        reasons: list[str] = []

        for url in urls:
            live, reason = _url_is_live(url, timeout=max(1.0, float(args.timeout)))
            if live:
                has_live = True
                first_live_url = url
                break
            reasons.append(reason)

        result = ListingResult(
            source_site=source_site,
            source_id=source_id,
            title=title,
            urls_checked=len(urls),
            has_live_image=has_live,
            first_live_url=first_live_url,
            failure_reasons=reasons[:5],
        )
        results.append(result)

        bucket = by_source_counter[source_site]
        bucket["scanned"] += 1
        if has_live:
            bucket["live"] += 1
        else:
            bucket["all_dead"] += 1

    dead_all = [r for r in results if not r.has_live_image]
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "rows_scanned": len(results),
            "listings_with_live_image": len(results) - len(dead_all),
            "listings_all_dead": len(dead_all),
        },
        "by_source": [
            {"source_site": source, **counts}
            for source, counts in sorted(by_source_counter.items(), key=lambda item: item[0])
        ],
        "dead_all_sample": [
            {
                "source_site": row.source_site,
                "source_id": row.source_id,
                "title": row.title,
                "urls_checked": row.urls_checked,
                "failure_reasons": row.failure_reasons,
            }
            for row in dead_all[:100]
        ],
    }

    json_path = Path(args.out_json)
    md_path = Path(args.out_md)
    _write_json(json_path, payload)
    _write_markdown(md_path, payload)

    log.info(
        "Media integrity audit complete: scanned=%s live=%s all_dead=%s",
        payload["summary"]["rows_scanned"],
        payload["summary"]["listings_with_live_image"],
        payload["summary"]["listings_all_dead"],
    )
    log.info("JSON report: %s", json_path)
    log.info("Markdown report: %s", md_path)


if __name__ == "__main__":
    main()
