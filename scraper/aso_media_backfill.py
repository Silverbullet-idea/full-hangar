"""
Refresh gallery/primary image fields for ASO listings with sparse media.

Uses shared media_refresh_utils selection rules and ASO detail-page gallery extraction.
Run from repo root: .venv312\\Scripts\\python.exe scraper\\aso_media_backfill.py
"""

from __future__ import annotations

import argparse
import logging
import random
import re
import time
import requests

try:
    from aso_scraper import BASE_URL, REQUEST_HEADERS, scrape_detail_page, setup_logging
    from env_check import env_check
    from media_refresh_utils import apply_media_update, fetch_refresh_rows, load_source_ids_file, seen_within_hours
    from scraper_base import get_supabase
except ImportError:  # pragma: no cover
    from .aso_scraper import BASE_URL, REQUEST_HEADERS, scrape_detail_page, setup_logging
    from .env_check import env_check
    from .media_refresh_utils import apply_media_update, fetch_refresh_rows, load_source_ids_file, seen_within_hours
    from .scraper_base import get_supabase

SOURCE_SITE = "aso"
log = logging.getLogger(__name__)


def _adv_id_from_source_id(source_id: str) -> str | None:
    raw = str(source_id or "").strip()
    if not raw:
        return None
    if raw.lower().startswith("aso_"):
        tail = raw[4:].strip()
        return tail or None
    m = re.search(r"(\d{4,})", raw)
    return m.group(1) if m else None


def _sleep_between(min_s: float, max_s: float) -> None:
    time.sleep(random.uniform(min_s, max_s))


def run_media_backfill(
    *,
    dry_run: bool,
    limit: int | None,
    source_ids_file: str | None,
    ignore_detail_stale: bool,
    delay_min: float,
    delay_max: float,
    detail_delay_min: float,
    detail_delay_max: float,
    verbose: bool,
) -> None:
    global log
    log = setup_logging(verbose)
    env_check()

    source_ids = load_source_ids_file(source_ids_file)
    supabase = get_supabase()
    candidates = fetch_refresh_rows(
        supabase,
        source_site=SOURCE_SITE,
        source_ids=source_ids,
        limit=limit,
    )

    session = requests.Session()
    try:
        session.get(BASE_URL, headers=REQUEST_HEADERS, timeout=15)
    except Exception as exc:
        log.warning("Session warmup failed: %s", exc)

    scanned = 0
    updated = 0
    for row in candidates:
        source_id = str(row.get("source_id") or "").strip()
        if not source_id:
            continue
        adv_id = _adv_id_from_source_id(source_id)
        if not adv_id:
            log.debug("Skip row with unparseable source_id=%s", source_id)
            continue
        if not ignore_detail_stale and seen_within_hours(row.get("last_seen_date"), 48):
            continue
        scanned += 1
        _sleep_between(detail_delay_min, detail_delay_max)
        detail = scrape_detail_page(session, adv_id, min_delay=delay_min, max_delay=delay_max)
        image_urls = detail.get("image_urls") if isinstance(detail.get("image_urls"), list) else []
        primary = str(detail.get("primary_image_url") or "").strip() or (image_urls[0] if image_urls else None)
        if not image_urls and not primary:
            continue
        if dry_run:
            log.info(
                "[media-refresh] dry-run source_id=%s gallery_count=%s primary=%s",
                source_id,
                len(image_urls),
                bool(primary),
            )
            continue
        apply_media_update(
            supabase,
            source_site=SOURCE_SITE,
            source_id=source_id,
            image_urls=image_urls,
            primary_image_url=primary,
        )
        updated += 1

    log.info(
        "[media-refresh] aso complete candidates=%s scanned=%s updated=%s dry_run=%s",
        len(candidates),
        scanned,
        updated,
        dry_run,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="ASO listing media refresh (gallery / primary image)")
    parser.add_argument("--dry-run", action="store_true", help="Do not write database updates")
    parser.add_argument("--limit", type=int, default=None, help="Max rows to process (from sparse-media query)")
    parser.add_argument("--source-ids-file", default=None, help="Optional file of source_id values (one per line)")
    parser.add_argument(
        "--ignore-detail-stale",
        action="store_true",
        help="Bypass 48h last_seen_date guard (re-fetch detail anyway)",
    )
    parser.add_argument("--delay-min", type=float, default=2.5)
    parser.add_argument("--delay-max", type=float, default=5.0)
    parser.add_argument("--detail-delay-min", type=float, default=3.0)
    parser.add_argument("--detail-delay-max", type=float, default=7.0)
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()
    run_media_backfill(
        dry_run=args.dry_run,
        limit=args.limit,
        source_ids_file=args.source_ids_file,
        ignore_detail_stale=args.ignore_detail_stale,
        delay_min=args.delay_min,
        delay_max=args.delay_max,
        detail_delay_min=args.detail_delay_min,
        detail_delay_max=args.detail_delay_max,
        verbose=args.verbose,
    )


if __name__ == "__main__":
    main()
