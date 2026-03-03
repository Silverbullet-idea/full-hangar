"""
Trade-A-Plane aircraft listing scraper (requests-first, Playwright fallback).

Usage:
    python scraper/tradaplane_scraper.py
    python scraper/tradaplane_scraper.py --make Cessna --limit 5 --dry-run
    python scraper/tradaplane_scraper.py --output scraper/trade_a_plane_all.json --verbose
"""

from __future__ import annotations

import argparse
import hashlib
import html as html_module
import json
import logging
import os
import random
import re
import time
from datetime import date
from pathlib import Path
from typing import Any, Callable, Optional, TYPE_CHECKING
from urllib.parse import parse_qs, urlencode, urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

if TYPE_CHECKING:
    from supabase import Client

load_dotenv()


def get_supabase():
    """Lazy import so --dry-run does not require supabase client/env."""
    from supabase import create_client

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise EnvironmentError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env")
    return create_client(url, key)


def setup_logging(verbose: bool = False) -> logging.Logger:
    level = logging.DEBUG if verbose else logging.INFO
    log_format = "%(asctime)s [%(levelname)s] %(message)s"

    root = logging.getLogger()
    root.setLevel(level)
    for handler in root.handlers[:]:
        root.removeHandler(handler)

    stream = logging.StreamHandler()
    stream.setLevel(level)
    stream.setFormatter(logging.Formatter(log_format))

    file_handler = logging.FileHandler("scraper.log", encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter(log_format))

    root.addHandler(stream)
    root.addHandler(file_handler)

    logger = logging.getLogger(__name__)
    logger.setLevel(level)
    return logger


log = logging.getLogger(__name__)

BASE_URL = "https://www.trade-a-plane.com"
SEARCH_PATH = "/search"
DEFAULT_MAKES = ["Cessna", "Piper", "Beechcraft", "Grumman", "Mooney"]
DEFAULT_CHECKPOINT_FILE = Path("scraper/state/tradaplane_checkpoint.json")

REQUEST_TIMEOUT = 30
DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Connection": "keep-alive",
}


def build_make_url(make: str, page: int = 1) -> str:
    """
    Build Trade-A-Plane search URL for piston single by make.
    """
    params: dict[str, str] = {
        "category_level1": "Single Engine Piston",
        "make": make.upper(),
        "s-type": "aircraft",
    }
    if page > 1:
        params["page"] = str(page)
    return f"{BASE_URL}{SEARCH_PATH}?{urlencode(params)}"


def _parse_price(price_text: str) -> Optional[int]:
    if not price_text:
        return None
    if "call" in price_text.lower():
        return None
    matches = re.findall(r"\d[\d,]*", price_text)
    if not matches:
        return None
    try:
        return int(matches[0].replace(",", ""))
    except ValueError:
        return None


def _extract_price_text(text: str) -> Optional[str]:
    if not text:
        return None
    call_match = re.search(r"\bcall(?:\s+for\s+price)?\b", text, flags=re.I)
    if call_match:
        return "Call"
    money_match = re.search(r"\$\s*[\d,]+", text)
    if money_match:
        return money_match.group(0)
    return None


def _extract_listing_numeric_id(listing_url: str) -> Optional[str]:
    parsed = urlparse(listing_url)
    query = parse_qs(parsed.query)
    for key in ("listing_id", "id"):
        values = query.get(key) or []
        if values and values[0].strip().isdigit():
            return values[0].strip()

    segments = [seg for seg in parsed.path.strip("/").split("/") if seg]
    for seg in reversed(segments):
        if re.fullmatch(r"\d{4,12}", seg):
            return seg

    tail_digits = re.search(r"(\d{4,12})$", parsed.path)
    if tail_digits:
        return tail_digits.group(1)
    return None


def _extract_source_id(listing_url: str) -> str:
    numeric = _extract_listing_numeric_id(listing_url)
    if numeric:
        return f"tap_{numeric}"
    digest = hashlib.sha1(listing_url.encode("utf-8")).hexdigest()[:12]
    return f"tap_{digest}"


def _split_city_state(location_text: str) -> tuple[Optional[str], Optional[str]]:
    clean = (location_text or "").strip()
    if not clean:
        return None, None
    parts = [p.strip() for p in clean.split(",")]
    if len(parts) >= 2:
        city = parts[0] or None
        state_raw = parts[1].split()[0] if parts[1] else ""
        state = state_raw.upper()[:2] if state_raw else None
        return city, state
    return clean, None


def _extract_year_make_model(title_text: str) -> tuple[Optional[int], Optional[str], Optional[str]]:
    if not title_text:
        return None, None, None
    normalized = re.sub(r"\s+", " ", title_text).strip()
    year_match = re.search(r"\b(19|20)\d{2}\b", normalized)
    if not year_match:
        return None, None, normalized or None

    year_val = int(year_match.group(0))
    after_year = normalized[year_match.end() :].strip()
    if not after_year:
        return year_val, None, None
    parts = after_year.split(None, 1)
    make_val = parts[0].title() if parts else None
    model_val = parts[1].strip() if len(parts) > 1 else None
    return year_val, make_val, model_val


def _looks_like_block_page(html_text: str) -> bool:
    low = (html_text or "").lower()
    if "result_listing" in low or "data-listing_id" in low:
        return False
    if len(low) < 3000 and "trade-a-plane.com" in low:
        return True
    block_markers = (
        "access denied",
        "cloudflare",
        "captcha",
        "robot check",
        "verify you are human",
    )
    return any(marker in low for marker in block_markers)


def _extract_next_page_url(soup: BeautifulSoup, current_url: str, page_num: int) -> Optional[str]:
    next_link = soup.select_one("a[rel='next'], a.next")
    if next_link and next_link.get("href"):
        return urljoin(BASE_URL, next_link.get("href"))

    for anchor in soup.select("a[href]"):
        text = anchor.get_text(" ", strip=True)
        if text in (">", ">>", "Next", "NEXT"):
            return urljoin(BASE_URL, anchor.get("href"))

    parsed = urlparse(current_url)
    query = parse_qs(parsed.query)
    candidate = page_num + 1
    if "page" in query:
        query["page"] = [str(candidate)]
        return parsed._replace(query=urlencode(query, doseq=True)).geturl()
    query["page"] = [str(candidate)]
    return parsed._replace(query=urlencode(query, doseq=True)).geturl()


def _extract_logbook_urls(soup: BeautifulSoup) -> list[str]:
    links: list[str] = []
    seen: set[str] = set()
    keywords = (
        "logbook",
        "logs",
        "maintenance records",
        "airframe records",
        "engine records",
        "records",
    )
    for anchor in soup.select("a[href]"):
        href = (anchor.get("href") or "").strip()
        if not href:
            continue
        absolute = urljoin(BASE_URL, href)
        text = anchor.get_text(" ", strip=True).lower()
        low_href = absolute.lower()
        is_doc = any(low_href.endswith(ext) for ext in (".pdf", ".doc", ".docx", ".xls", ".xlsx"))
        is_logbook = any(key in text for key in keywords) or any(key in low_href for key in ("logbook", "record", "logs"))
        if not (is_doc or is_logbook):
            continue
        if absolute in seen:
            continue
        seen.add(absolute)
        links.append(absolute)
    return links


def _compute_listing_fingerprint(listing: dict) -> str:
    fields = [
        str(listing.get("source_site") or ""),
        str(listing.get("source_id") or ""),
        str(listing.get("url") or ""),
        str(listing.get("price_asking") or ""),
        str(listing.get("year") or ""),
        str(listing.get("make") or ""),
        str(listing.get("model") or ""),
        str(listing.get("location_city") or ""),
        str(listing.get("location_state") or ""),
        str(listing.get("description") or ""),
    ]
    material = "|".join(fields)
    return hashlib.sha1(material.encode("utf-8")).hexdigest()


def _fetch_existing_fingerprints(supabase: "Client", source_ids: list[str]) -> dict[str, str]:
    if not source_ids:
        return {}
    existing: dict[str, str] = {}
    unique_source_ids = list(dict.fromkeys(source_ids))
    for idx in range(0, len(unique_source_ids), 200):
        chunk = unique_source_ids[idx : idx + 200]
        rows = (
            supabase.table("aircraft_listings")
            .select("source_id,listing_fingerprint")
            .eq("source_site", "trade_a_plane")
            .in_("source_id", chunk)
            .execute()
        )
        for row in rows.data or []:
            sid = row.get("source_id")
            fp = row.get("listing_fingerprint")
            if sid is not None and fp:
                existing[str(sid)] = str(fp)
    return existing


def load_checkpoint(checkpoint_file: Path) -> Optional[dict[str, Any]]:
    if not checkpoint_file.exists():
        return None
    try:
        payload = json.loads(checkpoint_file.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return None
        return payload
    except Exception as exc:
        log.warning("Failed to read checkpoint %s: %s", checkpoint_file, exc)
        return None


def save_checkpoint(checkpoint_file: Path, payload: dict[str, Any]) -> None:
    checkpoint_file.parent.mkdir(parents=True, exist_ok=True)
    checkpoint_file.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")


def clear_checkpoint(checkpoint_file: Path) -> None:
    if checkpoint_file.exists():
        checkpoint_file.unlink(missing_ok=True)


class HtmlFetcher:
    """Requests-first HTML fetcher with optional Playwright fallback."""

    def __init__(self, use_playwright_fallback: bool = True) -> None:
        self.session = requests.Session()
        self.session.headers.update(DEFAULT_HEADERS)
        self.use_playwright_fallback = use_playwright_fallback

    def fetch(self, url: str) -> Optional[str]:
        try:
            response = self.session.get(url, timeout=REQUEST_TIMEOUT)
            if response.status_code == 200:
                if not _looks_like_block_page(response.text):
                    return response.text
                log.warning("Potential challenge/block page via requests: %s", url)
            else:
                log.warning("Non-200 status %s for %s", response.status_code, url)
        except requests.RequestException as exc:
            log.warning("Requests fetch failed for %s: %s", url, exc)

        if not self.use_playwright_fallback:
            return None
        return self._fetch_with_playwright(url)

    def _fetch_with_playwright(self, url: str) -> Optional[str]:
        try:
            from playwright.sync_api import sync_playwright
        except Exception as exc:
            log.warning("Playwright unavailable; cannot fallback for %s (%s)", url, exc)
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
                response = page.goto(url, wait_until="domcontentloaded", timeout=45000)
                page.wait_for_timeout(random.uniform(4500, 7000))
                html = page.content()
                status = response.status if response else None
                context.close()
                browser.close()
                if status != 200:
                    log.warning("Playwright non-200 status %s for %s", status, url)
                    return None
                return html
        except Exception as exc:
            log.warning("Playwright fallback failed for %s: %s", url, exc)
            return None


def _collect_specs_from_soup(soup: BeautifulSoup) -> dict[str, str]:
    specs: dict[str, str] = {}

    for row in soup.select("table tr"):
        cells = row.find_all(["th", "td"])
        if len(cells) < 2:
            continue
        key = cells[0].get_text(" ", strip=True).lower().rstrip(":")
        value = cells[1].get_text(" ", strip=True)
        if key and value:
            specs[key] = value

    for dt in soup.select("dt"):
        key = dt.get_text(" ", strip=True).lower().rstrip(":")
        dd = dt.find_next_sibling("dd")
        if not dd:
            continue
        value = dd.get_text(" ", strip=True)
        if key and value and key not in specs:
            specs[key] = value

    for label in soup.select(".spec-label, .label"):
        key = label.get_text(" ", strip=True).lower().rstrip(":")
        value_el = label.find_next_sibling()
        if not value_el:
            continue
        value = value_el.get_text(" ", strip=True)
        if key and value and key not in specs:
            specs[key] = value

    return specs


def fetch_listing_detail(fetcher: HtmlFetcher, listing_url: str) -> dict:
    extra: dict = {}
    html = fetcher.fetch(listing_url)
    if not html:
        return extra

    soup = BeautifulSoup(html, "html.parser")
    raw_text = soup.get_text(" ", strip=True)

    # Price
    price_text = None
    price_el = soup.select_one(".price, .listing-price, .ask-price, .detail-price")
    if price_el:
        price_text = price_el.get_text(" ", strip=True)
    if not price_text:
        price_text = _extract_price_text(raw_text)
    if price_text:
        price = _parse_price(price_text)
        if price is not None:
            extra["price_asking"] = price

    # Images
    images: list[str] = []
    seen: set[str] = set()
    for img in soup.select("img[src], img[data-src]"):
        src = (img.get("data-src") or img.get("src") or "").strip()
        if not src:
            continue
        absolute = urljoin(BASE_URL, src)
        if absolute in seen:
            continue
        low = absolute.lower()
        if any(
            skip in low
            for skip in (
                "/_common/images/",
                "/search/images/",
                "chicklet",
                "ajax_loader",
                "insurance.png",
                "aopa_loan_calc",
                "logo",
                "icon",
                "sprite",
                "placeholder",
            )
        ):
            continue
        seen.add(absolute)
        images.append(absolute)
    if images:
        extra["primary_image_url"] = images[0]
        extra["image_urls"] = images

    logbook_urls = _extract_logbook_urls(soup)
    if logbook_urls:
        extra["logbook_urls"] = logbook_urls

    # Location and seller
    location_text = None
    location_el = soup.select_one(".listing-location, .location, [itemprop='address']")
    if location_el:
        location_text = location_el.get_text(" ", strip=True)
    if not location_text:
        location_match = re.search(r"\b([A-Za-z .'-]+,\s*[A-Z]{2})(?:\s+USA)?\b", raw_text)
        if location_match:
            location_text = location_match.group(1)
    if location_text:
        city, state = _split_city_state(location_text)
        if city:
            extra["location_city"] = city
        if state:
            extra["location_state"] = state

    seller_el = soup.select_one(".seller, .dealer, .contact-name, [itemprop='seller']")
    if seller_el:
        seller = seller_el.get_text(" ", strip=True)
        if seller:
            extra["seller_name"] = seller

    desc_el = soup.select_one(".description, #description, .listing-description, .remarks")
    if desc_el:
        desc = html_module.unescape(desc_el.get_text(" ", strip=True))
        if desc:
            extra["description"] = desc

    specs = _collect_specs_from_soup(soup)
    if specs:
        log.debug("Detail specs parsed: %s", list(specs.keys()))

    if "year" in specs:
        m = re.search(r"\b(19|20)\d{2}\b", specs["year"])
        if m:
            extra["year"] = int(m.group(0))

    for make_key in ("make", "manufacturer"):
        if make_key in specs:
            extra["make"] = specs[make_key].strip().title()
            break

    if "model" in specs:
        extra["model"] = specs["model"].strip()

    for key in ("total time", "ttaf", "airframe time"):
        if key in specs:
            m = re.search(r"[\d,]+", specs[key])
            if m:
                extra["total_time_airframe"] = int(m.group(0).replace(",", ""))
                break

    for key in ("smoh", "engine time", "time since overhaul", "time since major overhaul"):
        if key in specs:
            m = re.search(r"[\d,]+", specs[key])
            if m:
                extra["engine_time_since_overhaul"] = int(m.group(0).replace(",", ""))
                break

    for key in ("engine", "engine model", "engine make/model", "powerplant"):
        if key in specs:
            extra["engine_model"] = specs[key].strip()
            break

    for key in ("avionics", "avionics/radios", "panel"):
        if key in specs:
            extra["avionics_description"] = html_module.unescape(specs[key]).strip()
            break

    return extra


def parse_listing_card(card) -> Optional[dict]:
    try:
        link = (
            card.select_one("a.log_listing_click[href]")
            or card.select_one("a.result_listing_click[href]")
            or card.select_one("a.listing_click[href]")
            or card.select_one("a[href*='listing_id='][href]")
            or card.select_one("a[href*='/search/'][href]")
            or card.select_one("a[href]")
        )
        if not link:
            return None

        href = (link.get("href") or "").strip()
        if not href:
            return None

        listing_url = urljoin(BASE_URL, href)
        if "trade-a-plane.com" not in urlparse(listing_url).netloc:
            return None

        source_id = _extract_source_id(listing_url)

        title_el = (
            card.select_one("a#title")
            or card.select_one(".result-title")
            or card.select_one(".listing-title")
            or card.select_one("h2, h3, h4")
            or link
        )
        title_text = title_el.get("title", "").strip() if title_el else ""
        if not title_text and title_el:
            title_text = title_el.get_text(" ", strip=True)
        title_text = re.sub(r"\s*-\s*Listing\s*#:\s*\d+\s*$", "", title_text, flags=re.I).strip()
        year, make, model = _extract_year_make_model(title_text)

        card_text = card.get_text(" ", strip=True)
        price_text = None
        price_el = card.select_one(".price, .listing-price, .result-price, .sale_price")
        if price_el:
            price_text = price_el.get_text(" ", strip=True)
        if not price_text:
            price_text = _extract_price_text(card_text)
        price_asking = _parse_price(_extract_price_text(price_text or "") or (price_text or ""))

        location_text = ""
        location_el = card.select_one(".location, .listing-location, .city-state, .address")
        if location_el:
            location_text = location_el.get_text(" ", strip=True)
        if not location_text:
            loc_match = re.search(r"\b[A-Za-z .'-]+,\s*[A-Z]{2}\b", card_text)
            if loc_match:
                location_text = loc_match.group(0)
        city, state = _split_city_state(location_text)

        img_el = card.select_one("img[src]")
        primary_image_url = urljoin(BASE_URL, img_el.get("src")) if img_el and img_el.get("src") else None

        description = None
        desc_el = card.select_one(".description, .listing-description, .summary")
        if desc_el:
            description = html_module.unescape(desc_el.get_text(" ", strip=True)).strip() or None

        return {
            "source_site": "trade_a_plane",
            "listing_source": "trade_a_plane",
            "source_id": source_id,
            "source_listing_id": source_id,
            "url": listing_url,
            "make": make,
            "model": model,
            "year": year,
            "price_asking": price_asking,
            "location_city": city,
            "location_state": state,
            "primary_image_url": primary_image_url,
            "description": description,
            "aircraft_type": "piston_single",
        }
    except Exception as exc:
        log.warning("Error parsing listing card: %s", exc)
        return None


def _extract_cards(soup: BeautifulSoup) -> list:
    selectors = [
        "div.result_listing",
        "div[class*='result_listing']",
        "div.result-listing",
        "div.result-listing-holder",
        "div[class*='result-listing']",
        "article.listing-card",
    ]
    for selector in selectors:
        cards = soup.select(selector)
        if cards:
            return cards
    return []


def scrape_make(
    fetcher: HtmlFetcher,
    make: str,
    limit: Optional[int] = None,
    start_page: int = 1,
    on_page_complete: Optional[Callable[[int, list[dict]], None]] = None,
    supabase: Optional["Client"] = None,
) -> list[dict]:
    listings: list[dict] = []
    seen_source_ids: set[str] = set()
    page_num = max(1, start_page)
    page_url = build_make_url(make, page=page_num)

    while True:
        log.info("[%s] Fetching page %s: %s", make, page_num, page_url)
        html = fetcher.fetch(page_url)
        if not html:
            log.warning("[%s] Skipping page %s due to fetch failure.", make, page_num)
            break

        soup = BeautifulSoup(html, "html.parser")
        cards = _extract_cards(soup)
        log.info("[%s] Page %s cards found: %s", make, page_num, len(cards))
        if not cards:
            log.warning("[%s] No cards found on page %s", make, page_num)
            break

        parsed_cards: list[dict] = []
        for card in cards:
            listing = parse_listing_card(card)
            if listing:
                parsed_cards.append(listing)

        existing_fingerprints: dict[str, str] = {}
        if supabase and parsed_cards:
            source_ids = [str(item.get("source_id")) for item in parsed_cards if item.get("source_id")]
            existing_fingerprints = _fetch_existing_fingerprints(supabase, source_ids)

        new_cards_on_page = 0
        page_new_listings: list[dict] = []
        for listing in parsed_cards:
            source_id = listing["source_id"]
            if source_id in seen_source_ids:
                continue
            seen_source_ids.add(source_id)
            listing["listing_fingerprint"] = _compute_listing_fingerprint(listing)
            previous_fingerprint = existing_fingerprints.get(str(source_id))
            should_fetch_detail = previous_fingerprint != listing["listing_fingerprint"]

            detail_url = listing.get("url")
            if detail_url and should_fetch_detail:
                log.info("[%s] Fetching detail: %s", make, detail_url)
                extra = fetch_listing_detail(fetcher, detail_url)
                if not extra:
                    time.sleep(random.uniform(1.0, 2.0))
                    extra = fetch_listing_detail(fetcher, detail_url)
                listing.update(extra)
            elif detail_url:
                log.info("[%s] Skipping unchanged detail fetch for source_id=%s", make, source_id)

            listings.append(listing)
            page_new_listings.append(listing)
            new_cards_on_page += 1
            log.info(
                "[%s] Parsed: make=%s model=%s year=%s price=%s ttaf=%s smoh=%s",
                make,
                listing.get("make"),
                listing.get("model"),
                listing.get("year"),
                listing.get("price_asking"),
                listing.get("total_time_airframe"),
                listing.get("engine_time_since_overhaul"),
            )

            if limit is not None and len(listings) >= limit:
                if on_page_complete and page_new_listings:
                    on_page_complete(page_num, page_new_listings)
                log.info("[%s] Limit reached (%s).", make, limit)
                return listings

        if on_page_complete and page_new_listings:
            on_page_complete(page_num, page_new_listings)

        log.info("[%s] Page %s new cards: %s", make, page_num, new_cards_on_page)
        if new_cards_on_page == 0:
            log.info("[%s] No new cards found on page %s; stopping pagination.", make, page_num)
            break

        next_page_url = _extract_next_page_url(soup, page_url, page_num)
        if not next_page_url:
            break
        if next_page_url == page_url:
            break

        page_num += 1
        page_url = next_page_url
        delay = random.uniform(2.0, 4.5)
        log.info("[%s] Waiting %.1fs before next page...", make, delay)
        time.sleep(delay)

    return listings


def upsert_listings(supabase: "Client", listings: list[dict]) -> int:
    """Upsert listings into aircraft_listings on (source_site, source_id)."""
    if not listings:
        return 0

    today_iso = date.today().isoformat()
    source_ids = [
        str(listing.get("source_id"))
        for listing in listings
        if listing.get("source_id") is not None
    ]
    unique_source_ids = list(dict.fromkeys(source_ids))
    existing_by_source_id: dict[str, dict] = {}

    for idx in range(0, len(unique_source_ids), 200):
        chunk = unique_source_ids[idx : idx + 200]
        if not chunk:
            continue
        existing = (
            supabase.table("aircraft_listings")
            .select("source_id,first_seen_date,price_asking,asking_price")
            .eq("source_site", "trade_a_plane")
            .in_("source_id", chunk)
            .execute()
        )
        for row in existing.data or []:
            sid = row.get("source_id")
            if sid is not None:
                existing_by_source_id[str(sid)] = row

    def _as_int(value) -> Optional[int]:
        try:
            if value is None:
                return None
            if isinstance(value, bool):
                return None
            return int(float(value))
        except (TypeError, ValueError):
            return None

    rows = []
    observation_rows = []
    for listing in listings:
        row = {k: v for k, v in listing.items() if v is not None}
        source_id = row.get("source_id")
        existing = existing_by_source_id.get(str(source_id)) if source_id is not None else None

        row["source_site"] = "trade_a_plane"
        row["listing_source"] = "trade_a_plane"
        row["last_seen_date"] = today_iso
        row["is_active"] = True
        row["inactive_date"] = None
        if existing is None:
            row["first_seen_date"] = today_iso
        else:
            previous_price = _as_int(existing.get("price_asking"))
            if previous_price is None:
                previous_price = _as_int(existing.get("asking_price"))
            current_price = _as_int(row.get("price_asking"))
            if current_price is None:
                current_price = _as_int(row.get("asking_price"))
            if previous_price is not None and current_price is not None and current_price < previous_price:
                row["price_reduced"] = True
                row["price_reduced_date"] = today_iso
                row["price_reduction_amount"] = previous_price - current_price

        if "primary_image_url" in row:
            row["primary_image_url"] = str(row["primary_image_url"])
        if "image_urls" in row:
            row["image_urls"] = row["image_urls"] if isinstance(row["image_urls"], list) else [str(row["image_urls"])]
        if "logbook_urls" in row:
            row["logbook_urls"] = row["logbook_urls"] if isinstance(row["logbook_urls"], list) else [str(row["logbook_urls"])]
        rows.append(row)
        observation_rows.append(
            {
                "source_site": "trade_a_plane",
                "source_id": str(source_id),
                "observed_on": today_iso,
                "observed_at": f"{today_iso}T00:00:00Z",
                "asking_price": row.get("price_asking") if row.get("price_asking") is not None else row.get("asking_price"),
                "url": row.get("url"),
                "title": row.get("title"),
                "listing_fingerprint": row.get("listing_fingerprint"),
                "is_active": True,
            }
        )

    try:
        supabase.table("aircraft_listings").upsert(rows, on_conflict="source_site,source_id").execute()
        if observation_rows:
            supabase.table("listing_observations").upsert(
                observation_rows, on_conflict="source_site,source_id,observed_on"
            ).execute()
        return len(rows)
    except Exception as exc:
        log.error("Batch upsert failed: %s", exc)
        saved = 0
        for row in rows:
            try:
                supabase.table("aircraft_listings").upsert(row, on_conflict="source_site,source_id").execute()
                saved += 1
            except Exception as row_exc:
                log.error("Failed upsert for source_id=%s: %s", row.get("source_id"), row_exc)
        if observation_rows:
            try:
                supabase.table("listing_observations").upsert(
                    observation_rows, on_conflict="source_site,source_id,observed_on"
                ).execute()
            except Exception as obs_exc:
                log.error("Observation upsert failed: %s", obs_exc)
        return saved


def mark_inactive_listings(supabase: "Client", source_site: str) -> int:
    """Mark listings inactive when they were not seen in today's run."""
    today_iso = date.today().isoformat()
    try:
        response = (
            supabase.table("aircraft_listings")
            .update({"is_active": False, "inactive_date": today_iso})
            .eq("source_site", source_site)
            .lt("last_seen_date", today_iso)
            .eq("is_active", True)
            .execute()
        )
        count = len(response.data or [])
        if count:
            log.info("[%s] Marked %s stale listings as inactive.", source_site, count)
        return count
    except Exception as exc:
        log.warning("[%s] Failed to mark stale listings inactive: %s", source_site, exc)
        return 0


def _print_listings(listings: list[dict]) -> None:
    for listing in listings:
        print(json.dumps(listing, indent=2, ensure_ascii=True))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Trade-A-Plane aircraft listing scraper (requests-first, Playwright fallback)"
    )
    parser.add_argument("--make", nargs="+", help="One or more makes to scrape")
    parser.add_argument("--dry-run", action="store_true", help="Print listings and do not save to DB")
    parser.add_argument("--limit", type=int, default=None, help="Max listings per make (default: no limit)")
    parser.add_argument("--output", metavar="FILE", help="Write all scraped listings to JSON file")
    parser.add_argument("--no-playwright-fallback", action="store_true", help="Disable Playwright fallback")
    parser.add_argument("--resume", action="store_true", help="Resume from checkpoint file")
    parser.add_argument(
        "--checkpoint-file",
        default=str(DEFAULT_CHECKPOINT_FILE),
        help=f"Checkpoint file path (default: {DEFAULT_CHECKPOINT_FILE})",
    )
    parser.add_argument("--verbose", action="store_true", help="Enable DEBUG logging")
    args = parser.parse_args()

    global log
    log = setup_logging(args.verbose)

    makes = args.make if args.make else DEFAULT_MAKES
    log.info("Makes to scrape: %s", makes)
    checkpoint_file = Path(args.checkpoint_file)
    checkpoint_data = load_checkpoint(checkpoint_file) if args.resume else None
    if checkpoint_data and checkpoint_data.get("make") not in makes:
        log.warning(
            "Checkpoint make '%s' not in requested make list; ignoring checkpoint.",
            checkpoint_data.get("make"),
        )
        checkpoint_data = None
    if checkpoint_data:
        log.info(
            "Resume mode active from make=%s page=%s",
            checkpoint_data.get("make"),
            checkpoint_data.get("next_page", 1),
        )
    else:
        clear_checkpoint(checkpoint_file)

    fetcher = HtmlFetcher(use_playwright_fallback=not args.no_playwright_fallback)
    supabase = None if args.dry_run else get_supabase()

    total_count = 0
    per_make_counts: dict[str, int] = {}
    collected: list[dict] = []

    resume_idx = 0
    resume_page = 1
    if checkpoint_data:
        resume_idx = makes.index(checkpoint_data["make"])
        resume_page = max(1, int(checkpoint_data.get("next_page", 1)))

    for idx, make in enumerate(makes):
        if idx < resume_idx:
            log.info("[%s] Skipping make due to resume checkpoint.", make)
            continue
        start_page = resume_page if idx == resume_idx else 1

        def on_page_complete(page_num: int, page_listings: list[dict]) -> None:
            if args.dry_run:
                _print_listings(page_listings)
            else:
                saved = upsert_listings(supabase, page_listings)
                log.info("[%s] Upserted %s/%s listings from page %s.", make, saved, len(page_listings), page_num)
            save_checkpoint(
                checkpoint_file,
                {
                    "source_site": "trade_a_plane",
                    "make": make,
                    "make_index": idx,
                    "next_page": page_num + 1,
                },
            )

        make_listings = scrape_make(
            fetcher=fetcher,
            make=make,
            limit=args.limit,
            start_page=start_page,
            on_page_complete=on_page_complete,
            supabase=supabase,
        )
        count = len(make_listings)
        total_count += count
        per_make_counts[make] = count
        collected.extend(make_listings)

        if idx < len(makes) - 1:
            save_checkpoint(
                checkpoint_file,
                {
                    "source_site": "trade_a_plane",
                    "make": makes[idx + 1],
                    "make_index": idx + 1,
                    "next_page": 1,
                },
            )

        if idx < len(makes) - 1:
            between_delay = random.uniform(4.0, 8.0)
            log.info("Waiting %.1fs before next make...", between_delay)
            time.sleep(between_delay)

    if args.output:
        output_path = Path(args.output)
        output_path.write_text(json.dumps(collected, indent=2, ensure_ascii=True), encoding="utf-8")
        log.info("Wrote %s listings to %s", len(collected), output_path)

    for make, count in per_make_counts.items():
        log.info("Final count [%s]: %s", make, count)
    log.info("Final total listings: %s", total_count)
    if supabase and not args.make:
        mark_inactive_listings(supabase, "trade_a_plane")
    clear_checkpoint(checkpoint_file)


if __name__ == "__main__":
    main()
