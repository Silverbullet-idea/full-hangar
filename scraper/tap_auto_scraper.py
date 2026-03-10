from __future__ import annotations

import argparse
import asyncio
import json
import logging
import random
import subprocess
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse

from description_parser import parse_description
from scraper_base import compute_listing_fingerprint, fetch_existing_state, get_supabase, setup_logging, should_skip_detail
from tap_cookie_manager import CookieManager
from tap_parser import parse_detail_page, parse_list_card
from tap_session_manager import TAPSessionManager
from tap_upsert import upsert_tap_listings

try:
    from adaptive_rate import AdaptiveRateLimiter
except ImportError:  # pragma: no cover
    from .adaptive_rate import AdaptiveRateLimiter


log = logging.getLogger(__name__)

TAP_CATEGORIES = {
    "Single Engine Piston": {
        "url": "https://www.trade-a-plane.com/search?category_level1=Single+Engine+Piston&s-type=aircraft",
        "aircraft_type": "single_engine_piston",
        "priority": 1,
    },
    "Multi Engine Piston": {
        "url": "https://www.trade-a-plane.com/search?category_level1=Multi+Engine+Piston&s-type=aircraft",
        "aircraft_type": "multi_engine_piston",
        "priority": 2,
    },
    "Turboprop": {
        "url": "https://www.trade-a-plane.com/search?category_level1=Turboprop&s-type=aircraft",
        "aircraft_type": "turboprop",
        "priority": 3,
    },
    "Jets": {
        "url": "https://www.trade-a-plane.com/search?category_level1=Jets&s-type=aircraft",
        "aircraft_type": "jet",
        "priority": 4,
    },
    "Turbine Helicopters": {
        "url": "https://www.trade-a-plane.com/search?category_level1=Turbine+Helicopters&s-type=aircraft",
        "aircraft_type": "turbine_helicopter",
        "priority": 5,
    },
    "Piston Helicopters": {
        "url": "https://www.trade-a-plane.com/search?category_level1=Piston+Helicopters&s-type=aircraft",
        "aircraft_type": "piston_helicopter",
        "priority": 6,
    },
    "Light Sport": {
        "url": "https://www.trade-a-plane.com/search?category_level1=Single+Engine+Piston&s-type=aircraft&light_sport=t",
        "aircraft_type": "light_sport",
        "priority": 7,
    },
}

PAGINATION_PARAM = "s-page"
DEFAULT_PAGE_SIZE = 24

CHECKPOINT_FILE = Path("scraper/state/tap_auto_checkpoint.json")
FAILED_URLS_FILE = Path("scraper/state/tap_auto_failed.json")
STATS_FILE = Path("scraper/state/tap_auto_stats.json")


def build_page_url(category_url: str, page: int) -> str:
    if page <= 1:
        return category_url
    parsed = urlparse(category_url)
    params = parse_qs(parsed.query, keep_blank_values=True)
    params[PAGINATION_PARAM] = [str(page)]
    new_query = urlencode({k: v[0] for k, v in params.items()})
    return parsed._replace(query=new_query).geturl()


@dataclass
class ScrapeCheckpoint:
    category: str
    page: int
    source_ids_seen: list = field(default_factory=list)
    total_extracted: int = 0
    total_upserted: int = 0
    total_failed: int = 0
    session_started: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    last_updated: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    completed_categories: list = field(default_factory=list)


def load_checkpoint() -> ScrapeCheckpoint | None:
    if not CHECKPOINT_FILE.exists():
        return None
    try:
        payload = json.loads(CHECKPOINT_FILE.read_text(encoding="utf-8"))
    except Exception:
        return None
    return ScrapeCheckpoint(**payload)


def save_checkpoint(cp: ScrapeCheckpoint) -> None:
    cp.last_updated = datetime.now(timezone.utc).isoformat()
    CHECKPOINT_FILE.parent.mkdir(parents=True, exist_ok=True)
    CHECKPOINT_FILE.write_text(json.dumps(asdict(cp), indent=2), encoding="utf-8")


def clear_checkpoint() -> None:
    if CHECKPOINT_FILE.exists():
        CHECKPOINT_FILE.unlink()


def _db_needs_detail(existing_row: dict[str, Any] | None) -> bool:
    if not existing_row:
        return True
    required = ("description", "engine_time_since_overhaul", "time_since_prop_overhaul", "seller_name", "state")
    return any(existing_row.get(field) in (None, "") for field in required)


async def generate_completeness_report(supabase, category: str | None = None) -> dict:
    fields = [
        "asking_price",
        "n_number",
        "description",
        "total_time_airframe",
        "state",
        "seller_name",
        "seller_type",
        "engine_time_since_overhaul",
        "time_since_prop_overhaul",
        "avionics_description",
        "engine_model",
        "year",
        "make",
        "model",
        "serial_number",
        "primary_image_url",
        "aircraft_type",
        "num_seats",
        "flight_rules",
    ]
    total_query = supabase.table("aircraft_listings").select("id", count="exact").eq("source_site", "trade_a_plane")
    if category and category in TAP_CATEGORIES:
        total_query = total_query.eq("aircraft_type", TAP_CATEGORIES[category]["aircraft_type"])
    total = total_query.execute().count or 0

    by_field: dict[str, dict[str, float]] = {}
    accum = 0.0
    for field_name in fields:
        q = supabase.table("aircraft_listings").select("id", count="exact").eq("source_site", "trade_a_plane").not_.is_(
            field_name, "null"
        )
        if category and category in TAP_CATEGORIES:
            q = q.eq("aircraft_type", TAP_CATEGORIES[category]["aircraft_type"])
        count = q.execute().count or 0
        pct = (count / total * 100.0) if total else 0.0
        by_field[field_name] = {"count": count, "pct": round(pct, 1)}
        accum += pct
    overall = round((accum / len(fields)) if fields else 0.0, 1)
    gaps = [name for name, data in by_field.items() if data["pct"] < 70.0]
    log.info("[SCORE] TAP completeness: %.1f%% overall", overall)
    if gaps:
        log.info("[SCORE] field gaps: %s", ", ".join(f"{g}={by_field[g]['pct']}%" for g in gaps[:8]))
    return {"total": total, "by_field": by_field, "overall_score": overall, "gaps": gaps}


def print_score_report(report: dict) -> None:
    print(f"[SCORE] TAP completeness: {report.get('overall_score', 0):.1f}% overall ({report.get('total', 0)} rows)")
    for field_name, stats in report.get("by_field", {}).items():
        print(f"  - {field_name}: {stats.get('count', 0)} ({stats.get('pct', 0):.1f}%)")
    gaps = report.get("gaps", [])
    if gaps:
        print("[SCORE] gaps: " + ", ".join(gaps))


def log_score_summary(report: dict, category_name: str) -> None:
    log.info("[SCORE][%s] overall=%.1f%% gaps=%s", category_name, report.get("overall_score", 0.0), ", ".join(report.get("gaps", [])[:6]))


async def scrape_category(
    page,
    category_name: str,
    category_config: dict,
    *,
    limit: int | None = None,
    fetch_details: bool = True,
    dry_run: bool = False,
    supabase=None,
    limiter=None,
    checkpoint: ScrapeCheckpoint,
    session_manager: TAPSessionManager,
    cookie_manager: CookieManager,
    failed_entries: list,
) -> list[dict]:
    listings: list[dict] = []
    seen = set(checkpoint.source_ids_seen or [])
    start_page = checkpoint.page if checkpoint.category == category_name and checkpoint.page > 0 else 1
    page_num = start_page
    consecutive_empty_new = 0

    while True:
        page_url = build_page_url(category_config["url"], page_num)
        soup, was_blocked = await session_manager.navigate_with_healing(page, page_url, expected_content="result_listing", max_attempts=3)
        if was_blocked or soup is None:
            failed_entries.append({"category": category_name, "url": page_url, "error": "blocked", "at": datetime.now(timezone.utc).isoformat()})
            checkpoint.total_failed += 1
            save_checkpoint(checkpoint)
            page_num += 1
            continue

        # Human behavior simulation on list page.
        for _ in range(random.randint(1, 3)):
            await page.mouse.move(random.randint(40, 1200), random.randint(120, 740), steps=random.randint(5, 15))
            await page.mouse.wheel(0, random.randint(180, 640))
        cards = soup.select("div.result_listing")
        page_new = 0
        card_rows = [parse_list_card(card) for card in cards]
        parsed_cards = [row for row in card_rows if row is not None]
        source_ids = [str(row["source_id"]) for row in parsed_cards if row.get("source_id")]
        existing_by_id = {}
        if supabase and source_ids:
            existing_by_id = fetch_existing_state(
                supabase,
                source_site="trade_a_plane",
                source_ids=source_ids,
                select_columns="source_id,listing_fingerprint,last_seen_date,description,engine_time_since_overhaul,time_since_prop_overhaul,seller_name,state",
            )

        for card in parsed_cards:
            sid = str(card.get("source_id") or "")
            if not sid or sid in seen:
                continue
            seen.add(sid)
            page_new += 1
            detail_data: dict[str, Any] = {}
            existing = existing_by_id.get(sid)
            card_fingerprint = compute_listing_fingerprint(card, fields=["title", "asking_price", "n_number", "total_time_airframe", "description"])
            needs_detail = True
            if existing:
                unchanged = str(existing.get("listing_fingerprint") or "") == card_fingerprint
                recent = should_skip_detail(existing, 7)
                needs_detail = not (unchanged and recent and not _db_needs_detail(existing))
            if fetch_details and needs_detail:
                detail_soup, detail_blocked = await session_manager.navigate_with_healing(
                    page, card["url"], expected_content="desktop-v", max_attempts=3
                )
                if detail_soup is not None and not detail_blocked:
                    detail_data = parse_detail_page(str(detail_soup), sid, card["url"])
                else:
                    failed_entries.append(
                        {"category": category_name, "source_id": sid, "url": card["url"], "error": "detail_blocked", "at": datetime.now(timezone.utc).isoformat()}
                    )
                    checkpoint.total_failed += 1
            merged = {**card, **detail_data}
            snippet = str(card.get("description") or "")
            full_desc = str(merged.get("description_full") or merged.get("description") or "")
            merged["description"] = f"{snippet}\n{full_desc}".strip() if full_desc else snippet
            merged["description_intelligence"] = parse_description(merged.get("description") or "")
            merged["listing_fingerprint"] = card_fingerprint
            listings.append(merged)
            checkpoint.total_extracted += 1
            if limit is not None and len(listings) >= limit:
                break
            if limiter:
                await asyncio.to_thread(limiter.wait)
            await asyncio.sleep(random.uniform(0.8, 2.8))

        checkpoint.category = category_name
        checkpoint.page = page_num + 1
        checkpoint.source_ids_seen = list(seen)
        save_checkpoint(checkpoint)

        if page_new == 0:
            consecutive_empty_new += 1
        else:
            consecutive_empty_new = 0
        if consecutive_empty_new >= 2:
            break
        if limit is not None and len(listings) >= limit:
            break

        await asyncio.sleep(max(0.0, 4 + random.gauss(0, 2)))
        if page_num % 5 == 0:
            await asyncio.sleep(random.uniform(15, 35))
        page_num += 1
    return listings


def _save_failed_entries(entries: list[dict]) -> None:
    FAILED_URLS_FILE.parent.mkdir(parents=True, exist_ok=True)
    FAILED_URLS_FILE.write_text(json.dumps(entries, indent=2), encoding="utf-8")


def _save_stats(checkpoint: ScrapeCheckpoint, session_manager: TAPSessionManager) -> None:
    STATS_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATS_FILE.write_text(
        json.dumps(
            {
                "health_score": session_manager.get_health_score(),
                "checkpoint": asdict(checkpoint),
                "updated": datetime.now(timezone.utc).isoformat(),
            },
            indent=2,
        ),
        encoding="utf-8",
    )


async def main():
    parser = argparse.ArgumentParser(description="TAP Auto Scraper")
    parser.add_argument("--category", help="Single category to scrape (default: all)")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=None, help="Max listings per category")
    parser.add_argument("--cards-only", action="store_true", help="Skip detail page fetches")
    parser.add_argument("--resume", action="store_true", help="Resume from checkpoint")
    parser.add_argument("--retry-failed", action="store_true", help="Retry failed_urls_tap.json")
    parser.add_argument("--cookie-status", action="store_true", help="Print cookie health and exit")
    parser.add_argument("--score-report", action="store_true", help="Print field completeness and exit")
    parser.add_argument("--refresh-scores", action="store_true", help="Run backfill after scrape")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    global log
    log = setup_logging(args.verbose)

    if args.cookie_status:
        manager = CookieManager("scraper/tap_cookies.json")
        manager.print_status()
        return

    if args.score_report:
        supabase = get_supabase()
        report = await generate_completeness_report(supabase)
        print_score_report(report)
        return

    cookie_manager = CookieManager("scraper/tap_cookies.json")
    if not cookie_manager.has_valid_datadome():
        log.error("DataDome cookie missing or expired. Run --cookie-status for details.")
        log.error("Refresh cookies: browse trade-a-plane.com, export via EditThisCookie.")
        return
    cookie_manager.print_status()

    checkpoint = load_checkpoint() if args.resume else None
    if checkpoint is None:
        checkpoint = ScrapeCheckpoint(category="", page=1)

    if args.category:
        if args.category not in TAP_CATEGORIES:
            raise SystemExit(f"Unknown category: {args.category}")
        categories = {args.category: TAP_CATEGORIES[args.category]}
    else:
        categories = dict(sorted(TAP_CATEGORIES.items(), key=lambda x: x[1]["priority"]))
        if args.resume:
            categories = {k: v for k, v in categories.items() if k not in checkpoint.completed_categories}

    supabase = None if args.dry_run else get_supabase()
    limiter = None if args.dry_run else AdaptiveRateLimiter(supabase, "trade_a_plane", logger=log)

    failed_entries: list[dict] = []
    if args.retry_failed and FAILED_URLS_FILE.exists():
        try:
            failed_entries = json.loads(FAILED_URLS_FILE.read_text(encoding="utf-8"))
        except Exception:
            failed_entries = []

    from playwright.async_api import async_playwright

    async with async_playwright() as playwright:
        session_manager = TAPSessionManager()
        browser, context, page = await session_manager.create_session(playwright, cookie_manager)
        try:
            log.info("Warming up session on TAP homepage...")
            await session_manager.navigate_with_healing(page, "https://www.trade-a-plane.com/", expected_content="result_listing")
            await session_manager.human_warmup(page)

            for idx, (category_name, category_config) in enumerate(categories.items()):
                log.info("[TAP] Starting category: %s", category_name)
                category_listings = await scrape_category(
                    page=page,
                    category_name=category_name,
                    category_config=category_config,
                    limit=args.limit,
                    fetch_details=not args.cards_only,
                    dry_run=args.dry_run,
                    supabase=supabase,
                    limiter=limiter,
                    checkpoint=checkpoint,
                    session_manager=session_manager,
                    cookie_manager=cookie_manager,
                    failed_entries=failed_entries,
                )
                if category_name not in checkpoint.completed_categories:
                    checkpoint.completed_categories.append(category_name)
                save_checkpoint(checkpoint)

                if supabase and category_listings:
                    upserted = upsert_tap_listings(supabase, category_listings)
                    checkpoint.total_upserted += upserted
                    log.info("[TAP] %s: %s/%s upserted", category_name, upserted, len(category_listings))

                if supabase and not args.dry_run:
                    report = await generate_completeness_report(supabase, category_name)
                    log_score_summary(report, category_name)

                if idx < len(categories) - 1:
                    between_delay = random.uniform(30, 60)
                    log.info("[TAP] Between-category pause: %.0fs", between_delay)
                    await asyncio.sleep(between_delay)

            await cookie_manager.export_from_context(context)
            log.info("[TAP] Cookies exported to tap_cookies.json")
        finally:
            _save_failed_entries(failed_entries)
            _save_stats(checkpoint, session_manager)
            await context.close()
            await browser.close()

    if args.refresh_scores and not args.dry_run:
        log.info("[TAP] Running score backfill...")
        subprocess.run(
            [".venv312\\Scripts\\python.exe", "scraper\\backfill_scores.py", "--from-source", "trade_a_plane", "--compute-comps"],
            check=False,
        )

    if supabase and not args.dry_run:
        report = await generate_completeness_report(supabase)
        print_score_report(report)

    clear_checkpoint()


if __name__ == "__main__":
    asyncio.run(main())
