"""
AvBuyer scraper aligned to Full Hangar shared conventions.
"""

from __future__ import annotations

import re
import time
import json
import random
import logging
import argparse
import threading
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

try:
    from config import get_manufacturer_tier, normalize_manufacturer
    from description_parser import parse_description
    from env_check import env_check
    from media_refresh_utils import (
        apply_media_update,
        fetch_refresh_rows,
        gallery_count,
        load_source_ids_file,
    )
    from schema import validate_listing
    from scraper_base import (
        compute_listing_fingerprint,
        fetch_existing_state,
        get_supabase,
        mark_inactive_listings,
        refresh_seen_for_unchanged,
        safe_upsert_with_fallback,
        setup_logging,
        should_skip_detail,
    )
except ImportError:  # pragma: no cover
    from .config import get_manufacturer_tier, normalize_manufacturer
    from .description_parser import parse_description
    from .env_check import env_check
    from .media_refresh_utils import (
        apply_media_update,
        fetch_refresh_rows,
        gallery_count,
        load_source_ids_file,
    )
    from .schema import validate_listing
    from .scraper_base import (
        compute_listing_fingerprint,
        fetch_existing_state,
        get_supabase,
        mark_inactive_listings,
        refresh_seen_for_unchanged,
        safe_upsert_with_fallback,
        setup_logging,
        should_skip_detail,
    )

load_dotenv()

log = logging.getLogger(__name__)


# ─── Constants ────────────────────────────────────────────────────────────────

SOURCE_SITE = "avbuyer"
BASE_URL = "https://www.avbuyer.com"
STATE_DIR = Path(__file__).resolve().parent / "state"

# All target category paths with Full Hangar aircraft_type mapping
CATEGORIES = [
    {"path": "/aircraft/single-piston",          "type": "single_engine_piston", "label": "Single Engine Piston"},
    {"path": "/aircraft/twin-piston",            "type": "multi_engine_piston",  "label": "Twin Engine Piston"},
    {"path": "/aircraft/private-jets/light",     "type": "jet",                  "label": "Light Jets"},
    {"path": "/aircraft/private-jets/mid-size",  "type": "jet",                  "label": "Mid-Size Jets"},
    {"path": "/aircraft/private-jets/large",     "type": "jet",                  "label": "Large Jets"},
    {"path": "/aircraft/turboprops",             "type": "turboprop",            "label": "Turboprops"},
    {"path": "/aircraft/helicopter/turbine",     "type": "helicopter",           "label": "Turbine Helicopters"},
    {"path": "/aircraft/helicopter/piston",      "type": "helicopter",           "label": "Piston Helicopters"},
]

LISTINGS_PER_PAGE = 20   # "Showing 1-20 of 218" confirmed

# Retry / rate config
MAX_RETRIES = 5
BASE_DELAY  = 3.0
MAX_DELAY   = 60.0
MIN_DELAY   = 2.5

REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/145.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
}

NO_PRICE_PHRASES = ("make offer", "please call", "price on request", "contact")
SUPPORTED_CURRENCY_CODES = {"USD", "ARS", "AUD", "BRL", "CAD", "CHF", "CNY", "EUR", "GBP", "INR", "NZD", "ZAR"}
_MONEY_RE = re.compile(
    r"(?:(?P<code>USD|ARS|AUD|BRL|CAD|CHF|CNY|EUR|GBP|INR|NZD|ZAR)\s*)?"
    r"(?P<symbol>US\$|A\$|C\$|\$|€|£|R)?\s*"
    r"(?P<amount>\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?",
    re.I,
)


# ─── Rate Limiter ─────────────────────────────────────────────────────────────

class RateLimiter:
    def __init__(self):
        self._last = 0.0
        self._lock = threading.Lock()

    def wait(self, extra: float = 0.0):
        with self._lock:
            elapsed = time.monotonic() - self._last
            needed  = max(0, MIN_DELAY + extra - elapsed)
            if needed > 0:
                time.sleep(needed + random.uniform(0, 0.8))
            self._last = time.monotonic()


def _backoff(attempt: int) -> float:
    return min(BASE_DELAY * (2 ** attempt) + random.uniform(0, 2), MAX_DELAY)


# ─── HTTP Fetcher (plain requests) ────────────────────────────────────────────

session = requests.Session()
session.headers.update(REQUEST_HEADERS)
_playwright_fallback_active = False


def fetch_html(url: str, rl: RateLimiter, pw_page=None, label: str = "") -> Optional[BeautifulSoup]:
    """
    Try plain requests first. If blocked (403/503/CAPTCHA text),
    fall back to Playwright if pw_page is provided.
    """
    global _playwright_fallback_active

    if _playwright_fallback_active and pw_page:
        return _fetch_playwright(pw_page, url, rl, label)

    for attempt in range(MAX_RETRIES):
        rl.wait()
        try:
            resp = session.get(url, timeout=20, allow_redirects=True)
            if resp.status_code == 200:
                html = resp.text
                # Check for soft-block / CAPTCHA page
                if _is_blocked(html):
                    log.warning(f"Soft block detected [{label}] — switching to Playwright")
                    _playwright_fallback_active = True
                    if pw_page:
                        return _fetch_playwright(pw_page, url, rl, label)
                    return None
                return BeautifulSoup(html, "html.parser")
            if resp.status_code in (429, 503):
                wait = _backoff(attempt)
                log.warning(f"HTTP {resp.status_code} [{label}]. Waiting {wait:.1f}s")
                time.sleep(wait)
                continue
            if resp.status_code in (403, 401):
                log.warning(f"HTTP 403 [{label}] — switching to Playwright")
                _playwright_fallback_active = True
                if pw_page:
                    return _fetch_playwright(pw_page, url, rl, label)
                return None
            log.warning(f"HTTP {resp.status_code} [{label}]")
            return None
        except Exception as e:
            wait = _backoff(attempt)
            log.warning(f"Request error: {e}. Retry in {wait:.1f}s [{label}]")
            time.sleep(wait)

    log.error(f"All retries failed: {url}")
    return None


def _is_blocked(html: str) -> bool:
    """Detect likely challenge pages while avoiding false positives."""
    lower = (html or "").lower()
    strict_indicators = [
        "cf-challenge",
        "__cf_chl",
        "/cdn-cgi/challenge-platform",
        "checking your browser before accessing",
        "please stand by, while we are checking your browser",
        "verify you are human",
        "performing security verification",
        "access denied",
    ]
    return any(ind in lower for ind in strict_indicators)


def _fetch_playwright(pw_page, url: str, rl: RateLimiter, label: str = "") -> Optional[BeautifulSoup]:
    for attempt in range(MAX_RETRIES):
        rl.wait()
        try:
            resp = pw_page.goto(url, wait_until="domcontentloaded", timeout=35000)
            if resp and resp.status == 200:
                return BeautifulSoup(pw_page.content(), "html.parser")
            if resp and resp.status in (429, 503):
                time.sleep(_backoff(attempt))
                continue
        except Exception as e:
            log.warning(f"Playwright error: {e} [{label}]")
            time.sleep(_backoff(attempt))
    return None


# ─── Playwright setup (lazy — only if needed) ─────────────────────────────────

def _create_playwright_browser(playwright, headless: bool = True):
    browser = playwright.chromium.launch(
        headless=headless,
        args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
    )
    context = browser.new_context(
        user_agent=REQUEST_HEADERS["User-Agent"],
        viewport={"width": 1280, "height": 900},
        locale="en-US",
    )
    context.add_init_script(
        "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
    )
    return browser, context


# ─── Step 1: Make Discovery ───────────────────────────────────────────────────

def discover_makes_for_category(cat_path: str, rl: RateLimiter, pw_page=None) -> list[dict]:
    """
    Scrape "Browse by Model" page for a category.
    URL pattern: /aircraft/{category}/browse-by-model
    OR: parse the left-side filter on the main listing page.
    Returns list of {"name": str, "id": str, "slug": str, "url": str}
    """
    # Try browse-by-model page first
    browse_url = f"{BASE_URL}{cat_path}/browse-by-model"
    soup = fetch_html(browse_url, rl, pw_page, label=f"browse-{cat_path}")

    makes = []
    if soup:
        makes = _parse_make_links(soup, cat_path)

    # Fallback: parse left sidebar of main listing page
    if not makes:
        main_url = f"{BASE_URL}{cat_path}"
        soup = fetch_html(main_url, rl, pw_page, label=f"main-{cat_path}")
        if soup:
            makes = _parse_make_links(soup, cat_path)

    log.info(f"  {cat_path}: discovered {len(makes)} makes")
    return makes


def _parse_make_links(soup: BeautifulSoup, cat_path: str) -> list[dict]:
    """
    Extract make links containing ?make=NNNN.
    Confirmed URL pattern from screenshots:
      /aircraft/twin-piston/cessna?include_wo_price=Y&make=3532
      /aircraft/twin-piston/piper?include_wo_price=Y&make=3579
    """
    makes = []
    seen  = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        m = re.search(r'[?&]make=(\d+)', href)
        if not m:
            continue
        make_id = m.group(1)
        if make_id in seen:
            continue

        # Extract make name from link text or slug
        name = a.get_text(strip=True)
        if not name or len(name) > 50:
            continue

        # Derive make slug from href path
        path = urlparse(href).path
        slug = path.rstrip("/").split("/")[-1]

        # Build canonical URL
        url = (
            f"{BASE_URL}{cat_path}/{slug}"
            f"?make={make_id}&include_wo_price=Y"
        )

        makes.append({"name": name, "id": make_id, "slug": slug, "url": url})
        seen.add(make_id)
    return makes


# ─── Step 2: Card Parsing ─────────────────────────────────────────────────────

def get_cards(soup: BeautifulSoup) -> list:
    """
    Return all listing card elements.
    Cards: div[id^="item_card_"] (confirmed from DevTools Image 1)
    """
    cards = [d for d in soup.find_all("div", id=re.compile(r'^item_card_\d+'))]
    if cards:
        return cards
    # Fallback
    return soup.find_all("div", class_=re.compile(r'listing-item'))


def parse_card(card, aircraft_type: str, category_path: str) -> Optional[dict]:
    """
    Parse a single listing card.

    Confirmed structure (DevTools screenshot):
      Card:     div[id^="item_card_"] class="listing-item [premium]"
      Link:     a.tricky-link  href="/aircraft/{cat}/{make}/{model}/{id}"
      Title:    h2.item-title  (appears in both .mob-title-price and .auto.cell)
      Price:    div.price  → "Price: USD $9,995,000"
      Location: div.list-item-location  → "North America..., For Sale by " + <b>Seller</b>
      Year/SN/TT: ul.fa-no-bullet.clearfix > li  → ["Year 2006", "S/N 4029", "Total Time 8289"]
      Summary:  div.list-item-para
    """
    # ── Listing ID ────────────────────────────────────────────────────────────
    card_id  = card.get("id", "")
    id_match = re.search(r'item_card_(\d+)', card_id)
    if not id_match:
        return None
    listing_id = id_match.group(1)

    # ── Detail URL ────────────────────────────────────────────────────────────
    # a.tricky-link is the primary card link (confirmed)
    link_el    = card.find("a", class_="tricky-link")
    detail_url = urljoin(BASE_URL, link_el["href"]) if link_el else None
    # Fallback: any link with listing ID in path
    if not detail_url:
        for a in card.find_all("a", href=True):
            if listing_id in a["href"]:
                detail_url = urljoin(BASE_URL, a["href"])
                break

    # ── Title ─────────────────────────────────────────────────────────────────
    # Use the title inside .auto.cell (not .mob-title-price which duplicates)
    auto_cell = card.find("div", class_=re.compile(r'\bauto\b.*\bcell\b|\bcell\b.*\bauto\b'))
    title_el  = (auto_cell or card).find("h2", class_="item-title")
    if not title_el:
        title_el = card.find("h2", class_="item-title")
    title = title_el.get_text(strip=True) if title_el else ""

    # ── Price ─────────────────────────────────────────────────────────────────
    # div.price → "Price: USD $9,995,000" or "Make offer" or "Please call"
    asking_price = None
    price_el = card.find("div", class_="price")
    if price_el:
        price_text = price_el.get_text(" ", strip=True)
        parsed_price, parsed_currency, _ = _parse_price_and_currency(price_text)
        if parsed_price is not None and parsed_currency == "USD":
            asking_price = parsed_price

    # ── Year / S/N / Total Time ───────────────────────────────────────────────
    # ul.fa-no-bullet.clearfix > li items (confirmed in DevTools)
    year, sn, tt = None, None, None
    dtl_ul = card.find("ul", class_=lambda c: c and "fa-no-bullet" in c)
    if dtl_ul:
        for li in dtl_ul.find_all("li"):
            text = li.get_text(strip=True)
            if re.match(r'^Year\s+\d{4}$', text, re.I):
                year = int(re.search(r'\d{4}', text).group())
            elif re.match(r'^S/N\s+', text, re.I):
                sn = re.sub(r'^S/N\s+', '', text, flags=re.I).strip()
            elif re.match(r'^Total\s+Time\s+', text, re.I):
                digits = re.sub(r'[^\d]', '', text)
                tt = int(digits) if digits else None

    # Fallback: pipe-delimited text "YEAR 2004 | S/N 30 | TOTAL TIME 7107"
    if not year or not sn:
        t_year, t_sn, t_tt = _parse_year_sn_tt(card.get_text(" ", strip=True))
        year = year or t_year
        sn   = sn   or t_sn
        tt   = tt   or t_tt

    # Title-based year final fallback
    if not year:
        m = re.match(r'^(\d{4})\s', title)
        if m:
            year = int(m.group(1))

    # ── Location + Seller ─────────────────────────────────────────────────────
    # div.list-item-location → "North America..., For Sale by " + <b>Seller Name</b>
    location_raw = None
    seller_name  = None
    seller_type  = "private"
    loc_el = card.find("div", class_="list-item-location")
    if loc_el:
        b_el = loc_el.find("b")
        if b_el:
            seller_name = b_el.get_text(strip=True)
            seller_type = _classify_seller(seller_name)
        full_loc = loc_el.get_text(strip=True)
        for_sale_idx = full_loc.lower().find(", for sale by")
        location_raw = full_loc[:for_sale_idx].strip() if for_sale_idx > 0 else full_loc
    location_city, location_state = _split_location(location_raw)

    # ── Make / model ──────────────────────────────────────────────────────────
    make, model = _parse_make_model(title, detail_url or "")

    # ── Photo ─────────────────────────────────────────────────────────────────
    photo_url = None
    img = card.find("img", class_=re.compile(r'img-fluid|photo|slide', re.I))
    if not img:
        img = card.find("img")
    if img:
        src = img.get("src") or img.get("data-src", "")
        if src and "coming-soon" not in src.lower() and "logo" not in src.lower():
            photo_url = src if src.startswith("http") else urljoin(BASE_URL, src)

    # ── Summary (card-level description) ─────────────────────────────────────
    # div.list-item-para — the short bullet text visible on the card
    para_el = card.find("div", class_="list-item-para")
    description = para_el.get_text(separator=" ", strip=True)[:1000] if para_el else None

    return {
        "source_site":         SOURCE_SITE,
        "listing_source":      SOURCE_SITE,
        "source_id":           f"ab_{listing_id}",
        "source_listing_id":   f"ab_{listing_id}",
        "url":                 detail_url,
        "title":               title,
        "year":                year,
        "make":                make,
        "model":               model,
        "aircraft_type":       aircraft_type,
        "price_asking":        asking_price,
        "asking_price":        asking_price,
        "serial_number":       sn,
        "n_number":            None,
        "total_time_airframe": tt,
        "location_raw":        location_raw,
        "location_city":       location_city,
        "location_state":      location_state,
        "seller_name":         seller_name,
        "seller_type":         seller_type,
        "primary_image_url":   photo_url,
        "image_urls":          [photo_url] if photo_url else None,
        "description":         description,
        "description_full":    description,
        "condition":           "used",
        "scraped_at":          datetime.now(timezone.utc).isoformat(),
        "avionics_notes":      None,
        "airframe_notes":      None,
        "engine_notes":        None,
        "maintenance_notes":   None,
        "interior_notes":      None,
        "manufacturer_tier":   None,
        "description_intelligence": None,
        "listing_fingerprint": None,
        "first_seen_date":     None,
        "last_seen_date":      None,
        "is_active":           True,
        "inactive_date":       None,
        "engine_time_since_overhaul": None,
        "time_since_overhaul": None,
    }


def _parse_year_sn_tt(text: str) -> tuple[Optional[int], Optional[str], Optional[int]]:
    """
    Extract year, S/N, TT from card text.
    Pattern: "YEAR 2004 | S/N 30 | TOTAL TIME 7107"
    Or any variation with pipe separators.
    """
    year, sn, tt = None, None, None

    ym = re.search(r'\bYEAR\s+(\d{4})\b', text, re.I)
    if ym:
        year = int(ym.group(1))

    sm = re.search(r'\bS/?N\s+([\w\-]+)', text, re.I)
    if sm:
        sn = sm.group(1).strip()

    tm = re.search(r'TOTAL\s+TIME\s+([\d,]+)', text, re.I)
    if tm:
        tt = int(tm.group(1).replace(",", ""))

    return year, sn, tt


def _parse_make_model(title: str, url: str) -> tuple[Optional[str], Optional[str]]:
    """Extract make/model from title like '2014 Dassault Falcon 7X' or URL path."""
    # From title: skip year, first token is make, rest is model
    m = re.match(r'^(\d{4})\s+(\S+)\s+(.+)$', title.strip())
    if m:
        return m.group(2).strip(), m.group(3).strip()

    # From URL: /aircraft/{cat}/{make-slug}/{model-slug}/{id}
    parts = [p for p in urlparse(url).path.split("/") if p]
    if len(parts) >= 4:
        return parts[-3].replace("-", " ").title(), parts[-2].replace("-", " ").title()

    return None, None


def _classify_seller(text: str) -> str:
    if not text:
        return "private"
    dealer_kw = ["LLC", "INC", "CORP", "AVIATION", "AIRCRAFT", "JETS", "AIR", "INTERNATIONAL", "LIMITED", "LTD"]
    return "dealer" if any(k in text.upper() for k in dealer_kw) else "private"


def _extract_state(location: str) -> Optional[str]:
    m = re.search(r'\b([A-Z]{2})\b', location)
    return m.group(1) if m else None


def _split_location(location: str | None) -> tuple[Optional[str], Optional[str]]:
    if not location:
        return None, None
    text = re.sub(r"\s+", " ", location).strip()
    if not text:
        return None, None
    if re.match(r"^.+,\s*[A-Z]{2}$", text):
        city, state = [part.strip() for part in text.rsplit(",", 1)]
        return city, state.upper()
    return text, _extract_state(text)


def _extract_price_segment(text: str) -> str:
    raw = re.sub(r"\s+", " ", text or "").strip()
    if not raw:
        return ""
    lower = raw.lower()
    idx = lower.find("price")
    if idx >= 0:
        raw = raw[idx:]
    # Keep the visible price sentence only; avoid neighboring specs.
    raw = re.split(
        r"\b(?:price\s+entered\s+as|excl\.?\s*vat|incl\.?\s*vat|year|s/n|reg|tt)\b",
        raw,
        maxsplit=1,
        flags=re.I,
    )[0]
    return raw.strip()


def _parse_price_and_currency(text: str) -> tuple[Optional[int], Optional[str], str]:
    segment = _extract_price_segment(text)
    if not segment:
        return None, None, ""
    lower = segment.lower()
    if any(phrase in lower for phrase in NO_PRICE_PHRASES):
        return None, None, segment

    for match in _MONEY_RE.finditer(segment):
        amount = match.group("amount")
        if not amount:
            continue
        try:
            value = int(round(float(amount.replace(",", ""))))
        except ValueError:
            continue

        code = (match.group("code") or "").upper().strip() or None
        symbol = (match.group("symbol") or "").strip()
        if code is None:
            if symbol in {"$", "US$"}:
                code = "USD"
            elif symbol == "R":
                code = "ZAR"
            elif symbol == "€":
                code = "EUR"
            elif symbol == "£":
                code = "GBP"
            elif symbol == "A$":
                code = "AUD"
            elif symbol == "C$":
                code = "CAD"

        if code and code not in SUPPORTED_CURRENCY_CODES:
            continue
        return value, code, segment

    return None, None, segment


def _extract_usd_price_with_playwright(
    pw_page,
    detail_url: str,
    rl: Optional["RateLimiter"],
    label: str = "",
) -> Optional[int]:
    if not pw_page or not detail_url:
        return None

    try:
        if rl:
            rl.wait(extra=0.3)
        pw_page.goto(detail_url, wait_until="domcontentloaded", timeout=35000)
        try:
            pw_page.wait_for_selector(".dtl-price", timeout=12000)
        except Exception:
            pass
        pw_page.wait_for_timeout(1200)
    except Exception as exc:
        log.debug("Playwright goto failed for USD parse [%s]: %s", label, exc)
        return None

    for _ in range(6):
        try:
            dtl_text = pw_page.eval_on_selector(".dtl-price", "el => el.innerText")
        except Exception as exc:
            if "Execution context was destroyed" in str(exc):
                try:
                    pw_page.wait_for_load_state("domcontentloaded", timeout=8000)
                    pw_page.wait_for_timeout(500)
                    dtl_text = pw_page.eval_on_selector(".dtl-price", "el => el.innerText")
                except Exception:
                    dtl_text = ""
            else:
                dtl_text = ""

        try:
            parsed_price, parsed_currency, _ = _parse_price_and_currency(dtl_text or "")
        except Exception:
            dtl_text = ""
            parsed_price, parsed_currency = None, None
        if parsed_price is not None and parsed_currency == "USD":
            return parsed_price

        try:
            changed = pw_page.evaluate(
                """() => {
                    const sel = document.querySelector('#currency-dropdown');
                    if (!sel) return false;
                    sel.value = 'USD';
                    sel.dispatchEvent(new Event('input', { bubbles: true }));
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                    return true;
                }"""
            )
        except Exception:
            changed = False
        if not changed:
            break
        try:
            pw_page.wait_for_load_state("domcontentloaded", timeout=8000)
        except Exception:
            pass
        pw_page.wait_for_timeout(700)

    return None


def _slugify(value: str) -> str:
    slug = (value or "").strip().lower()
    slug = re.sub(r"[^a-z0-9\s\-]", "", slug)
    slug = re.sub(r"\s+", "-", slug)
    slug = re.sub(r"-{2,}", "-", slug)
    return slug.strip("-")


# ─── Step 2: Pagination ───────────────────────────────────────────────────────

def get_total_pages(soup: BeautifulSoup) -> int:
    """
    Extract page count from "Showing 1-20 of 218" text.
    Or parse pagination links.
    """
    count_m = re.search(r'Showing\s+\d+\s*-\s*\d+\s+of\s+([\d,]+)', soup.get_text(), re.I)
    if count_m:
        total = int(count_m.group(1).replace(",", ""))
        pages = (total + LISTINGS_PER_PAGE - 1) // LISTINGS_PER_PAGE
        log.debug(f"Total: {total} listings → {pages} pages")
        return pages

    # Fallback: highest numbered pagination link
    nums = []
    for a in soup.find_all("a", href=re.compile(r'/page-\d+')):
        pm = re.search(r'/page-(\d+)', a["href"])
        if pm:
            nums.append(int(pm.group(1)))
    return max(nums) if nums else 1


def build_page_url(base_url: str, page: int) -> str:
    """
    Build page URL.
    /aircraft/twin-piston/cessna?make=3532&include_wo_price=Y → page 2:
    /aircraft/twin-piston/cessna/page-2?make=3532&include_wo_price=Y
    """
    if page <= 1:
        return base_url
    parsed = urlparse(base_url)
    # Insert /page-N before query string
    new_path = parsed.path.rstrip("/") + f"/page-{page}"
    return f"{BASE_URL}{new_path}?{parsed.query}" if parsed.query else f"{BASE_URL}{new_path}"


# ─── Step 3: Detail Page ──────────────────────────────────────────────────────

def parse_detail(
    soup: BeautifulSoup,
    detail_url: str = "",
    pw_page=None,
    rl: Optional["RateLimiter"] = None,
    listing_id: str = "",
) -> dict:
    """
    Parse AvBuyer detail page.
    Confirmed selectors (DevTools Images 7-8):
      Specs table:  div.grid-x.dtl-list rows
                    → div.cell.small-4 (label) + div.cell.small-8 (value)
      Description:  div.expanded > ul > li items
      Spec sections: div.aircraft-specifications
                    → div.large-6.medium-6.cell → h3 + text
    """
    extra = {}

    # ── Specs table ───────────────────────────────────────────────────────────
    for row in soup.find_all("div", class_=lambda c: c and "dtl-list" in c):
        cells = row.find_all("div", class_=re.compile(r'\bcell\b'))
        if len(cells) >= 2:
            label = cells[0].get_text(strip=True).lower().rstrip(":")
            value = cells[-1].get_text(strip=True)
            if not label or not value or value == "-":
                continue
            _map_spec(label, value, extra)

    # ── Price ─────────────────────────────────────────────────────────────────
    price_el = soup.find(class_=re.compile(r'dtl-price', re.I))
    if price_el:
        price_text = price_el.get_text(" ", strip=True)
        parsed_price, parsed_currency, parsed_segment = _parse_price_and_currency(price_text)
        if parsed_price is not None and parsed_currency == "USD":
            extra["asking_price"] = parsed_price
            extra["price_asking"] = parsed_price
        elif parsed_price is not None and parsed_currency and parsed_currency != "USD":
            usd_price = _extract_usd_price_with_playwright(
                pw_page=pw_page,
                detail_url=detail_url,
                rl=rl,
                label=listing_id or detail_url,
            )
            if usd_price is None and pw_page and detail_url:
                usd_price = _extract_usd_price_with_playwright(
                    pw_page=pw_page,
                    detail_url=detail_url,
                    rl=rl,
                    label=listing_id or detail_url,
                )
            if usd_price is not None:
                extra["asking_price"] = usd_price
                extra["price_asking"] = usd_price
            else:
                log.info(
                    "Non-USD AvBuyer price skipped (%s) for %s: %s",
                    parsed_currency,
                    listing_id or detail_url,
                    parsed_segment,
                )

    # ── Location ──────────────────────────────────────────────────────────────
    loc_el = soup.find(class_=re.compile(r'list-item-location', re.I))
    if loc_el:
        loc = loc_el.get_text(strip=True)
        if loc:
            extra["location_raw"] = loc
            city, state = _split_location(loc)
            extra["location_city"] = city
            extra["location_state"] = state

    # ── Description bullets ───────────────────────────────────────────────────
    desc_div = soup.find("div", class_=re.compile(r'\bexpanded\b'))
    if desc_div:
        bullets = [li.get_text(strip=True) for li in desc_div.find_all("li")]
        if bullets:
            joined = "\n".join(bullets)[:3000]
            extra["description"] = joined
            extra["description_full"] = joined

    # ── Specification sections ────────────────────────────────────────────────
    # div.aircraft-specifications → div.large-6.medium-6.cell → h3 header + text
    spec_div = soup.find("div", class_=re.compile(r'aircraft-specifications', re.I))
    if spec_div:
        for cell in spec_div.find_all("div", class_=lambda c: c and "large-6" in c and "cell" in c):
            h3 = cell.find("h3")
            if not h3:
                continue
            header  = h3.get_text(strip=True).lower()
            content = cell.get_text(separator="\n", strip=True)
            content = content.replace(h3.get_text(strip=True), "", 1).strip()[:2000]
            if "airframe" in header:
                extra["airframe_notes"] = content
                # Extract TT from airframe section
                tt_m = re.search(r'Total\s+Hours?\s+([\d,]+)', content, re.I)
                if tt_m:
                    extra["total_time_airframe"] = int(tt_m.group(1).replace(",", ""))
            elif "engine" in header:
                extra["engine_notes"] = content
                # SMOH
                sm = re.search(r'(?:SMOH|TSMOH|since\s+overhaul)\s*[:\-]?\s*([\d,]+)', content, re.I)
                if sm:
                    tso = int(sm.group(1).replace(",", ""))
                    extra["time_since_overhaul"] = tso
                    extra["engine_time_since_overhaul"] = tso
            elif "avionics" in header or "avionics" in content.lower():
                extra["avionics_notes"] = content
            elif "interior" in header or "exterior" in header:
                extra["interior_notes"] = content
            elif "maintenance" in header:
                extra["maintenance_notes"] = content

    # ── Avionics keywords fallback ────────────────────────────────────────────
    if not extra.get("avionics_notes"):
        full_text = soup.get_text(" ").upper()
        av_kw = ["G1000", "G500", "GTN750", "GTN650", "WAAS", "ADS-B",
                 "GARMIN", "AUTOPILOT", "GLASS PANEL", "HONEYWELL", "PRIMUS"]
        found = [k for k in av_kw if k in full_text]
        if found:
            extra["avionics_notes"] = ", ".join(found[:12])

    # ── Generic section fallback ──────────────────────────────────────────────
    section_targets = {
        "airframe": "airframe_notes",
        "engine": "engine_notes",
        "avionics": "avionics_notes",
        "maintenance": "maintenance_notes",
    }
    for heading in soup.find_all(["h3", "h4"]):
        heading_text = heading.get_text(" ", strip=True).lower()
        if not heading_text:
            continue
        matched_key = None
        for needle, field in section_targets.items():
            if needle in heading_text and not extra.get(field):
                matched_key = field
                break
        if not matched_key:
            continue
        container = heading.find_parent("div")
        if not container:
            continue
        raw = container.get_text(separator="\n", strip=True)
        value = raw.replace(heading.get_text(strip=True), "", 1).strip()
        if value and len(value) >= 20:
            extra[matched_key] = value[:2000]

    gallery_urls = _extract_gallery_urls(soup)
    if gallery_urls:
        extra["image_urls"] = gallery_urls
        extra["primary_image_url"] = gallery_urls[0]

    return extra


def _extract_gallery_urls(soup: BeautifulSoup) -> list[str]:
    gallery_urls: list[str] = []
    seen: set[str] = set()

    def _push(raw_value: str | None) -> None:
        value = str(raw_value or "").strip()
        if not value:
            return
        # srcset can contain multiple comma-separated candidates.
        srcset_candidates = [part.strip().split(" ")[0] for part in value.split(",")] if "," in value else [value]
        for candidate in srcset_candidates:
            if not candidate:
                continue
            full = candidate if candidate.startswith("http") else urljoin(BASE_URL, candidate)
            low = full.lower()
            if low.endswith(".svg"):
                continue
            if "avbuyer.com/live/uploads/image/" not in low and "cdn.avbuyer.com/live/uploads/image/" not in low:
                continue
            if any(token in low for token in ("logo", "icon", "sprite", "banner", "coming-soon", "placeholder")):
                continue
            if full in seen:
                continue
            seen.add(full)
            gallery_urls.append(full)

    # Prefer carousel-specific selectors first (confirmed by live DOM).
    for node in soup.select("div.large-img.slick-slide, div.large-img"):
        _push(node.get("image-src"))
        _push(node.get("data-image-src"))
        for img in node.select("img.lazybox, img"):
            _push(img.get("data-lazy"))
            _push(img.get("data-src"))
            _push(img.get("src"))
        for source in node.select("source"):
            _push(source.get("data-lazy"))
            _push(source.get("srcset"))
            _push(source.get("src"))

    # Fallback for pages where the carousel markup shape differs.
    for img in soup.select("img[data-lazy], img[src], img[data-src]"):
        _push(img.get("data-lazy"))
        _push(img.get("data-src"))
        _push(img.get("src"))
    for source in soup.select("source[srcset], source[data-lazy], source[src]"):
        _push(source.get("data-lazy"))
        _push(source.get("srcset"))
        _push(source.get("src"))
    for node in soup.select("[image-src], [data-image-src]"):
        _push(node.get("image-src"))
        _push(node.get("data-image-src"))

    return gallery_urls[:25]


def _map_spec(label: str, value: str, target: dict):
    """Map a label/value spec pair to the target dict."""
    if "year" == label:
        try:
            target["year"] = int(value)
        except ValueError:
            pass
    elif "s/n" in label or "serial" in label:
        target["serial_number"] = value
    elif "reg" in label or "registration" in label:
        target["n_number"] = value
    elif "tt" == label or "total time" in label:
        digits = re.sub(r'[^\d]', '', value)
        if digits:
            target["total_time_airframe"] = int(digits)
    elif "location" in label:
        target["location_raw"] = value
        city, state = _split_location(value)
        target["location_city"] = city
        target["location_state"] = state


# ─── Scrape one make ──────────────────────────────────────────────────────────

def scrape_make(
    make_info: dict,
    aircraft_type: str,
    rl: RateLimiter,
    fetch_details: bool = True,
    detail_stale_days: int = 2,
    max_pages: int = 0,
    model_filter: str = "",
    supabase=None,
    dry_run: bool = False,
    existing_ids: set = None,
    output_listings: list = None,
    pw_page=None,
) -> int:
    existing_ids = existing_ids or set()
    name = make_info["name"]
    url  = make_info["url"]

    log.info(f"  Make: {name}  |  {url}")

    soup = fetch_html(url, rl, pw_page, label=name)
    if not soup:
        log.warning(f"  Failed to load {url}")
        return 0

    total_pages = get_total_pages(soup)
    if max_pages and max_pages > 0:
        total_pages = min(total_pages, max_pages)
    log.info(f"  {name}: {total_pages} page(s)")

    all_listings = []
    page_num     = 1

    while page_num <= total_pages:
        if page_num > 1:
            page_url = build_page_url(url, page_num)
            soup     = fetch_html(page_url, rl, pw_page, label=f"{name}-p{page_num}")
            if not soup:
                break

        cards = get_cards(soup)
        log.debug(f"  Page {page_num}: {len(cards)} cards")

        if not cards:
            break

        for card in cards:
            lst = parse_card(card, aircraft_type, "")
            if not lst or lst["source_id"] in existing_ids:
                continue
            if model_filter:
                needle = model_filter.strip().lower()
                title_text = str(lst.get("title") or "").lower()
                model_text = str(lst.get("model") or "").lower()
                if needle not in title_text and needle not in model_text:
                    continue
            all_listings.append(lst)

        page_num += 1
        if len(cards) < LISTINGS_PER_PAGE:
            break

    existing_map: dict[str, dict[str, Any]] = {}
    if supabase and all_listings:
        source_ids = [str(row.get("source_id")) for row in all_listings if row.get("source_id")]
        existing_map = _fetch_existing_state(supabase, source_ids)

    # Enrich with detail pages
    if fetch_details and all_listings:
        for i, lst in enumerate(all_listings):
            if not lst.get("url"):
                continue
            if should_skip_detail(existing_map.get(str(lst.get("source_id") or "")), detail_stale_days):
                continue
            log.debug(f"  Detail {i+1}/{len(all_listings)}: {lst['source_id']}")
            dsoup = fetch_html(lst["url"], rl, pw_page, label=f"{name}-detail")
            if dsoup:
                detail = parse_detail(
                    dsoup,
                    detail_url=str(lst.get("url") or ""),
                    pw_page=pw_page,
                    rl=rl,
                    listing_id=str(lst.get("source_id") or ""),
                )
                for key, value in detail.items():
                    if not value:
                        continue
                    if key == "image_urls":
                        existing_images = lst.get("image_urls")
                        existing_count = len(existing_images) if isinstance(existing_images, list) else 0
                        incoming_count = len(value) if isinstance(value, list) else 0
                        if incoming_count > existing_count:
                            lst["image_urls"] = value
                            if isinstance(value, list) and value:
                                lst["primary_image_url"] = value[0]
                        continue
                    if key == "primary_image_url":
                        if not lst.get("primary_image_url"):
                            lst["primary_image_url"] = value
                        continue
                    if not lst.get(key):
                        lst[key] = value

    # Save
    if dry_run:
        if output_listings is not None:
            output_listings.extend(all_listings)
        for lst in all_listings[:2]:
            print(json.dumps(lst, indent=2, default=str))
    elif supabase and all_listings:
        saved = _upsert_batch(supabase, all_listings)
        log.info(f"  Saved {saved}/{len(all_listings)}")

    return len(all_listings)


# ─── Database ─────────────────────────────────────────────────────────────────

def _fetch_existing_state(supabase: Any, source_ids: list[str]) -> dict[str, dict[str, Any]]:
    return fetch_existing_state(
        supabase,
        source_site=SOURCE_SITE,
        source_ids=source_ids,
        select_columns="source_id,first_seen_date,last_seen_date,listing_fingerprint,is_active",
    )


def _upsert_batch(
    supabase: Any,
    listings: list[dict[str, Any]],
    *,
    skip_unchanged_writes: bool = True,
) -> int:
    if not listings:
        return 0

    today_iso = date.today().isoformat()
    source_ids = [str(row.get("source_id")) for row in listings if row.get("source_id")]
    existing_map = _fetch_existing_state(supabase, source_ids)
    normalized_rows: list[dict[str, Any]] = []
    unchanged_source_ids: list[str] = []

    for raw in listings:
        parser_text = "\n".join(
            [
                str(raw.get("description") or ""),
                str(raw.get("description_full") or ""),
                str(raw.get("avionics_notes") or ""),
                str(raw.get("airframe_notes") or ""),
                str(raw.get("engine_notes") or ""),
                str(raw.get("maintenance_notes") or ""),
            ]
        ).strip()
        if parser_text:
            parsed = parse_description(parser_text)
            raw["description_intelligence"] = parsed
            parsed_times = parsed.get("times", {}) if isinstance(parsed, dict) else {}
            engine_smoh = parsed_times.get("engine_smoh")
            if raw.get("engine_time_since_overhaul") in (None, "", 0) and isinstance(engine_smoh, int):
                raw["engine_time_since_overhaul"] = engine_smoh
                raw["time_since_overhaul"] = engine_smoh
            total_time = parsed_times.get("total_time")
            if raw.get("total_time_airframe") in (None, "", 0) and isinstance(total_time, int):
                raw["total_time_airframe"] = total_time

        cleaned, warnings = validate_listing(raw)
        if warnings:
            log.warning("Skipping invalid listing %s: %s", raw.get("source_id"), "; ".join(warnings))
            continue

        cleaned["source_site"] = SOURCE_SITE
        cleaned["listing_source"] = SOURCE_SITE
        sid = str(cleaned.get("source_id") or "")
        if cleaned.get("source_listing_id") is None and sid:
            cleaned["source_listing_id"] = sid

        normalized_make = normalize_manufacturer(str(cleaned.get("make") or ""))
        if normalized_make:
            cleaned["make"] = normalized_make
        tier = get_manufacturer_tier(cleaned.get("make"))
        if tier is not None:
            cleaned["manufacturer_tier"] = tier

        if cleaned.get("price_asking") is None and cleaned.get("asking_price") is not None:
            cleaned["price_asking"] = cleaned["asking_price"]
        if cleaned.get("asking_price") is None and cleaned.get("price_asking") is not None:
            cleaned["asking_price"] = cleaned["price_asking"]

        existing = existing_map.get(sid)
        cleaned["first_seen_date"] = today_iso if not existing else existing.get("first_seen_date")
        cleaned["last_seen_date"] = today_iso
        cleaned["is_active"] = True
        cleaned["inactive_date"] = None
        cleaned["listing_fingerprint"] = compute_listing_fingerprint(
            {
                "source_site": SOURCE_SITE,
                "source_id": sid,
                "url": cleaned.get("url"),
                "price_asking": cleaned.get("price_asking"),
                "year": cleaned.get("year"),
                "make": cleaned.get("make"),
                "model": cleaned.get("model"),
                "n_number": cleaned.get("n_number"),
                "location_city": cleaned.get("location_city"),
                "location_state": cleaned.get("location_state"),
                "description": cleaned.get("description_full") or cleaned.get("description"),
            }
        )
        existing_fp = str(existing.get("listing_fingerprint") or "") if existing else ""
        current_fp = str(cleaned.get("listing_fingerprint") or "")
        existing_active = bool(existing.get("is_active")) if existing else False
        if (
            skip_unchanged_writes
            and existing
            and existing_fp
            and existing_fp == current_fp
            and existing_active
        ):
            unchanged_source_ids.append(sid)
            continue

        normalized_rows.append(cleaned)

    refreshed_unchanged = refresh_seen_for_unchanged(
        supabase,
        source_site=SOURCE_SITE,
        source_ids=unchanged_source_ids,
        today_iso=today_iso,
        logger=log,
    )
    if unchanged_source_ids:
        log.info(
            "[%s] Delta write-skip: unchanged=%s refreshed_seen=%s",
            SOURCE_SITE,
            len(unchanged_source_ids),
            refreshed_unchanged,
        )
    if not normalized_rows:
        return refreshed_unchanged

    all_keys: set[str] = set()
    for row in normalized_rows:
        all_keys.update(row.keys())
    for row in normalized_rows:
        for key in all_keys:
            row.setdefault(key, None)

    saved = safe_upsert_with_fallback(
        supabase=supabase,
        table="aircraft_listings",
        rows=normalized_rows,
        on_conflict="source_site,source_id",
        fallback_match_keys=["source_site", "source_id"],
        logger=log,
    )
    return saved + refreshed_unchanged


def _mark_inactive_listings(supabase: Any, inactive_after_missed_runs: int) -> int:
    return mark_inactive_listings(
        supabase,
        source_site=SOURCE_SITE,
        inactive_after_missed_runs=inactive_after_missed_runs,
        logger=log,
    )


def get_existing_ids(supabase: Any) -> set[str]:
    result = supabase.table("aircraft_listings").select("source_id").eq("source_site", SOURCE_SITE).execute()
    return {str(row.get("source_id")) for row in (result.data or []) if row.get("source_id")}


# ─── Orchestration ────────────────────────────────────────────────────────────

def run(args):
    log.info("=== AvBuyer Scraper starting ===")
    env_check(required=[] if args.dry_run else None)
    rl = RateLimiter()

    supabase     = None
    existing_ids: set[str] = set()

    if not args.dry_run:
        supabase = get_supabase()
        if args.resume:
            existing_ids = get_existing_ids(supabase)
            log.info(f"Resume: {len(existing_ids)} existing AvBuyer IDs")

    # Playwright only if --playwright or auto-triggered by block detection
    pw_browser = pw_context = pw_page_obj = None
    playwright_ctx = None
    playwright_manager = None

    if args.playwright:
        from playwright.sync_api import sync_playwright
        playwright_manager = sync_playwright()
        playwright_ctx = playwright_manager.__enter__()
        headless = args.headless.lower() not in ("false", "0", "no")
        pw_browser, pw_context = _create_playwright_browser(playwright_ctx, headless=headless)
        pw_page_obj = pw_context.new_page()
        global _playwright_fallback_active
        _playwright_fallback_active = True

    all_listings  = []
    grand_total   = 0

    try:
        # Filter categories
        cats = CATEGORIES
        if args.category:
            slug = args.category.replace("_", "-").replace(" ", "-")
            cats = [c for c in CATEGORIES if slug in c["path"]]
            log.info(f"Filtered to {len(cats)} category(ies) for '{args.category}'")

        for cat in cats:
            log.info(f"\n{'='*55}")
            log.info(f"Category: {cat['label']}  |  {cat['path']}")

            # Focused mode: skip make discovery and hit a direct model/URL target.
            if args.target_url:
                makes = [{
                    "name": args.model or "Manual Target",
                    "id": "",
                    "slug": _slugify(args.model or "manual-target"),
                    "url": args.target_url.strip(),
                }]
                log.info("  Using direct target URL mode")
            else:
                # Discover makes for this category
                makes = discover_makes_for_category(cat["path"], rl, pw_page_obj)
                if args.model:
                    log.info("  Applying model text filter '%s' to parsed cards", args.model)

            if not makes:
                if args.make:
                    make_slug = _slugify(args.make)
                    log.info("  No makes discovered; using direct make URL fallback for '%s'", args.make)
                    makes = [{
                        "name": args.make,
                        "id": "",
                        "slug": make_slug,
                        "url": f"{BASE_URL}{cat['path']}/{make_slug}?include_wo_price=Y",
                    }]
                else:
                    # No makes found — scrape category page directly (all makes)
                    log.info(f"  No makes found — scraping category page directly")
                    makes = [{"name": cat["label"], "id": "", "slug": "", "url": f"{BASE_URL}{cat['path']}?include_wo_price=Y"}]

            # Filter by --make arg
            if args.make:
                makes = [m for m in makes if args.make.lower() in m["name"].lower()]
                log.info(f"  Filtered to {len(makes)} make(s) matching '{args.make}'")
            if args.limit_makes and args.limit_makes > 0:
                makes = makes[: args.limit_makes]
                log.info("  Applying make limit: %s", len(makes))

            for make_info in makes:
                count = scrape_make(
                    make_info,
                    cat["type"],
                    rl,
                    fetch_details=not args.no_detail,
                    detail_stale_days=args.detail_stale_days,
                    max_pages=args.max_pages,
                    model_filter=args.model or "",
                    supabase=supabase,
                    dry_run=args.dry_run,
                    existing_ids=existing_ids,
                    output_listings=all_listings,
                    pw_page=pw_page_obj,
                )
                grand_total += count

                # Lazy-init Playwright if auto-triggered by block detection
                if _playwright_fallback_active and not pw_page_obj:
                    log.info("Auto-initializing Playwright due to block detection...")
                    from playwright.sync_api import sync_playwright
                    playwright_manager = sync_playwright()
                    playwright_ctx = playwright_manager.__enter__()
                    headless = args.headless.lower() not in ("false", "0", "no")
                    pw_browser, pw_context = _create_playwright_browser(playwright_ctx, headless=headless)
                    pw_page_obj = pw_context.new_page()

    finally:
        if pw_page_obj:
            pw_page_obj.close()
        if pw_context:
            pw_context.close()
        if pw_browser:
            pw_browser.close()
        if playwright_manager:
            playwright_manager.__exit__(None, None, None)

    if args.dry_run:
        out = Path(args.output or "avbuyer_dry_run.json")
        with out.open("w", encoding="utf-8") as f:
            json.dump(all_listings, f, indent=2, default=str)
        log.info(f"\nDry run: {len(all_listings)} listings written to {out}")
    else:
        marked_inactive = _mark_inactive_listings(supabase, args.inactive_after_missed_runs)
        log.info("Marked inactive stale listings: %s", marked_inactive)
        log.info(f"\n✓ Done. Grand total: {grand_total}")


def run_media_refresh_mode(args) -> None:
    log.info("=== AvBuyer media refresh mode ===")
    env_check(required=[] if args.dry_run else None)
    rl = RateLimiter()

    supabase = get_supabase()
    source_ids = load_source_ids_file(args.source_ids_file)
    rows = fetch_refresh_rows(
        supabase,
        source_site=SOURCE_SITE,
        source_ids=source_ids,
        limit=args.refresh_limit if args.refresh_limit > 0 else None,
    )
    if not rows:
        log.info("No AvBuyer listings matched the media refresh criteria.")
        return

    pw_browser = pw_context = pw_page_obj = None
    playwright_manager = None

    updated = 0
    improved = 0
    unchanged = 0
    failed = 0
    skipped_no_url = 0

    try:
        if args.playwright:
            from playwright.sync_api import sync_playwright

            playwright_manager = sync_playwright()
            playwright_ctx = playwright_manager.__enter__()
            headless = args.headless.lower() not in ("false", "0", "no")
            pw_browser, pw_context = _create_playwright_browser(playwright_ctx, headless=headless)
            pw_page_obj = pw_context.new_page()
            global _playwright_fallback_active
            _playwright_fallback_active = True

        for idx, row in enumerate(rows, start=1):
            source_id = str(row.get("source_id") or "").strip()
            detail_url = str(row.get("url") or "").strip()
            if not source_id or not detail_url:
                skipped_no_url += 1
                continue

            existing_count = gallery_count(row)
            detail_soup = fetch_html(detail_url, rl, pw_page_obj, label=f"refresh-{source_id}")
            if not detail_soup:
                failed += 1
                continue

            detail = parse_detail(
                detail_soup,
                detail_url=detail_url,
                pw_page=pw_page_obj,
                rl=rl,
                listing_id=source_id,
            )
            incoming_urls = detail.get("image_urls") if isinstance(detail.get("image_urls"), list) else []
            incoming_urls = [str(u).strip() for u in incoming_urls if str(u).strip()]
            if not incoming_urls and detail.get("primary_image_url"):
                incoming_urls = [str(detail.get("primary_image_url")).strip()]

            incoming_count = len(incoming_urls)
            if incoming_count <= existing_count:
                unchanged += 1
                continue

            improved += 1
            if not args.dry_run:
                apply_media_update(
                    supabase,
                    source_site=SOURCE_SITE,
                    source_id=source_id,
                    image_urls=incoming_urls,
                    primary_image_url=incoming_urls[0] if incoming_urls else None,
                )
                updated += 1

            if idx % 25 == 0:
                log.info(
                    "Media refresh progress: %s/%s processed | improved=%s updated=%s unchanged=%s failed=%s",
                    idx,
                    len(rows),
                    improved,
                    updated,
                    unchanged,
                    failed,
                )
    finally:
        if pw_page_obj:
            pw_page_obj.close()
        if pw_context:
            pw_context.close()
        if pw_browser:
            pw_browser.close()
        if playwright_manager:
            playwright_manager.__exit__(None, None, None)

    log.info(
        "AvBuyer media refresh done: scanned=%s improved=%s updated=%s unchanged=%s failed=%s skipped_no_url=%s",
        len(rows),
        improved,
        updated,
        unchanged,
        failed,
        skipped_no_url,
    )


# ─── CLI ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="AvBuyer scraper aligned to Full Hangar conventions")
    parser.add_argument("--category",   help="Category filter: jets, turboprops, single-piston, twin-piston, helicopter")
    parser.add_argument("--make",       help="Make filter (e.g. Cessna)")
    parser.add_argument("--model",      help="Focused model target (requires --category), e.g. 'Piper Seneca V'")
    parser.add_argument("--target-url", help="Manual listing URL target (requires --category)")
    parser.add_argument("--dry-run",    action="store_true")
    parser.add_argument("--no-detail",  action="store_true", help="Skip detail pages")
    parser.add_argument("--resume",     action="store_true", help="Skip IDs already in DB")
    parser.add_argument("--playwright", action="store_true", help="Force Playwright (default: plain requests)")
    parser.add_argument("--headless",   default="true")
    parser.add_argument("--verbose",    action="store_true")
    parser.add_argument("--output",     default="", help="Output JSON file for dry-run mode")
    parser.add_argument("--media-refresh-only", action="store_true", help="Refresh images only for existing AvBuyer listings.")
    parser.add_argument("--source-ids-file", default="", help="Optional file of source_id values (one per line) for targeted media refresh.")
    parser.add_argument("--refresh-limit", type=int, default=0, help="Limit number of AvBuyer rows in media refresh mode.")
    parser.add_argument("--limit-makes", type=int, default=0, help="Max makes per category for smoke tests")
    parser.add_argument("--max-pages", type=int, default=0, help="Max pages per make for smoke tests")
    parser.add_argument(
        "--detail-stale-days",
        type=int,
        default=2,
        help="Skip detail fetch for listings seen within N days (default: 2).",
    )
    parser.add_argument(
        "--inactive-after-missed-runs",
        type=int,
        default=3,
        help="Mark listings inactive only after missing for N runs/days (default: 3).",
    )
    args = parser.parse_args()
    if args.model and not args.category:
        parser.error("--model requires --category so aircraft_type can be assigned correctly.")
    if args.target_url and not args.category:
        parser.error("--target-url requires --category so aircraft_type can be assigned correctly.")

    global log
    log = setup_logging(args.verbose)
    if args.media_refresh_only:
        run_media_refresh_mode(args)
        return
    run(args)


if __name__ == "__main__":
    main()
