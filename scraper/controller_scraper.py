"""
Controller.com Aircraft Listing Scraper (Playwright)

Usage:
    python controller_scraper.py
    python controller_scraper.py --make Cessna Piper
    python controller_scraper.py --dry-run --limit 10 --verbose
"""

from __future__ import annotations

import asyncio
import argparse
import html as html_module
import json
import logging
import os
import random
import re
import hashlib
from datetime import date
from pathlib import Path
from typing import Any, Callable, Optional, TYPE_CHECKING
from urllib.parse import urlencode, urljoin, urlparse

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
    """Configure structured logging with file + console."""
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

BASE_URL = "https://www.controller.com"
SEARCH_PATH = "/listings/search"
CAPTCHA_RESUME_FILE = Path("scraper/.captcha_resume")
DEFAULT_CHECKPOINT_FILE = Path("scraper/state/controller_checkpoint.json")
MAKES = [
    # Piston Singles
    "Cessna", "Piper", "Beechcraft", "Mooney", "Cirrus", "Diamond",
    "Grumman", "Maule", "American Champion", "Bellanca", "Luscombe",
    "Taylorcraft", "Aeronca", "Stinson", "Globe", "Ercoupe",
    "Socata", "Robin", "Zenith", "Vans",
    # Piston Twins
    "Piper Twin", "Cessna Twin", "Beechcraft Twin", "Aerostar",
    "Rockwell", "Seneca", "Aztec",
    # Turboprops
    "Pilatus", "TBM", "Daher", "Piper Meridian", "Beechcraft King Air",
    "Cessna Caravan", "Quest Kodiak", "PC-12",
    # Light Sport
    "Flight Design", "Tecnam", "Jabiru", "Pipistrel",
    # Helicopters
    "Robinson", "Bell", "Sikorsky", "Eurocopter", "Airbus Helicopter",
    "MD Helicopters", "Schweizer",
    # Jets
    "Cessna Citation", "Beechcraft Premier", "Eclipse", "Cirrus Vision",
    "Embraer Phenom", "Honda Jet"
]

CONTROLLER_SEARCH_MAKES = [
    "Cessna", "Piper", "Beechcraft", "Mooney", "Cirrus", "Diamond",
    "Grumman", "Maule", "Bellanca", "Socata", "Pilatus", "TBM",
    "Quest", "Robinson", "Bell", "Eclipse", "Embraer", "Honda",
    "Tecnam", "Pipistrel", "Aerostar", "Rockwell", "American Champion",
    "Luscombe", "Taylorcraft", "Aeronca", "Stinson", "Zenith", "Vans",
    "Flight Design", "Jabiru", "Schweizer", "MD Helicopters"
]


async def _create_browser_context(playwright):
    """Create a visible browser context with anti-detection flags."""
    browser = await playwright.chromium.launch(
        headless=False,
        args=[
            "--no-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
        ],
    )
    context = await browser.new_context(
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
        viewport={"width": 1280, "height": 800},
        locale="en-US",
    )
    await context.add_init_script(
        """
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        """
    )
    return browser, context


def build_make_url(make: str, page: int = 1) -> str:
    """Build Controller.com search URL for a make and optional page.
    Page 1: /listings/search?keywords=Cessna
    Page 2+: /listings/search?page=2&keywords=Cessna
    """
    keywords = make.strip()
    if page <= 1:
        return f"{BASE_URL}{SEARCH_PATH}?keywords={keywords}"
    return f"{BASE_URL}{SEARCH_PATH}?page={page}&keywords={keywords}"


def _parse_price(price_text: str) -> Optional[int]:
    numeric = re.sub(r"[^\d]", "", price_text or "")
    if not numeric:
        return None
    try:
        return int(numeric)
    except ValueError:
        return None


def _extract_source_id(listing_url: str) -> str:
    """
    Extract numeric listing ID from Controller.com URLs.
    Search results: /listing/1964-Cessna-172-5038176592  -> 5038176592
    Detail pages:   /listing/for-sale/253360009/slug     -> 253360009
    """
    parsed = urlparse(listing_url)
    segments = parsed.path.rstrip("/").split("/")
    # Try each segment for a standalone numeric ID (6-10 digits)
    for seg in reversed(segments):
        match = re.fullmatch(r"(\d{6,10})", seg)
        if match:
            return match.group(1)
    # Fallback: trailing digits anywhere
    match = re.search(r"(\d+)$", parsed.path)
    return match.group(1) if match else segments[-1]


def _extract_year_make(sub_title_text: str) -> tuple[Optional[int], Optional[str]]:
    """
    Parse year and make from strings like:
      "Used 1964 Cessna"
      "New 2023 Piper"
    """
    if not sub_title_text:
        return None, None

    year_match = re.search(r"\b(\d{4})\b", sub_title_text)
    year_value: Optional[int] = int(year_match.group(1)) if year_match else None
    make_value: Optional[str] = None

    if year_match:
        post_year = sub_title_text[year_match.end() :].strip()
        if post_year:
            make_value = post_year.split()[0].strip().title()

    return year_value, make_value


def _extract_n_number(stock_text: str) -> Optional[str]:
    if not stock_text:
        return None
    match = re.search(r"\b(N\d{1,5}[A-Z]{0,2})\b", stock_text, re.IGNORECASE)
    return match.group(1).upper() if match else None


# Full state name to 2-letter abbreviation map
_STATE_ABBREV = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
    "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
    "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
    "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
    "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
    "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
    "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK",
    "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
    "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
    "vermont": "VT", "virginia": "VA", "washington": "WA", "west virginia": "WV",
    "wisconsin": "WI", "wyoming": "WY", "district of columbia": "DC",
}


def _normalize_state(raw: str) -> Optional[str]:
    """Convert full state name or abbreviation to 2-letter uppercase code."""
    if not raw:
        return None
    clean = raw.strip()
    if len(clean) == 2:
        return clean.upper()
    return _STATE_ABBREV.get(clean.lower()) or clean[:2].upper()


def _split_city_state(location_text: str) -> tuple[Optional[str], Optional[str]]:
    clean = (location_text or "").strip()
    if not clean:
        return None, None
    parts = [p.strip() for p in clean.split(",")]
    if len(parts) >= 2:
        city = parts[0] or None
        state = _normalize_state(parts[1]) if parts[1] else None
        return city, state
    return clean, None


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
        str(listing.get("n_number") or ""),
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
            .eq("source_site", "controller")
            .in_("source_id", chunk)
            .execute()
        )
        for row in rows.data or []:
            sid = row.get("source_id")
            fp = row.get("listing_fingerprint")
            if sid is not None and fp:
                existing[str(sid)] = str(fp)
    return existing




async def fetch_listing_detail(page, listing_url: str) -> dict:
    """
    Navigate to a listing detail page and extract additional fields.
    Detail URL format: /listing/Controller/178/ListPage/8/13/6/{id}/{slug}
    This also makes navigation appear more human.
    """
    extra = {}
    try:
        await page.goto(listing_url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(random.uniform(3000, 6000))
        html = await page.content()
        soup = BeautifulSoup(html, "html.parser")

        # --- Price (confirmed: strong.listing-prices_retail-price) ---
        price_el = soup.select_one("strong.listing-prices_retail-price")
        if price_el:
            price_text = price_el.get_text(strip=True)
            if "call" not in price_text.lower():
                p = _parse_price(price_text)
                if p:
                    extra["price_asking"] = p

        # --- Location (confirmed: div.detail__machine-location, double underscore) ---
        loc_el = soup.select_one("div.detail__machine-location")
        if loc_el:
            loc_text = re.sub(r"Aircraft\s*Location\s*:", "", loc_el.get_text(strip=True), flags=re.I).strip()
            city, state = _split_city_state(loc_text)
            if city:
                extra["location_city"] = city
            if state:
                extra["location_state"] = state

        # --- Photos/Gallery: collect all available image URLs ---
        gallery_urls: list[str] = []
        seen_gallery_urls: set[str] = set()
        for img in soup.select("section.photos img, .photos img, .gallery img, img[src], img[data-src]"):
            src = (img.get("data-src") or img.get("src") or "").strip()
            if not src:
                continue
            absolute_src = urljoin(BASE_URL, src)
            if absolute_src in seen_gallery_urls:
                continue
            seen_gallery_urls.add(absolute_src)
            gallery_urls.append(absolute_src)
        if gallery_urls:
            extra["image_urls"] = gallery_urls
            extra["primary_image_url"] = gallery_urls[0]

        logbook_urls = _extract_logbook_urls(soup)
        if logbook_urls:
            extra["logbook_urls"] = logbook_urls

        # --- Specs: confirmed structure uses double underscore classes ---
        # div.detail__specs-label + div.detail__specs-value (siblings in a wrapper)
        # Covers: General, Airframe, Engine, Props, Avionics, Interior, Inspection
        specs = {}
        labels = soup.select("div.detail__specs-label")
        for label_el in labels:
            label = label_el.get_text(strip=True).lower().rstrip(":")
            # Value is the next sibling div with detail__specs-value
            value_el = label_el.find_next_sibling("div")
            if value_el:
                value = value_el.get_text(strip=True)
                if label and value:
                    specs[label] = value

        log.debug(f"Detail specs parsed: {list(specs.keys())}")

        # General
        if "manufacturer" in specs:
            extra["make"] = specs["manufacturer"].strip().title()
        if "model" in specs:
            extra["model"] = specs["model"].strip()
        if "year" in specs:
            try:
                extra["year"] = int(specs["year"].strip())
            except ValueError:
                pass
        if "serial number" in specs:
            val = specs["serial number"].strip()
            if val.lower() not in ("n/a", "serial number", ""):
                extra["serial_number"] = val
        if "registration #" in specs:
            match = re.search(r"([A-Z]\d{1,5}[A-Z]{0,2})", specs["registration #"], re.I)
            if match:
                extra["n_number"] = match.group(1).upper()
        if "description" in specs:
            extra["description"] = html_module.unescape(specs["description"]).strip()

        # Airframe
        if "total time" in specs:
            val = re.search(r"[\d,]+", specs["total time"])
            if val:
                extra["total_time_airframe"] = int(val.group().replace(",", ""))
        if "useful load" in specs:
            val = re.search(r"[\d,]+", specs["useful load"])
            if val:
                extra["useful_load_lbs"] = int(val.group().replace(",", ""))
        if "number of seats" in specs:
            val = re.search(r"\d+", specs["number of seats"])
            if val:
                extra["num_seats"] = int(val.group())

        # Engine
        for key in ("engine 1 make/model", "engine make/model", "engine model", "powerplant"):
            if key in specs:
                extra["engine_model"] = specs[key].strip()
                break
        for key in ("engine 1 time", "engine time", "smoh", "time since overhaul"):
            if key in specs:
                val = re.search(r"[\d,]+", specs[key])
                if val:
                    extra["engine_time_since_overhaul"] = int(val.group().replace(",", ""))
                    break
        if "engine tbo" in specs:
            val = re.search(r"[\d,]+", specs["engine tbo"])
            if val:
                extra["engine_tbo_hours"] = int(val.group().replace(",", ""))

        # Avionics
        for key in ("flight deck manufacturer/model", "avionics/radios", "avionics"):
            if key in specs:
                extra["avionics_description"] = html_module.unescape(specs[key]).strip()
                break

        # Inspection
        if "airworthy" in specs:
            extra["is_airworthy"] = specs["airworthy"].strip().lower() == "yes"

    except Exception as exc:
        log.warning(f"Detail page fetch failed for {listing_url}: {exc}")

    return extra

def parse_listing_card(card) -> Optional[dict]:
    """Parse a Controller listing card to aircraft_listings-compatible shape.
    
    Handles both layouts:
    - Search results: div.list-listing-card-wrapper (confirmed via browser inspector)
    - Manufacturer page: article.search-card
    """
    try:
        # --- Get listing URL and source ID ---
        # Search layout: data-listing-id on inner div, link via View Details button
        data_el = card.select_one("div[data-listing-id]")
        source_id = None
        listing_url = None

        if data_el:
            source_id = data_el.get("data-listing-id", "").strip()

        # Find the detail page link
        link_tag = card.select_one("a[href*='/listing/']") or card.select_one("a[href]")
        if not link_tag:
            return None
        href = (link_tag.get("href") or "").strip()
        if not href:
            return None

        listing_url = urljoin(BASE_URL, href)
        # Skip any card linking off-site (ads, calculators, etc.)
        if not listing_url.startswith("https://www.controller.com"):
            return None

        if not source_id:
            source_id = _extract_source_id(listing_url)

        # --- Title: "2014 CESSNA TTX" in div.list-listing-title ---
        title_el = card.select_one("div.list-listing-title")
        # Fallback for manufacturer page layout
        if not title_el:
            title_el = card.select_one("h3.sub-title")
        title_text = title_el.get_text(" ", strip=True) if title_el else ""

        # Extract year (4 digits) and make+model from title
        year_value = None
        make_value = None
        model_text = None
        year_match = re.search(r"(19|20)\d{2}", title_text)
        if year_match:
            year_value = int(year_match.group())
            # Everything after the year is "MAKE MODEL"
            after_year = title_text[year_match.end():].strip()
            parts = after_year.split(None, 1)
            if parts:
                make_value = parts[0].title()
            if len(parts) > 1:
                model_text = parts[1].strip()

        # --- Price: span.price contains "USD $650,000" or "CALL FOR PRICE" ---
        price_el = card.select_one("span.price") or card.select_one(".price.main")
        price_text = price_el.get_text(" ", strip=True) if price_el else ""
        price_value = None if "call" in price_text.lower() else _parse_price(price_text)

        # --- N-Number from registration span or stock number ---
        stock_el = card.select_one("div.stock-number, span.registration")
        stock_text = stock_el.get_text(" ", strip=True) if stock_el else ""
        n_number = _extract_n_number(stock_text)

        # --- Location: "Location: Arlington, Texas" in specs-container ---
        location_text = ""
        for el in card.select("div.specs-container span, div.listing-location, div.location"):
            text = el.get_text(strip=True)
            if "location" in text.lower() or "," in text:
                location_text = re.sub(r"^location\s*:\s*", "", text, flags=re.I).strip()
                break
        # Fallback: find any text with "Location:" prefix
        if not location_text:
            for el in card.find_all(string=re.compile(r"Location:", re.I)):
                parent = el.find_parent()
                if parent:
                    location_text = re.sub(r"Location:\s*", "", parent.get_text(strip=True), flags=re.I)
                    break

        city, state = _split_city_state(location_text)

        # --- Card primary image ---
        primary_image_url = None
        primary_img = card.select_one("div.listing-image img")
        if primary_img:
            src = (primary_img.get("src") or "").strip()
            if src:
                primary_image_url = urljoin(BASE_URL, src)

        # --- Seller ---
        seller_el = card.select_one(".contact-container, .dealer-wrapper span, .seller")
        seller_text = seller_el.get_text(" ", strip=True) if seller_el else ""

        # --- Description ---
        desc_el = card.select_one(".listing-content, .description-wrapper")
        desc_text = desc_el.get_text(" ", strip=True) if desc_el else ""
        description = html_module.unescape(desc_text).encode("utf-8").decode("utf-8").strip() or None

        listing = {
            "source_site": "controller",
            "source_id": source_id,
            "source_listing_id": source_id,
            "url": listing_url,
            "make": make_value,
            "model": model_text or None,
            "year": year_value,
            "price_asking": price_value,
            "n_number": n_number,
            "location_city": city,
            "location_state": state,
            "primary_image_url": primary_image_url,
            "description": description or None,
            "aircraft_type": "piston_single",
        }
        return listing
    except Exception as exc:
        log.warning(f"Error parsing listing card: {exc}")
        return None


async def fetch_page_soup(page, url: str) -> Optional[BeautifulSoup]:
    """Navigate via Playwright browser session and return parsed HTML."""
    try:
        response = await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(5000)
        html = await page.content()

        status_code = response.status if response else None
        if status_code != 200:
            log.warning("Non-200 status %s for %s", status_code, url)
            return None
        # No content-based block check — Controller.com embeds "captcha" in normal JS bundles
        # Instead we validate by checking for actual listing cards after parsing
        return BeautifulSoup(html, "html.parser")
    except Exception as exc:
        log.warning(f"Failed to fetch {url}: {exc}")
        return None


async def wait_for_manual_captcha_resume(make: str) -> None:
    """
    True pause mode: halt all requests until operator explicitly resumes.
    Resume by creating scraper/.captcha_resume.
    """
    log.warning(
        "[%s] CAPTCHA/challenge detected. Scraper is paused. "
        "After solving CAPTCHA, create %s to resume.",
        make,
        CAPTCHA_RESUME_FILE,
    )
    while not CAPTCHA_RESUME_FILE.exists():
        await asyncio.sleep(2)
    try:
        CAPTCHA_RESUME_FILE.unlink()
    except OSError:
        pass
    log.info("[%s] CAPTCHA resume signal received. Continuing scrape.", make)


async def wait_for_search_ready(page, make: str) -> None:
    """
    Wait until the initial search page returns listing cards.

    If Controller serves a challenge/CAPTCHA page, scraper enters true pause mode
    and waits for an explicit resume signal.
    """
    initial_url = build_make_url(make, page=1)

    while True:
        soup = await fetch_page_soup(page, initial_url)
        cards = []
        if soup:
            cards = soup.select("div.list-listing-card-wrapper")
            if not cards:
                cards = soup.select("article.search-card")

        if cards:
            log.info("[%s] Initial page ready (%d cards). Continuing scrape.", make, len(cards))
            return

        await wait_for_manual_captcha_resume(make)


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


async def scrape_make(
    page,
    make: str,
    limit: Optional[int] = None,
    start_page: int = 1,
    on_page_complete: Optional[Callable[[int, list[dict]], None]] = None,
    supabase: Optional["Client"] = None,
) -> list[dict]:
    """Scrape one make by incrementing page=1..N until no new cards appear."""
    listings: list[dict] = []
    seen_source_ids: set[str] = set()
    page_num = max(1, start_page)

    while True:
        page_url = build_make_url(make, page=page_num)
        log.info(f"[{make}] Fetching page {page_num}: {page_url}")

        soup = await fetch_page_soup(page, page_url)
        if not soup:
            log.warning(
                "[%s] Fetch/block failure on page %s; entering CAPTCHA pause mode.",
                make,
                page_num,
            )
            await wait_for_manual_captcha_resume(make)
            continue

        # Controller.com search results use div.list-listing-card-wrapper
        cards = soup.select("div.list-listing-card-wrapper")
        if not cards:
            # Fallback to article.search-card (manufacturer page layout)
            cards = soup.select("article.search-card")
        log.info(f"[{make}] Page {page_num} cards found: {len(cards)}")
        if not cards:
            log.warning(f"[{make}] No cards found on page {page_num}")
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

            # Fetch detail page for richer data + human-like navigation
            detail_url = listing.get("url")
            if detail_url and should_fetch_detail:
                log.info(f"[{make}] Fetching detail: {detail_url}")
                extra = await fetch_listing_detail(page, detail_url)
                if not extra:
                    await asyncio.sleep(random.uniform(1.0, 2.0))
                    extra = await fetch_listing_detail(page, detail_url)
                listing.update(extra)
                # Go back to search results
                await page.go_back(wait_until="domcontentloaded", timeout=15000)
                await page.wait_for_timeout(random.uniform(2000, 4000))
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
                log.info(f"[{make}] Limit reached ({limit}).")
                return listings

        if on_page_complete and page_new_listings:
            on_page_complete(page_num, page_new_listings)

        log.info(f"[{make}] Page {page_num} new cards: {new_cards_on_page}")
        if new_cards_on_page == 0:
            log.info(f"[{make}] No new cards found on page {page_num}; stopping pagination.")
            break

        page_num += 1
        delay = random.uniform(8.0, 12.0)
        log.info(f"[{make}] Waiting {delay:.1f}s before next page...")
        await asyncio.sleep(delay)

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
            .eq("source_site", "controller")
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

        # Keep explicit types for new image columns.
        if "primary_image_url" in row:
            row["primary_image_url"] = str(row["primary_image_url"])
        if "image_urls" in row:
            row["image_urls"] = row["image_urls"] if isinstance(row["image_urls"], list) else [str(row["image_urls"])]
        if "logbook_urls" in row:
            row["logbook_urls"] = row["logbook_urls"] if isinstance(row["logbook_urls"], list) else [str(row["logbook_urls"])]
        rows.append(row)

        observation_rows.append(
            {
                "source_site": "controller",
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
        log.error(f"Batch upsert failed: {exc}")
        saved = 0
        for row in rows:
            try:
                supabase.table("aircraft_listings").upsert(row, on_conflict="source_site,source_id").execute()
                saved += 1
            except Exception as row_exc:
                log.error(f"Failed upsert for source_id={row.get('source_id')}: {row_exc}")
        if observation_rows:
            try:
                supabase.table("listing_observations").upsert(
                    observation_rows, on_conflict="source_site,source_id,observed_on"
                ).execute()
            except Exception as obs_exc:
                log.error(f"Observation upsert failed: {obs_exc}")
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


async def main() -> None:
    parser = argparse.ArgumentParser(description="Controller.com aircraft listing scraper (Playwright)")
    parser.add_argument("--make", nargs="+", help="One or more makes to scrape")
    parser.add_argument("--dry-run", action="store_true", help="Print listings and do not save to DB")
    parser.add_argument("--limit", type=int, default=None, help="Max listings per make (default: no limit)")
    parser.add_argument("--output", metavar="FILE", help="Write all scraped listings to JSON file")
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

    if CAPTCHA_RESUME_FILE.exists():
        CAPTCHA_RESUME_FILE.unlink(missing_ok=True)

    makes = args.make if args.make else CONTROLLER_SEARCH_MAKES
    log.info(f"Makes to scrape: {makes}")
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

    supabase = None if args.dry_run else get_supabase()

    from playwright.async_api import async_playwright

    total_count = 0
    per_make_counts: dict[str, int] = {}
    collected: list[dict] = []

    async with async_playwright() as playwright:
        browser, context = await _create_browser_context(playwright)
        page = await context.new_page()

        try:
            initial_url = build_make_url(makes[0], page=1)
            log.info(f"Opening initial page for challenge detection: {initial_url}")
            await wait_for_search_ready(page=page, make=makes[0])

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
                        log.info(
                            "[%s] Upserted %s/%s listings from page %s.",
                            make,
                            saved,
                            len(page_listings),
                            page_num,
                        )
                    save_checkpoint(
                        checkpoint_file,
                        {
                            "source_site": "controller",
                            "make": make,
                            "make_index": idx,
                            "next_page": page_num + 1,
                        },
                    )

                make_listings = await scrape_make(
                    page=page,
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

                # Make complete; checkpoint will continue from next make.
                if idx < len(makes) - 1:
                    save_checkpoint(
                        checkpoint_file,
                        {
                            "source_site": "controller",
                            "make": makes[idx + 1],
                            "make_index": idx + 1,
                            "next_page": 1,
                        },
                    )

                if idx < len(makes) - 1:
                    between_delay = random.uniform(15.0, 20.0)
                    log.info(f"Waiting {between_delay:.1f}s before next make...")
                    await asyncio.sleep(between_delay)
        finally:
            await browser.close()

    if args.output:
        output_path = Path(args.output)
        output_path.write_text(json.dumps(collected, indent=2, ensure_ascii=True), encoding="utf-8")
        log.info(f"Wrote {len(collected)} listings to {output_path}")

    for make, count in per_make_counts.items():
        log.info(f"Final count [{make}]: {count}")
    log.info(f"Final total listings: {total_count}")
    if supabase and not args.make:
        mark_inactive_listings(supabase, "controller")
    clear_checkpoint(checkpoint_file)


if __name__ == "__main__":
    asyncio.run(main())