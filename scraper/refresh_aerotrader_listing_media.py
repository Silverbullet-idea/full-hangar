from __future__ import annotations

import argparse
import json
import logging
import os
import re
from datetime import date
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright
from supabase import Client, create_client

SOURCE_SITE = "aerotrader"


def setup_logging(verbose: bool) -> logging.Logger:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    return logging.getLogger(__name__)


def get_supabase() -> Client:
    env_path = Path(__file__).resolve().parent / ".env"
    load_dotenv(dotenv_path=env_path)
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in scraper/.env")
    return create_client(url, key)


def collect_photo_urls(html: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    photos: list[str] = []
    seen: set[str] = set()
    gallery = soup.find(id="Gallery") or soup.find(class_=re.compile(r"gallery|rsDefault", flags=re.I))
    sources = gallery.find_all("img") if gallery else soup.select("img[src], img[data-src]")
    for image in sources:
        src = image.get("data-src") or image.get("src") or ""
        src = str(src).strip()
        if not src.startswith("http"):
            continue
        low = src.lower()
        if "coming-soon" in low or "undefined.webp" in low:
            continue
        if low.endswith(".svg") or "/ic_" in low:
            continue
        if any(token in low for token in ("logo", "icon", "sprite", "placeholder")):
            continue
        if src in seen:
            continue
        seen.add(src)
        photos.append(src)
    return photos[:20]


def fetch_listing_html(url: str, headless: bool, timeout_ms: int) -> tuple[str, str]:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=headless,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage"],
        )
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 900},
            locale="en-US",
            timezone_id="America/New_York",
        )
        page = context.new_page()
        response = page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
        page.wait_for_timeout(3000)
        title = page.title()
        html = page.content()
        browser.close()
    status = response.status if response else None
    return title if status == 200 else f"{title} (status={status})", html


def main() -> None:
    parser = argparse.ArgumentParser(description="Targeted AeroTrader media refresh for specific source IDs")
    parser.add_argument("--source-id", required=True, help="AeroTrader source_id")
    parser.add_argument("--headless", default="true", help="Headless browser mode (true/false)")
    parser.add_argument("--timeout-ms", type=int, default=60000, help="Playwright page timeout in milliseconds")
    parser.add_argument("--dry-run", action="store_true", help="Do not update DB")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logs")
    args = parser.parse_args()

    log = setup_logging(args.verbose)
    supabase = get_supabase()
    source_id = str(args.source_id).strip()
    headless = str(args.headless).strip().lower() not in {"false", "0", "no"}

    query = (
        supabase.table("aircraft_listings")
        .select("source_id,source_site,url,source_url,title,primary_image_url,image_urls")
        .eq("source_site", SOURCE_SITE)
        .eq("source_id", source_id)
        .limit(1)
        .execute()
    )
    row = (query.data or [None])[0]
    if not row:
        raise SystemExit(f"No {SOURCE_SITE} row found for source_id={source_id}")

    detail_url = str(row.get("source_url") or row.get("url") or "").strip()
    if not detail_url:
        raise SystemExit(f"Listing {source_id} has no source URL to refresh from")

    title, html = fetch_listing_html(detail_url, headless=headless, timeout_ms=max(10000, args.timeout_ms))
    photos = collect_photo_urls(html)
    blocked_tokens = ["captcha", "forbidden", "blocked", "verify", "challenge", "aerotrader.com"]
    html_lower = html.lower()
    challenge_detected = any(token in html_lower for token in blocked_tokens) and len(photos) == 0

    result = {
        "source_id": source_id,
        "title": row.get("title"),
        "detail_title": title,
        "detail_url": detail_url,
        "photo_count": len(photos),
        "challenge_detected": challenge_detected,
        "photos_preview": photos[:10],
    }
    print(json.dumps(result, indent=2, ensure_ascii=True))

    if args.dry_run:
        return
    if not photos:
        log.warning("No refreshable photos found for source_id=%s; DB unchanged.", source_id)
        return

    payload = {
        "image_urls": photos,
        "primary_image_url": photos[0],
        "last_seen_date": date.today().isoformat(),
        "is_active": True,
        "inactive_date": None,
    }
    (
        supabase.table("aircraft_listings")
        .update(payload)
        .eq("source_site", SOURCE_SITE)
        .eq("source_id", source_id)
        .execute()
    )
    log.info("Updated media for %s source_id=%s urls=%s", SOURCE_SITE, source_id, len(photos))


if __name__ == "__main__":
    main()
