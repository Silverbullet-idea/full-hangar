"""
AeroTrader.com Aircraft Listing Scraper

Usage:
    python scraper.py                     # Scrape all makes, all pages
    python scraper.py --make Cessna       # Single make only
    python scraper.py --make Cessna Piper # Multiple makes
    python scraper.py --dry-run           # Fetch 1 page, print results, don't save
    python scraper.py --resume            # Skip makes already in DB

Architecture:
    1. Playwright browser (bypasses bot detection vs requests)
    2. Iterate through aircraft makes → paginate listings
    3. Parse each listing card → structured data
    4. Optional: fetch detail page for full specs
    5. Upsert into Supabase aircraft_listings table

Reliability:
    - Playwright with real Chrome (headless)
    - Exponential backoff retry with jitter
    - Token-bucket rate limiting
    - Structured logging with context
"""

from __future__ import annotations

import os
import re
import time
import json
import random
import logging
import argparse
import threading
from datetime import datetime, timezone
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from supabase import Client
from urllib.parse import urljoin, urlencode

import html as html_module
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()


def get_supabase():
    """Lazy import so --dry-run does not require supabase (or .env)."""
    from supabase import create_client, Client
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise EnvironmentError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env")
    return create_client(url, key)


# ─── Logging ────────────────────────────────────────────────────────────────
def setup_logging(verbose: bool = False) -> logging.Logger:
    """Configure structured logging with file + console."""
    level = logging.DEBUG if verbose else logging.INFO
    log_format = "%(asctime)s [%(levelname)s] %(message)s"

    root = logging.getLogger()
    root.setLevel(level)
    for h in root.handlers[:]:
        root.removeHandler(h)

    stream = logging.StreamHandler()
    stream.setLevel(level)
    stream.setFormatter(logging.Formatter(log_format))

    file_handler = logging.FileHandler("scraper.log", encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter(log_format))

    root.addHandler(stream)
    root.addHandler(file_handler)

    log = logging.getLogger(__name__)
    log.setLevel(level)
    return log


# Default logger (will be replaced by setup_logging in main)
log = logging.getLogger(__name__)


# ─── Constants ──────────────────────────────────────────────────────────────
BASE_URL = "https://www.aerotrader.com"
LISTINGS_PER_PAGE = 25

# Retry config
DEFAULT_MAX_RETRIES = 5
DEFAULT_BASE_DELAY = 8.0
DEFAULT_MAX_DELAY = 120.0

# Rate limit config (requests per minute)
RATE_LIMIT_RPM = 12
MIN_DELAY_BETWEEN_REQUESTS = 5.0

ALL_MAKES = [
    "Cessna", "Piper", "Beechcraft", "Cirrus", "Mooney", "Bonanza",
    "Diamond", "Commander", "Grumman", "Maule", "Bellanca", "Luscombe",
    "Taylorcraft", "Aeronca", "Stinson", "Globe", "Ercoupe", "Helio",
    "Lake", "Navion", "Socata", "Robin", "Zenith", "Vans",
    "Piper-Twin", "Cessna-Twin",
    "King-Air", "TBM", "PC-12", "Daher", "Socata-Turboprop",
    "Citation", "Learjet", "Falcon", "Gulfstream", "Hawker", "Embraer",
    "Bell", "Robinson", "Schweizer", "Hughes", "Sikorsky", "Eurocopter", "Agusta",
]


# ─── Rate Limiter ────────────────────────────────────────────────────────────
class RateLimiter:
    """Token-bucket style rate limiter. Thread-safe."""
    def __init__(self, requests_per_minute: float = RATE_LIMIT_RPM, min_delay: float = MIN_DELAY_BETWEEN_REQUESTS):
        self.interval = 60.0 / requests_per_minute
        self.min_delay = min_delay
        self._last_request = 0.0
        self._lock = threading.Lock()

    def wait(self):
        """Block until next request is allowed."""
        with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_request
            wait_time = max(0, self.interval - elapsed, self.min_delay - elapsed)
            if wait_time > 0:
                log.debug(f"Rate limit: waiting {wait_time:.1f}s")
                time.sleep(wait_time)
            self._last_request = time.monotonic()


# ─── Retry Logic ──────────────────────────────────────────────────────────────
def _compute_backoff(attempt: int, base_delay: float, max_delay: float) -> float:
    """Exponential backoff with jitter."""
    delay = base_delay * (2 ** attempt)
    jitter = random.uniform(0, delay * 0.3)
    return min(delay + jitter, max_delay)


# ─── Playwright Fetcher ──────────────────────────────────────────────────────
def _create_browser_context(playwright, headless: bool = True):
    """Create browser with anti-detection settings."""
    browser = playwright.chromium.launch(
        headless=headless,
        args=[
            "--no-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
        ],
    )
    context = browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        viewport={"width": 1280, "height": 800},
        locale="en-US",
        timezone_id="America/New_York",
    )
    context.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    """)
    return browser, context


def fetch_with_retry(
    page,
    url: str,
    rate_limiter: RateLimiter,
    max_retries: int = DEFAULT_MAX_RETRIES,
    base_delay: float = DEFAULT_BASE_DELAY,
    max_delay: float = DEFAULT_MAX_DELAY,
    make: str = "",
) -> Optional[BeautifulSoup]:
    """
    Fetch URL with Playwright + rate limiting + exponential backoff retry.
    Returns parsed BeautifulSoup or None.
    """
    for attempt in range(max_retries):
        rate_limiter.wait()
        try:
            log.debug(f"Fetch attempt {attempt + 1}/{max_retries}: {url}")
            resp = page.goto(url, wait_until="domcontentloaded", timeout=30000)

            if resp:
                status = resp.status
                if status == 200:
                    html = page.content()
                    return BeautifulSoup(html, "html.parser")
                if status == 429:
                    wait = _compute_backoff(attempt, base_delay, max_delay)
                    log.warning(f"Rate limited (429). Waiting {wait:.1f}s before retry [make={make}]")
                    time.sleep(wait)
                    continue
                if status in (403, 503):
                    wait = _compute_backoff(attempt, base_delay, max_delay)
                    log.warning(f"Blocked ({status}). Waiting {wait:.1f}s [make={make}]")
                    time.sleep(wait)
                    continue
                log.error(f"HTTP {status} for {url}")
                return None
            else:
                log.warning(f"No response object for {url}")
                return None

        except Exception as e:
            wait = _compute_backoff(attempt, base_delay, max_delay)
            log.warning(f"Request failed: {e}. Retry in {wait:.1f}s [attempt {attempt + 1}/{max_retries}]")
            time.sleep(wait)

    log.error(f"All retries exhausted for {url}")
    return None


# ─── URL Builders ─────────────────────────────────────────────────────────────
def build_search_url(make: Optional[str] = None, page: int = 1, condition: str = "U") -> str:
    """
    Build AeroTrader search URL.
    By make: /Cessna-Aircraft/aircraft-for-sale?make=Cessna&page=2
    """
    params = {}
    if condition:
        params["condition"] = condition
    if page > 1:
        params["page"] = page

    if make:
        slug = make.replace(" ", "-").replace("/", "-")
        path = f"/{slug}-Aircraft/aircraft-for-sale"
        params["make"] = make
    else:
        path = "/aircraft-for-sale"

    query = urlencode(params)
    return f"{BASE_URL}{path}{'?' + query if query else ''}"


# ─── Listing Card Parser ───────────────────────────────────────────────────────
def parse_listing_card(card) -> Optional[dict]:
    """
    Parse a single listing card from the search results page.
    AeroTrader: <article class="search-card ...">
    """
    try:
        listing = {}
        listing["source"] = "aerotrader"

        link_tag = card.select_one("a[href*='/listing/']")
        if not link_tag:
            return None
        href = link_tag.get("href", "")
        listing["source_url"] = urljoin(BASE_URL, href)
        id_match = re.search(r"-(\d{7,})$", href)
        listing["source_id"] = id_match.group(1) if id_match else href.split("/")[-1]

        sub_title_el = card.select_one("h3.sub-title, .sub-title")
        model_el = card.select_one("div.title")
        sub_title_text = sub_title_el.get_text(strip=True) if sub_title_el else ""
        model_text = model_el.get_text(strip=True) if model_el else ""

        year_match = re.search(r"(\d{4})", sub_title_text)
        if year_match:
            listing["year"] = int(year_match.group(1))

        if re.search(r"\bUsed\b", sub_title_text, re.IGNORECASE):
            listing["condition"] = "used"
        elif re.search(r"\bNew\b", sub_title_text, re.IGNORECASE):
            listing["condition"] = "new"
        else:
            listing["condition"] = "used"

        sub_parts = sub_title_text.split()
        if sub_parts:
            listing["make"] = sub_parts[-1].title()

        if model_text:
            listing["model"] = model_text.title()

        listing["title"] = f"{listing.get('year', '')} {listing.get('make', '')} {listing.get('model', '')}".strip()

        stock_el = card.select_one(".stock-number, [class*='stock']")
        if stock_el:
            stock_text = stock_el.get_text(strip=True)
            n_match = re.search(r"\b(N\d{1,5}[A-Z]{0,2})\b", stock_text, re.IGNORECASE)
            if n_match:
                listing["n_number"] = n_match.group(1).upper()

        price_el = card.select_one(".price.main, div.price, [class*='price']")
        if price_el:
            price_text = price_el.get_text(strip=True)
            price_match = re.search(r"\$[\d,]+", price_text)
            if price_match:
                price_str = price_match.group(0).replace("$", "").replace(",", "")
                try:
                    listing["asking_price"] = int(price_str)
                except ValueError:
                    pass

        desc_el = card.select_one(".description-wrapper, [class*='description']")
        desc_text = ""
        if desc_el:
            raw = desc_el.get_text(" ", strip=True)
            desc_text = html_module.unescape(raw)
            desc_text = re.sub(r"<[^>]+>", " ", desc_text).strip()
            if len(desc_text) > 20:
                listing["description"] = desc_text[:2000]

        combined_text = (listing["title"] + " " + desc_text).upper()
        listing.update(parse_hours_from_text(combined_text))
        listing["aircraft_type"] = infer_aircraft_type(combined_text)

        loc_el = card.select_one(".location-wrapper, [class*='location']")
        if loc_el:
            loc_text = loc_el.get_text(strip=True)
            if loc_text:
                listing["location_raw"] = loc_text
                state_match = re.search(r",\s*([A-Z]{2})\s*$", loc_text)
                if state_match:
                    listing["state"] = state_match.group(1)

        dealer_el = card.select_one(".dealer-wrapper, [class*='dealer']")
        if dealer_el:
            seller_text = dealer_el.get_text(strip=True)
            listing["seller_name"] = seller_text[:200]
            dealer_keywords = ["LLC", "INC", "CORP", "AVIATION", "SALES", "AIRCRAFT", "PLATINUM", "JETS"]
            if seller_text.upper() == "PRIVATE SELLER" or not any(k in seller_text.upper() for k in dealer_keywords):
                listing["seller_type"] = "private"
            else:
                listing["seller_type"] = "dealer"

        img_tag = card.select_one(".image-wrapper img, img[src]")
        if img_tag:
            src = img_tag.get("src") or img_tag.get("data-src", "")
            if src and "cdn" in src:
                listing["primary_image_url"] = src

        listing["scraped_at"] = datetime.now(timezone.utc).isoformat()
        listing["listing_date"] = None

        return listing

    except Exception as e:
        log.warning(f"Error parsing card: {e}")
        return None


def parse_hours_from_text(text: str) -> dict:
    """Extract flight hours data from listing text."""
    result = {}
    patterns = {
        "total_time_airframe": [
            r"TTAF[\s:]*(\d[\d,]+)", r"TTSN[\s:]*(\d[\d,]+)", r"TT[\s:]*(\d[\d,]+)",
            r"TOTAL[\s-]*TIME[\s:]*(\d[\d,]+)", r"(\d[\d,]+)[\s]*(?:HRS?|HOURS?)[\s]+(?:TT|TTAF|TTSN|TOTAL)",
            r"(\d[\d,]+)[\s]+TT\b",
        ],
        "time_since_overhaul": [
            r"SMOH[\s:]*(\d[\d,]+)", r"SFRM[\s:]*(\d[\d,]+)",
            r"SINCE[\s]+(?:MAJOR[\s]+)?OVERHAUL[\s:]*(\d[\d,]+)", r"(\d[\d,]+)[\s]*SMOH",
            r"(\d[\d,]+)[\s]+SMOH\b",
        ],
        "time_since_new_engine": [
            r"SNEW[\s:]*(\d[\d,]+)", r"(?:ENGINE|ENG)[\s]+SNEW[\s:]*(\d[\d,]+)",
        ],
        "time_since_prop_overhaul": [
            r"SPOH[\s:]*(\d[\d,]+)", r"SINCE[\s]+(?:PROP|PROPELLER)[\s]+(?:OVERHAUL|OH|NEW)[\s:]*(\d[\d,]+)",
            r"(\d[\d,]+)[\s]*SPOH",
        ],
        "time_since_top_overhaul": [r"STOH[\s:]*(\d[\d,]+)"],
    }
    for field, pats in patterns.items():
        for pat in pats:
            match = re.search(pat, text)
            if match:
                val_str = match.group(1).replace(",", "")
                try:
                    val = int(val_str)
                    if 0 <= val <= 100000:
                        result[field] = val
                        break
                except ValueError:
                    pass
    return result


def infer_aircraft_type(text: str) -> str:
    """Infer aircraft category from listing text."""
    text = text.upper()
    if any(w in text for w in ["JET", "CITATION", "LEARJET", "GULFSTREAM", "FALCON", "CHALLENGER"]):
        return "jet"
    if any(w in text for w in ["TURBOPROP", "TURBO PROP", "PT6", "TPE331", "KING AIR", "TBM", "PC-12"]):
        return "turboprop"
    if any(w in text for w in ["HELICOPTER", "ROTOR", "ROBINSON R", "BELL 206", "R22", "R44"]):
        return "helicopter"
    if any(w in text for w in ["MULTI ENGINE", "MULTI-ENGINE", "TWIN", "310", "337", "414", "421", "SENECA", "AZTEC", "BARON", "DUKE", "SEMINOLE"]):
        return "multi_engine_piston"
    return "single_engine_piston"


# ─── Detail Page Parser ────────────────────────────────────────────────────────
def parse_detail_page(soup: BeautifulSoup, listing: dict) -> dict:
    """Enrich a listing with data from its detail page."""
    try:
        for sel in [".listing-description-content", "#listing-description", "[class*='description']", ".vehicle-description"]:
            el = soup.select_one(sel)
            if el:
                listing["description_full"] = el.get_text("\n", strip=True)[:5000]
                break

        full_text = soup.get_text(" ", strip=True).upper()

        n_match = re.search(r"\bN(\d{1,5}[A-Z]{0,2})\b", full_text)
        if n_match:
            listing["n_number"] = "N" + n_match.group(1)

        for pat in [r"S/?N[\s:#]*(\d{3,8})", r"SERIAL[\s#:]*(?:NUMBER|NO\.?)[\s:#]*(\d{3,8})", r"S/N[\s:#]*([A-Z0-9]{4,12})"]:
            sn_match = re.search(pat, full_text)
            if sn_match:
                listing["serial_number"] = sn_match.group(1)
                break

        listing.update(parse_hours_from_text(full_text))

        engine_patterns = [
            r"(LYCOMING\s+[A-Z0-9\-]+)", r"(CONTINENTAL\s+[A-Z0-9\-]+)", r"(ROTAX\s+\d+[A-Z]*)",
            r"(PT6A-\d+[A-Z]*)", r"(TPE331-\d+[A-Z]*)", r"(IO-\d{3}[A-Z0-9]*)",
            r"(O-\d{3}[A-Z0-9]*)", r"(TSIO-\d{3}[A-Z0-9]*)",
        ]
        engines_found = []
        for pat in engine_patterns:
            engines_found.extend(re.findall(pat, full_text))
        if engines_found:
            listing["engine_model"] = engines_found[0].title()

        avionics_keywords = [
            "G1000", "G500", "G600", "G700", "GTN 750", "GTN 650", "GTN750", "GTN650",
            "GFC 500", "GFC500", "GFC 600", "WAAS", "ADS-B", "ADSB",
            "AUTOPILOT", "S-TEC", "STEC", "GARMIN", "ASPEN", "DYNON", "AVIDYNE", "IFD440", "IFD540",
            "GLASS PANEL", "G3X",
        ]
        found_avionics = [kw for kw in avionics_keywords if kw in full_text]
        if found_avionics:
            listing["avionics_notes"] = ", ".join(found_avionics[:10])

        paint_match = re.search(r"PAINT[\s:]*(\d{1,2})(?:/10)?", full_text)
        if paint_match:
            listing["paint_condition"] = int(paint_match.group(1))
        interior_match = re.search(r"INTERIOR[\s:]*(\d{1,2})(?:/10)?", full_text)
        if interior_match:
            listing["interior_condition"] = int(interior_match.group(1))

        dealer_keywords = ["LLC", "INC", "CORP", "AVIATION", "AIRCRAFT SALES", "DEALERS"]
        seller_el = soup.select_one("[class*='seller'], [class*='dealer'], [class*='contact']")
        if seller_el:
            seller_text = seller_el.get_text(strip=True).upper()
            listing["seller_type"] = "dealer" if any(k in seller_text for k in dealer_keywords) else "private"
            listing["seller_name"] = seller_el.get_text(strip=True)[:200]

        for sel in ["time", "[class*='date']", "[class*='posted']"]:
            date_el = soup.select_one(sel)
            if date_el:
                dt_attr = date_el.get("datetime") or date_el.get_text(strip=True)
                listing["listing_date"] = dt_attr[:50]
                break

        photos = []
        for img in soup.select("img[src*='photo'], img[src*='image'], [class*='gallery'] img"):
            src = img.get("data-src") or img.get("src", "")
            if src and "http" in src:
                photos.append(src)
        if photos:
            listing["photos"] = json.dumps(photos[:20])

    except Exception as e:
        log.warning(f"Detail page parse error: {e}")

    return listing


# ─── Pagination ────────────────────────────────────────────────────────────────
def get_total_pages(soup: BeautifulSoup) -> int:
    """Extract total page count from search results page."""
    count_match = re.search(
        r"(\d+(?:,\d+)?)\s+(?:listings?|aircraft|results?)",
        soup.get_text(), re.IGNORECASE
    )
    if count_match:
        total = int(count_match.group(1).replace(",", ""))
        pages = (total + LISTINGS_PER_PAGE - 1) // LISTINGS_PER_PAGE
        log.info(f"Found {total} total listings → {pages} pages")
        return pages

    pager = soup.select("[class*='pager'] a, [class*='pagination'] a, .pager a")
    page_nums = []
    for link in pager:
        try:
            page_nums.append(int(link.get_text(strip=True)))
        except ValueError:
            pass
    if page_nums:
        return max(page_nums)

    return 1


def get_listing_cards(soup: BeautifulSoup) -> list:
    """Extract listing card elements from a search results page."""
    cards = soup.select("article.search-card")
    if cards:
        log.debug(f"Found {len(cards)} cards using selector: article.search-card")
        return cards

    for sel in ["[class*='search-card']", "[class*='listing-item']", "[class*='vehicle-card']", "article[class*='tide']"]:
        cards = soup.select(sel)
        if len(cards) >= 3:
            log.debug(f"Found {len(cards)} cards using fallback: {sel}")
            return cards

    log.warning("Could not find listing cards with known selectors — trying heuristic")
    cards = []
    for div in soup.find_all(["div", "article"]):
        text = div.get_text()
        if re.search(r"\$\d{3,}", text) and re.search(r"\d{4}\s+[A-Z]", text.upper()):
            if len(div.get_text()) < 2000:
                cards.append(div)
    return cards[:50]


# ─── Database ──────────────────────────────────────────────────────────────────
def upsert_listings(supabase: Client, listings: list[dict]) -> int:
    """Upsert batch of listings into aircraft_listings table."""
    if not listings:
        return 0

    clean = []
    for listing in listings:
        row = {k: v for k, v in listing.items() if v is not None}
        if not row.get("source_id") and not row.get("source_url"):
            continue
        row["source"] = "aerotrader"
        row["source_site"] = "aerotrader"
        row["listing_source"] = "aerotrader"
        row["updated_at"] = datetime.now(timezone.utc).isoformat()
        clean.append(row)

    if not clean:
        return 0

    try:
        supabase.table("aircraft_listings").upsert(clean, on_conflict="source_site,source_id").execute()
        return len(clean)
    except Exception as e:
        log.error(f"Database upsert error: {e}")
        saved = 0
        for row in clean:
            try:
                supabase.table("aircraft_listings").upsert(row, on_conflict="source_site,source_id").execute()
                saved += 1
            except Exception as e2:
                log.error(f"  Failed single upsert for {row.get('source_id')}: {e2}")
        return saved


def get_scraped_makes(supabase: Client) -> set:
    """Return set of makes already in DB (for --resume mode)."""
    try:
        result = supabase.table("aircraft_listings").select("make").eq("source_site", "aerotrader").execute()
        return {r["make"] for r in result.data if r.get("make")}
    except Exception:
        return set()


# ─── Core Scrape Loop ──────────────────────────────────────────────────────────
def scrape_make(
    page,
    rate_limiter: RateLimiter,
    supabase: Optional[Client],
    make: Optional[str],
    dry_run: bool = False,
    fetch_details: bool = False,
    max_retries: int = DEFAULT_MAX_RETRIES,
    output_listings: Optional[list] = None,
) -> tuple[int, list[dict]]:
    """
    Scrape all listings for a given make (or all makes if make=None).
    Returns total listings scraped.
    """
    label = make or "ALL"
    log.info(f"{'='*50}")
    log.info(f"Scraping make: {label}")

    url = build_search_url(make=make, page=1)
    log.info(f"Fetching: {url}")
    soup = fetch_with_retry(page, url, rate_limiter, max_retries=max_retries, make=label)
    if not soup:
        log.error(f"Failed to fetch first page for {label}")
        return 0, []

    total_pages = get_total_pages(soup)
    log.info(f"Total pages for {label}: {total_pages}")

    if dry_run:
        total_pages = 1

    all_listings = []
    batch = []

    def process_page_cards(soup_page, page_num):
        cards = get_listing_cards(soup_page)
        log.info(f"  Page {page_num}: found {len(cards)} listing cards")
        for card in cards:
            listing = parse_listing_card(card)
            if not listing:
                continue

            if fetch_details and listing.get("source_url") and not dry_run:
                time.sleep(random.uniform(1.0, 2.5))
                detail_soup = fetch_with_retry(page, listing["source_url"], rate_limiter, max_retries=max_retries, make=label)
                if detail_soup:
                    listing = parse_detail_page(detail_soup, listing)

            batch.append(listing)
            all_listings.append(listing)
            if output_listings is not None:
                output_listings.append(listing)

            if dry_run:
                print_listing(listing)

    process_page_cards(soup, 1)

    for page_num in range(2, total_pages + 1):
        delay = random.uniform(2.5, 6.0)
        log.info(f"  Waiting {delay:.1f}s before page {page_num}...")
        time.sleep(delay)

        page_url = build_search_url(make=make, page=page_num)
        log.info(f"  Fetching page {page_num}: {page_url}")
        page_soup = fetch_with_retry(page, page_url, rate_limiter, max_retries=max_retries, make=label)

        if not page_soup:
            log.warning(f"  Skipping page {page_num} — failed to fetch")
            continue

        process_page_cards(page_soup, page_num)

        if supabase and len(batch) >= 50:
            saved = upsert_listings(supabase, batch)
            log.info(f"  Saved batch of {saved} listings to DB")
            batch = []

    if supabase and batch:
        saved = upsert_listings(supabase, batch)
        log.info(f"  Saved final batch of {saved} listings to DB")

    log.info(f"Completed {label}: {len(all_listings)} total listings scraped")
    return len(all_listings), all_listings


def print_listing(listing: dict):
    """Pretty-print a listing for dry-run mode."""
    print("\n" + "─" * 60)
    print(f"  {listing.get('year', '?')} {listing.get('make', '?')} {listing.get('model', '?')}")
    print(f"  Price:  ${listing.get('asking_price', 'N/A'):,}" if listing.get('asking_price') else "  Price:  N/A")
    print(f"  TTAF:   {listing.get('total_time_airframe', 'N/A')} hrs")
    print(f"  SMOH:   {listing.get('time_since_overhaul', 'N/A')} hrs")
    print(f"  Type:   {listing.get('aircraft_type', 'unknown')}")
    print(f"  State:  {listing.get('state', '?')}")
    print(f"  N#:     {listing.get('n_number', 'N/A')}")
    print(f"  URL:    {listing.get('source_url', 'N/A')}")
    if listing.get('avionics_notes'):
        print(f"  Avionics: {listing.get('avionics_notes')}")


# ─── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="AeroTrader.com aircraft listing scraper (Playwright)")
    parser.add_argument("--make", nargs="+", help="Make(s) to scrape (default: all)")
    parser.add_argument("--dry-run", action="store_true", help="Fetch 1 page, print, don't save")
    parser.add_argument("--resume", action="store_true", help="Skip makes already in DB")
    parser.add_argument("--details", action="store_true", help="Fetch each listing detail page (slower)")
    parser.add_argument("--all-makes", action="store_true", help="Scrape all known makes")
    parser.add_argument("--visible", action="store_true", help="Run browser in visible mode (headless=False)")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose (DEBUG) logging")
    parser.add_argument("--rpm", type=int, default=RATE_LIMIT_RPM, help=f"Max requests per minute (default: {RATE_LIMIT_RPM})")
    parser.add_argument("--retries", type=int, default=DEFAULT_MAX_RETRIES, help=f"Max retries per request (default: {DEFAULT_MAX_RETRIES})")
    parser.add_argument("--output", "-o", metavar="FILE", help="Write scraped listings to JSON file (for analysis)")
    args = parser.parse_args()

    global log
    log = setup_logging(verbose=args.verbose)

    supabase = None if args.dry_run else get_supabase()
    rate_limiter = RateLimiter(requests_per_minute=args.rpm, min_delay=MIN_DELAY_BETWEEN_REQUESTS)

    if args.make:
        makes_to_scrape = args.make
    elif args.all_makes or not args.make:
        makes_to_scrape = ALL_MAKES
    else:
        makes_to_scrape = [None]

    if args.resume and supabase:
        scraped = get_scraped_makes(supabase)
        log.info(f"Resume mode: skipping {len(scraped)} already-scraped makes: {scraped}")
        makes_to_scrape = [m for m in makes_to_scrape if m not in scraped]

    log.info(f"Will scrape {len(makes_to_scrape)} makes: {makes_to_scrape}")
    log.info(f"Rate limit: {args.rpm} req/min, retries: {args.retries}")

    from playwright.sync_api import sync_playwright

    total = 0
    collected: list[dict] = [] if args.output else []
    with sync_playwright() as p:
        log.info("Launching Playwright browser...")
        browser, context = _create_browser_context(p, headless=not args.visible)
        page = context.new_page()

        try:
            for make in makes_to_scrape:
                count, listings = scrape_make(
                    page=page,
                    rate_limiter=rate_limiter,
                    supabase=supabase,
                    make=make,
                    dry_run=args.dry_run,
                    fetch_details=args.details,
                    max_retries=args.retries,
                    output_listings=collected if args.output else None,
                )
                total += count

                if not args.dry_run and len(makes_to_scrape) > 1:
                    between_delay = random.uniform(10, 20)
                    log.info(f"Pausing {between_delay:.1f}s between makes...")
                    time.sleep(between_delay)
        finally:
            browser.close()

    if args.output and collected:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(collected, f, indent=2, default=str)
        log.info(f"Wrote {len(collected)} listings to {args.output}")

    log.info(f"\n{'='*50}")
    log.info(f"SCRAPE COMPLETE: {total} total listings processed")
    if supabase:
        log.info("All data saved to Supabase aircraft_listings table")


if __name__ == "__main__":
    main()
