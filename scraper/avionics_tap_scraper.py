from __future__ import annotations

import argparse
import json
import logging
import random
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode, urljoin

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.trade-a-plane.com"
SEARCH_PATH = "/search"
OUT_PATH = Path("scraper/data/avionics/inventory_extracts/trade_a_plane_avionics.json")
REQUEST_TIMEOUT = 35
DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

log = logging.getLogger("tap_avionics_scraper")


def _setup_logging(verbose: bool) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(level=level, format="%(asctime)s [%(levelname)s] %(message)s")


def _build_search_url(page: int = 1) -> str:
    params = {"s-type": "avionics"}
    if page > 1:
        params["page"] = str(page)
    return f"{BASE_URL}{SEARCH_PATH}?{urlencode(params)}"


def _looks_like_block_page(html_text: str) -> bool:
    low = (html_text or "").lower()
    if "result_listing" in low or "data-listing_id" in low:
        return False
    if len(low) < 2500 and "trade-a-plane.com" in low:
        return True
    block_markers = (
        "please enable js and disable any ad blocker",
        "captcha-delivery",
        "cloudflare",
        "verify you are human",
        "access denied",
    )
    return any(marker in low for marker in block_markers)


def _fetch_with_playwright(url: str) -> str | None:
    try:
        from playwright.sync_api import sync_playwright
    except Exception as exc:
        log.warning("Playwright unavailable for %s: %s", url, exc)
        return None

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=False,
                args=[
                    "--no-sandbox",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-dev-shm-usage",
                ],
            )
            context = browser.new_context(
                user_agent=DEFAULT_HEADERS["User-Agent"],
                viewport={"width": 1366, "height": 900},
                locale="en-US",
            )
            context.add_init_script(
                """
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3] });
                Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
                """
            )
            page = context.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(random.uniform(4500, 7000))
            html = page.content()
            context.close()
            browser.close()
            return html
    except Exception as exc:
        log.warning("Playwright fetch failed for %s: %s", url, exc)
        return None


def _fetch_html(session: requests.Session, url: str, use_playwright_fallback: bool = True) -> str | None:
    for delay in (0.0, 2.0, 6.0):
        if delay > 0:
            time.sleep(delay)
        try:
            resp = session.get(url, timeout=REQUEST_TIMEOUT)
            if resp.status_code == 200 and resp.text:
                if not _looks_like_block_page(resp.text):
                    return resp.text
                log.warning("Detected block/challenge via requests for %s", url)
            elif resp.status_code != 200:
                log.warning("Non-200 status=%s for %s", resp.status_code, url)
        except requests.RequestException as exc:
            log.warning("Request failed for %s: %s", url, exc)
    if use_playwright_fallback:
        html = _fetch_with_playwright(url)
        if html and _looks_like_block_page(html):
            log.warning("Playwright still blocked/challenged for %s", url)
            return None
        return html
    return None


def _extract_price(text: str) -> int | None:
    if not text:
        return None
    if "call" in text.lower():
        return None
    m = re.search(r"\$\s*([\d,]+)", text)
    if not m:
        return None
    try:
        return int(m.group(1).replace(",", ""))
    except ValueError:
        return None


def _extract_cards(soup: BeautifulSoup) -> list:
    selectors = [
        "div.result_listing",
        "div.result-listing",
        "div[class*='result_listing']",
        "article.listing-card",
    ]
    for selector in selectors:
        cards = soup.select(selector)
        if cards:
            return cards
    return []


def _extract_label_values(soup: BeautifulSoup) -> dict[str, str]:
    values: dict[str, str] = {}
    for block in soup.select("#general_specs p, #additional_classifications p, #info-list-seller li"):
        label_el = block.select_one("label")
        if not label_el:
            continue
        key = re.sub(r"[^a-z0-9]+", " ", label_el.get_text(" ", strip=True).lower()).strip()
        value_text = block.get_text(" ", strip=True)
        label_text = label_el.get_text(" ", strip=True)
        if value_text.lower().startswith(label_text.lower()):
            value_text = value_text[len(label_text) :].strip(" :|-")
        if key and value_text and key not in values:
            values[key] = value_text
    return values


def _parse_card(card) -> dict | None:
    link = (
        card.select_one("a.log_listing_click[href]")
        or card.select_one("a.result_listing_click[href]")
        or card.select_one("a[href*='listing_id='][href]")
        or card.select_one("a[href]")
    )
    if not link:
        return None
    href = (link.get("href") or "").strip()
    if not href:
        return None
    listing_url = urljoin(BASE_URL, href)
    title_el = card.select_one("a#title, .result-title, .listing-title, h2, h3, h4")
    title = title_el.get_text(" ", strip=True) if title_el else link.get_text(" ", strip=True)
    title = re.sub(r"\s*-\s*Listing\s*#:\s*\d+\s*$", "", title, flags=re.I).strip()
    if not title:
        return None

    card_text = card.get_text(" ", strip=True)
    price = _extract_price(card_text)
    seller = None
    seller_el = card.select_one("[itemprop='name'], .seller, .dealer")
    if seller_el:
        seller = seller_el.get_text(" ", strip=True) or None

    location = None
    address_el = card.select_one("[itemprop='address'], .address, .location")
    if address_el:
        location = address_el.get_text(" ", strip=True) or None

    return {
        "source": "trade_a_plane_avionics",
        "source_category": "avionics",
        "listing_url": listing_url,
        "title": title,
        "price": price,
        "currency": "USD",
        "seller_name": seller,
        "location_raw": location,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
    }


def _enrich_detail(session: requests.Session, record: dict, *, use_playwright_fallback: bool) -> None:
    html = _fetch_html(session, str(record.get("listing_url") or ""), use_playwright_fallback=use_playwright_fallback)
    if not html:
        return
    soup = BeautifulSoup(html, "html.parser")
    raw_text = soup.get_text(" ", strip=True)

    price_el = soup.select_one(".price, .listing-price, .ask-price")
    if price_el:
        price = _extract_price(price_el.get_text(" ", strip=True))
        if price is not None:
            record["price"] = price

    desc_el = soup.select_one("#detailed_desc pre, .description, #description")
    if desc_el:
        description = re.sub(r"\s+", " ", desc_el.get_text(" ", strip=True)).strip()
        if description:
            record["description"] = description

    labels = _extract_label_values(soup)
    if labels:
        record["raw_data"] = {
            "tap_avionics_labeled_fields": labels,
            "tap_avionics_captured_at": datetime.now(timezone.utc).isoformat(),
        }
        cond = labels.get("condition")
        if cond and not record.get("condition"):
            record["condition"] = cond

    title_el = soup.select_one("h1")
    if title_el:
        title = re.sub(r"\s+", " ", title_el.get_text(" ", strip=True)).strip()
        if title:
            record["title"] = title

    if "part_number" not in record:
        pn_match = re.search(r"\b(?:P\/N|PART(?:\s+NUMBER)?)\s*[:#-]?\s*([A-Z0-9\-]{3,})\b", raw_text, flags=re.I)
        if pn_match:
            record["part_number"] = pn_match.group(1).upper()


def scrape_tap_avionics(
    *, max_pages: int | None, limit: int | None, enrich_detail: bool, use_playwright_fallback: bool
) -> list[dict]:
    session = requests.Session()
    session.headers.update(DEFAULT_HEADERS)

    records: list[dict] = []
    seen_urls: set[str] = set()
    page = 1
    while True:
        if max_pages is not None and page > max_pages:
            break
        url = _build_search_url(page)
        log.info("Fetching TAP avionics page %s: %s", page, url)
        html = _fetch_html(session, url, use_playwright_fallback=use_playwright_fallback)
        if not html:
            break
        soup = BeautifulSoup(html, "html.parser")
        cards = _extract_cards(soup)
        if not cards:
            log.info("No cards on page %s; stopping.", page)
            break

        page_new = 0
        for card in cards:
            parsed = _parse_card(card)
            if not parsed:
                continue
            listing_url = str(parsed.get("listing_url") or "")
            if not listing_url or listing_url in seen_urls:
                continue
            seen_urls.add(listing_url)
            if enrich_detail:
                _enrich_detail(session, parsed, use_playwright_fallback=use_playwright_fallback)
                time.sleep(0.4)
            records.append(parsed)
            page_new += 1
            if limit is not None and len(records) >= limit:
                return records

        if page_new == 0:
            break
        page += 1
        time.sleep(0.8)
    return records


def main() -> int:
    parser = argparse.ArgumentParser(description="Scrape Trade-A-Plane avionics inventory listings.")
    parser.add_argument("--max-pages", type=int, default=None, help="Max pages to crawl (default: all).")
    parser.add_argument("--limit", type=int, default=None, help="Max listings to save.")
    parser.add_argument("--no-detail", action="store_true", help="Skip detail page enrichment.")
    parser.add_argument("--no-playwright-fallback", action="store_true", help="Disable Playwright fallback.")
    parser.add_argument("--output", default=str(OUT_PATH), help="Output JSON file path.")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logs.")
    args = parser.parse_args()

    _setup_logging(args.verbose)
    records = scrape_tap_avionics(
        max_pages=args.max_pages,
        limit=args.limit,
        enrich_detail=not args.no_detail,
        use_playwright_fallback=not args.no_playwright_fallback,
    )
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(records, indent=2, ensure_ascii=True), encoding="utf-8")
    log.info("Saved %s TAP avionics records to %s", len(records), output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
