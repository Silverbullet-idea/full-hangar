"""
ASO.com (Aircraft Shopper Online) Scraper
==========================================

Architecture:
    Tier 1 – Category index pages  → discover model group URLs
    Tier 2 – Model group listing pages → parse cards (with ASP.NET postback pagination)
    Tier 3 – Detail pages (optional) → full specs, engine/prop times, description

No bot protection on ASO.com — plain requests + BeautifulSoup is sufficient.
Session cookies (ASPXANONYMOUS, asoSessionID) are handled automatically by
requests.Session.

Usage:
    python aso_scraper.py                          # scrape all categories
    python aso_scraper.py --category single_engine # one category
    python aso_scraper.py --dry-run                # print results, no DB write
    python aso_scraper.py --limit 5                # max 5 model groups (testing)
    python aso_scraper.py --no-detail              # skip detail page fetches
    python aso_scraper.py --resume                 # skip source_ids already in DB
"""

from __future__ import annotations

import os
import re
import time
import json
import random
import logging
import argparse
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urljoin, urlencode, urlparse, parse_qs

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

# ─── Logging ─────────────────────────────────────────────────────────────────

def setup_logging(verbose: bool = False) -> logging.Logger:
    level = logging.DEBUG if verbose else logging.INFO
    fmt   = "%(asctime)s [%(levelname)s] %(message)s"
    root  = logging.getLogger()
    root.setLevel(level)
    for h in root.handlers[:]:
        root.removeHandler(h)
    sh = logging.StreamHandler()
    sh.setLevel(level)
    sh.setFormatter(logging.Formatter(fmt))
    fh = logging.FileHandler("aso_scraper.log", encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(logging.Formatter(fmt))
    root.addHandler(sh)
    root.addHandler(fh)
    return logging.getLogger(__name__)

log = logging.getLogger(__name__)


# ─── Constants ────────────────────────────────────────────────────────────────

BASE_URL = "https://www.aso.com"

# Category index pages → discovers all model group URLs
CATEGORIES = {
    "single_engine": {
        "url": "https://www.aso.com/listings/AircraftListings.aspx?ac_id=1&act_id=1",
        "aircraft_type": "single_engine_piston",
    },
    "multi_engine": {
        "url": "https://www.aso.com/listings/AircraftListings.aspx?ac_id=2&act_id=1",
        "aircraft_type": "multi_engine_piston",
    },
    "turboprop": {
        "url": "https://www.aso.com/listings/AircraftListings.aspx?ac_id=3&act_id=1",
        "aircraft_type": "turboprop",
    },
    "jet": {
        "url": "https://www.aso.com/listings/AircraftListings.aspx?ac_id=4&act_id=1",
        "aircraft_type": "jet",
    },
    "helicopter": {
        "url": "https://www.aso.com/listings/AircraftListings.aspx?ac_id=5&act_id=1",
        "aircraft_type": "helicopter",
    },
}

US_STATE_NAME_TO_CODE = {
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
    "wisconsin": "WI", "wyoming": "WY",
}

CA_PROVINCE_NAME_TO_CODE = {
    "alberta": "AB", "british columbia": "BC", "manitoba": "MB", "new brunswick": "NB",
    "newfoundland and labrador": "NL", "nova scotia": "NS", "ontario": "ON",
    "prince edward island": "PE", "quebec": "QC", "saskatchewan": "SK",
}

# Legacy ASP.NET pager control IDs (kept as fallbacks).
PAGER_NEXT_TARGET_LEGACY = "ctl00$ContentPlaceHolder1$SearchResultsPhotoGrid$DataPagerTop$ctl100$btnNext"
PAGER_TXTPAGE_TARGET_LEGACY = "ctl00$ContentPlaceHolder1$SearchResultsPhotoGrid$DataPagerTop$ctl100$txtPageNo"
LISTINGS_URL        = "https://www.aso.com/listings/AircraftListings.aspx"
DETAIL_URL_TEMPLATE = "https://www.aso.com/listings/spec/ViewAd.aspx?id={listing_id}&listingType=true"

REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Referer": BASE_URL,
}

# Retry/rate config
MAX_RETRIES   = 4
BASE_DELAY    = 3.0
MAX_DELAY     = 60.0
MIN_DELAY     = 2.5    # minimum seconds between requests


# ─── Supabase ────────────────────────────────────────────────────────────────

def get_supabase():
    from supabase import create_client
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise EnvironmentError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env")
    return create_client(url, key)


# ─── HTTP helpers ─────────────────────────────────────────────────────────────

def _backoff(attempt: int) -> float:
    delay = BASE_DELAY * (2 ** attempt)
    jitter = random.uniform(0, delay * 0.25)
    return min(delay + jitter, MAX_DELAY)


def fetch_get(session: requests.Session, url: str, params: dict = None) -> Optional[BeautifulSoup]:
    """GET with retry + exponential backoff."""
    for attempt in range(MAX_RETRIES):
        try:
            time.sleep(MIN_DELAY + random.uniform(0, 1.0))
            resp = session.get(url, params=params, headers=REQUEST_HEADERS, timeout=20)
            if resp.status_code == 200:
                return BeautifulSoup(resp.text, "html.parser")
            if resp.status_code == 429:
                wait = _backoff(attempt)
                log.warning(f"Rate limited (429). Waiting {wait:.1f}s — {url}")
                time.sleep(wait)
                continue
            log.warning(f"HTTP {resp.status_code} on attempt {attempt+1} — {url}")
        except requests.RequestException as e:
            wait = _backoff(attempt)
            log.warning(f"Request error ({e}), retry in {wait:.1f}s")
            time.sleep(wait)
    log.error(f"All retries failed: {url}")
    return None


def fetch_post(session: requests.Session, url: str, data: dict) -> Optional[BeautifulSoup]:
    """POST (ASP.NET postback) with retry."""
    headers = {**REQUEST_HEADERS, "Content-Type": "application/x-www-form-urlencoded"}
    for attempt in range(MAX_RETRIES):
        try:
            time.sleep(MIN_DELAY + random.uniform(0, 1.0))
            resp = session.post(url, data=data, headers=headers, timeout=20)
            if resp.status_code == 200:
                return BeautifulSoup(resp.text, "html.parser")
            log.warning(f"POST HTTP {resp.status_code} on attempt {attempt+1}")
        except requests.RequestException as e:
            wait = _backoff(attempt)
            log.warning(f"POST error ({e}), retry in {wait:.1f}s")
            time.sleep(wait)
    return None


def extract_viewstate(soup: BeautifulSoup) -> dict:
    """Extract ASP.NET hidden form fields needed for postback."""
    fields = {}
    for field_id in ("__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION",
                     "__SCROLLPOSITIONX", "__SCROLLPOSITIONY"):
        tag = soup.find("input", {"id": field_id})
        if tag:
            fields[field_id] = tag.get("value", "")
    return fields


# ─── Tier 1: Category → Model Group URLs ────────────────────────────────────

def scrape_model_groups(session: requests.Session, category_url: str) -> list[dict]:
    """
    Parse the category index page to get model group listing URLs.
    Returns list of {"name": str, "url": str, "count": int}
    """
    soup = fetch_get(session, category_url)
    if not soup:
        return []

    groups = []
    # Model group links appear as anchors within the make/model left nav
    # or as grouped listing links. Pattern: href contains mg_id= or m_id=
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "mg_id=" in href or (("m_id=" in href) and "act_id=" in href):
            full_url = urljoin(BASE_URL, href) if not href.startswith("http") else href
            # Extract count from link text if present, e.g. "Cessna 172 (25)"
            text = a.get_text(strip=True)
            count_match = re.search(r'\((\d+)\)', text)
            count = int(count_match.group(1)) if count_match else 0
            name = re.sub(r'\s*\(\d+\)\s*$', '', text).strip()
            if name and full_url not in [g["url"] for g in groups]:
                groups.append({"name": name, "url": full_url, "count": count})

    if not groups:
        # ASO recently shifted away from mg_id/m_id model-group links on some category pages.
        # Fallback to scraping the category results page directly plus special listing feeds.
        count = get_results_count(soup) or 0
        log.info(
            "Model-group links not found at %s; falling back to direct category-page scraping.",
            category_url,
        )
        fallback_groups = [{"name": "category_page", "url": category_url, "count": count}]
        for extra_url in _discover_special_listing_urls_from_soup(soup):
            if extra_url == category_url:
                continue
            extra_count = 0
            extra_soup = fetch_get(session, extra_url)
            if extra_soup:
                extra_count = get_results_count(extra_soup) or 0
            fallback_groups.append(
                {
                    "name": f"special_feed:{urlparse(extra_url).query}",
                    "url": extra_url,
                    "count": extra_count,
                }
            )
        return fallback_groups

    log.info(f"Found {len(groups)} model groups at {category_url}")
    return groups


def _discover_special_listing_urls_from_soup(soup: BeautifulSoup) -> list[str]:
    """
    Discover ASO listing feeds linked from results pages that are not ac_id category URLs.
    Examples seen in production: ?pl=true, ?ll=true, ?rva=true
    """
    discovered: list[str] = []
    seen: set[str] = set()
    for anchor in soup.find_all("a", href=True):
        href = (anchor.get("href") or "").strip()
        if not href:
            continue
        full_url = urljoin(BASE_URL, href) if not href.startswith("http") else href
        parsed = urlparse(full_url)
        if "AircraftListings.aspx" not in (parsed.path or ""):
            continue
        query = parse_qs(parsed.query or "", keep_blank_values=True)
        if not query:
            continue
        if "ac_id" in query:
            continue
        if not any(str(values[0]).lower() == "true" for values in query.values() if values):
            continue
        if full_url in seen:
            continue
        seen.add(full_url)
        discovered.append(full_url)
    return discovered


# ─── Tier 2: Parse listing cards ─────────────────────────────────────────────

def parse_other_info(spans) -> dict:
    """
    Parse multiple span.photoListingsOtherInfo elements.
    Each span text has format: " Label: Value "
    Returns dict with keys: reg_number, serial_number, ttaf, location, seller
    """
    result = {}
    for span in spans:
        raw = span.get_text(separator=" ", strip=True)
        # Normalize whitespace
        raw = re.sub(r'\s+', ' ', raw).strip()

        if raw.startswith("Reg#:") or raw.startswith("Reg#"):
            result["reg_number"] = raw.split(":", 1)[-1].strip() if ":" in raw else raw[4:].strip()
        elif raw.startswith("S/N:"):
            result["serial_number"] = raw[4:].strip()
        elif raw.startswith("TTAF:"):
            val = raw[5:].strip().replace(",", "")
            result["ttaf_raw"] = val
            try:
                result["total_time_airframe"] = int(float(val))
            except (ValueError, TypeError):
                pass
        elif raw.startswith("Loc:"):
            result["location_raw"] = raw[4:].strip()
        else:
            # Catch-all for seller name line (no prefix)
            if raw and "seller" not in result:
                result["seller_name"] = raw

    return result


def parse_listing_card(card_td, aircraft_type: str) -> Optional[dict]:
    """
    Parse a single listing card <td class="searchResultsGrid" style="width: 360px">
    Returns structured dict or None.
    """
    # Title link → adv_id + title text
    title_links = card_td.find_all("a", class_="photoListingsDescription")
    if not title_links:
        return None
    title_link = next((a for a in title_links if a.get_text(strip=True)), title_links[0])

    adv_id = title_link.get("adv_id", "").strip()
    if not adv_id:
        # Fallback: parse from href
        href = title_link.get("href", "")
        id_match = re.search(r'[?&]id=(\d+)', href, re.I)
        adv_id = id_match.group(1) if id_match else ""
    if not adv_id:
        return None

    title = title_link.get_text(strip=True) or title_link.get("title", "").strip()

    # Price
    price_span = card_td.find("span", class_="photoListingsPrice")
    price_text = price_span.get_text(strip=True) if price_span else ""
    asking_price = _parse_price(price_text)

    # Other info spans (Reg#, S/N, TTAF, Seller)
    other_spans = card_td.find_all("span", class_="photoListingsOtherInfo")
    other = parse_other_info(other_spans)

    # Photo URL
    img = card_td.find("img")
    photo_url = None
    if img:
        src = img.get("src", "")
        if src:
            photo_url = urljoin(BASE_URL, src) if not src.startswith("http") else src

    # Parse year/make/model from title e.g. "2008 Cessna U206H Stationair"
    year, make, model = _parse_title(title)

    # Location can be plain text or a country/state title on the flag wrapper.
    location_raw = other.get("location_raw", "")
    if not location_raw:
        for tag in card_td.find_all(True):
            title_attr = (tag.get("title") or "").strip()
            if title_attr and title_attr.lower() not in {"aerobatic", "new listing"}:
                parent_text = (tag.parent.get_text(" ", strip=True) if tag.parent else "").lower()
                if "loc" in parent_text:
                    location_raw = title_attr
                    break

    # Location → state code
    state = _extract_state(location_raw)
    seller_name = other.get("seller_name")
    seller_type = _classify_seller_type(seller_name or "")

    return {
        "source": "aso",
        "source_site": "aso",
        "listing_source": "aso",
        "source_id": f"aso_{adv_id}",
        "source_listing_id": f"aso_{adv_id}",
        "source_url": DETAIL_URL_TEMPLATE.format(listing_id=adv_id),
        "url": DETAIL_URL_TEMPLATE.format(listing_id=adv_id),
        "aso_adv_id": adv_id,
        "title": title,
        "year": year,
        "make": make,
        "model": model,
        "aircraft_type": aircraft_type,
        "asking_price": asking_price,
        "price_text": price_text,
        "n_number": other.get("reg_number"),
        "serial_number": other.get("serial_number"),
        "total_time_airframe": other.get("total_time_airframe"),
        "ttaf_raw": other.get("ttaf_raw"),
        "location_raw": location_raw,
        "state": state,
        "seller_name": seller_name,
        "seller_type": seller_type,
        "primary_image_url": photo_url,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        # Detail page fields (populated later)
        "description": None,
        "time_since_overhaul": None,
        "time_since_prop_overhaul": None,
        "condition": "used",
    }


def _parse_price(text: str) -> Optional[int]:
    if not text:
        return None
    if re.search(r'inquire|call|tbd|n/a', text, re.I):
        return None
    digits = re.sub(r'[^\d]', '', text)
    return int(digits) if digits else None


def _parse_int(value: str) -> Optional[int]:
    digits = re.sub(r"[^\d]", "", value or "")
    if not digits:
        return None
    try:
        return int(digits)
    except ValueError:
        return None


def _parse_title(title: str) -> tuple[Optional[int], Optional[str], Optional[str]]:
    """Extract year, make, model from title string."""
    year = None
    make = None
    model = None
    m = re.match(r'^(\d{4})\s+(.+)$', title.strip())
    if m:
        year = int(m.group(1))
        rest = m.group(2).strip()
        parts = rest.split(None, 1)
        make = parts[0] if parts else None
        model = parts[1] if len(parts) > 1 else None
    return year, make, model


def _extract_state(location: str) -> Optional[str]:
    """Extract normalized state/province code from location text."""
    if not location:
        return None
    raw = re.sub(r"\s+", " ", location).strip()
    upper = raw.upper()

    # Common "City, ST" / "ST, Country" patterns.
    code_match = re.search(r"(?:,\s*|\b)([A-Z]{2})(?:\b|[,/])", upper)
    if code_match:
        code = code_match.group(1)
        if code in set(US_STATE_NAME_TO_CODE.values()) | set(CA_PROVINCE_NAME_TO_CODE.values()):
            return code

    lowered = raw.lower()
    for name, code in US_STATE_NAME_TO_CODE.items():
        if name in lowered:
            return code
    for name, code in CA_PROVINCE_NAME_TO_CODE.items():
        if name in lowered:
            return code
    return None


def _classify_seller_type(text: str) -> Optional[str]:
    """Infer seller type from seller/dealer wording."""
    if not text:
        return None
    lowered = text.lower()
    if any(token in lowered for token in ("dealer", "broker", "aviation", "aircraft sales", "llc", "inc", "ltd", "pty", "corp")):
        return "dealer"
    if any(token in lowered for token in ("private", "owner", "individual")):
        return "private"
    return None


def _infer_aircraft_type_from_listing(listing: dict, default_type: Optional[str] = None) -> str:
    """
    Infer aircraft type from listing-level evidence.
    Priority:
      1) Strong type keywords (jet / helicopter / turboprop)
      2) Engine-count + twin/multi wording for piston multi-engine
      3) Single-engine wording for piston singles
      4) Source category fallback
    """
    engine_count = listing.get("engine_count")
    try:
        engine_count_int = int(engine_count) if engine_count is not None else None
    except (TypeError, ValueError):
        engine_count_int = None

    text_blob = " ".join(
        str(listing.get(key) or "")
        for key in ("title", "make", "model", "description")
    ).lower()
    text_blob = re.sub(r"\s+", " ", text_blob).strip()

    jet_keywords = (
        " jet ", " citation", " learjet", " gulfstream", " falcon", " challenger",
        " embraer", " bombardier", " hawker", " phenom", " hondajet", " eclipse",
    )
    helicopter_keywords = (
        " helicopter", " rotorcraft", " robinson", " bell ", " eurocopter",
        " sikorsky", " airbus helicopter", " agusta", " r22", " r44", " r66",
    )
    turboprop_keywords = (
        " turboprop", " pt6", " tpe331", " king air", " caravan", " kodiak",
        " pc-12", " pc12", " tbm", " meridian", " m500", " m600", " jetprop",
    )
    multi_engine_keywords = (
        " twin ", " multi-engine", " multi engine", " twin-engine", " twin engine",
        " seneca", " baron", " aztec", " seminole", " duchess", " travel air",
        " twin comanche", " apache", " navaho",
    )
    single_engine_keywords = (
        " single-engine", " single engine",
    )

    if any(token in text_blob for token in jet_keywords):
        return "jet"
    if any(token in text_blob for token in helicopter_keywords):
        return "helicopter"
    if any(token in text_blob for token in turboprop_keywords):
        return "turboprop"

    # Requirements for piston grouping during new scrapes:
    # - Multi-engine when explicit multi/twin wording exists, or >=2 engines captured.
    # - Single-engine when explicit single wording exists, or exactly 1 engine captured.
    if engine_count_int is not None:
        if engine_count_int >= 2:
            return "multi_engine_piston"
        if engine_count_int == 1:
            return "single_engine_piston"
    multi_engine_model_match = re.search(r"\b(310|337|340|402|414|421)\b", text_blob)
    if any(token in text_blob for token in multi_engine_keywords) or bool(multi_engine_model_match):
        return "multi_engine_piston"
    if any(token in text_blob for token in single_engine_keywords):
        return "single_engine_piston"

    if default_type:
        return default_type
    return "single_engine_piston"


# ─── Tier 2: Paginate model group listings ───────────────────────────────────

def scrape_model_group_listings(
    session: requests.Session,
    group_url: str,
    aircraft_type: str,
    max_pages: int = 50,
) -> list[dict]:
    """
    Scrape all listing cards from a model group URL, handling ASP.NET pagination.
    Returns list of parsed listing dicts.
    """
    all_listings = []
    page_num = 1

    # First page — GET
    soup = fetch_get(session, group_url)
    if not soup:
        return []

    while soup and page_num <= max_pages:
        cards = _parse_cards_from_soup(soup, aircraft_type)
        log.debug(f"  Page {page_num}: {len(cards)} cards")
        all_listings.extend(cards)

        # Check for next page
        next_soup = _goto_next_page(session, soup, group_url, page_num)
        if not next_soup:
            break
        soup = next_soup
        page_num += 1

    return all_listings


def _parse_cards_from_soup(soup: BeautifulSoup, aircraft_type: str) -> list[dict]:
    """Extract all listing cards from a results page."""
    listings = []
    # Cards are <td class="searchResultsGrid" style="width: 360px">
    # The outer container is table.searchResultsGrid
    results_table = soup.find("table", class_="searchResultsGrid")
    if not results_table:
        return listings

    for td in results_table.find_all("td", class_="searchResultsGrid", style=lambda s: s and "360px" in s):
        listing = parse_listing_card(td, aircraft_type)
        if listing:
            listings.append(listing)

    return listings


def _resolve_pager_targets(soup: BeautifulSoup) -> tuple[str, str]:
    """
    Resolve active DataPager postback targets from current HTML.
    ASO has changed control IDs in the past (e.g., ctl100 -> ctl00), so
    this discovers the live names first and falls back to legacy constants.
    """
    txt_target = None
    next_target = None

    pager_inputs = []
    for inp in soup.find_all("input"):
        name = (inp.get("name") or "").strip()
        if "DataPager" in name:
            pager_inputs.append(name)

    # Prefer top pager controls when present.
    top_inputs = [name for name in pager_inputs if "DataPagerTop" in name]
    search_space = top_inputs if top_inputs else pager_inputs

    for name in search_space:
        if name.endswith("$txtPageNo"):
            txt_target = name
            break
    for name in search_space:
        if name.endswith("$btnNext"):
            next_target = name
            break

    if not txt_target:
        txt_target = PAGER_TXTPAGE_TARGET_LEGACY
    if not next_target:
        next_target = PAGER_NEXT_TARGET_LEGACY

    return txt_target, next_target


def _extract_pager_position(soup: BeautifulSoup) -> tuple[Optional[int], Optional[int]]:
    """
    Return (current_page, total_pages) if detectable.
    Handles both classic "Page X of Y" text and ASO's current pager markup where
    only "Showing X to Y" + total-result heading are visible text.
    """
    pager_text = ""
    pager_div = soup.find("div", class_=re.compile(r"manageMyAdsGridPager", re.I))
    if pager_div:
        pager_text = pager_div.get_text(" ", strip=True)
    else:
        heading = soup.find("span", {"class": "asoAcSearchHeading"})
        if heading:
            pager_text = heading.get_text(" ", strip=True)

    # Current ASO rendering often keeps page number in txtPageNo input value.
    page_input = soup.find("input", {"id": re.compile(r"DataPager(?:Top|Bottom).*txtPageNo", re.I)})
    current_page = None
    if page_input:
        try:
            current_page = int((page_input.get("value") or "").strip())
        except ValueError:
            current_page = None

    page_match = re.search(r"Page\s+(\d+)\s+of\s+(\d+)", pager_text, re.I)
    if page_match:
        return int(page_match.group(1)), int(page_match.group(2))

    # ASO often renders this as "Page of [glyph] 4" with current page only in txtPageNo.
    # Capture the trailing total-page number and pair it with txtPageNo value.
    page_of_match = re.search(r"Page\s*of\s*[^0-9]*(\d+)", pager_text, re.I)
    if page_of_match:
        total_pages = int(page_of_match.group(1))
        return current_page, total_pages

    return current_page, None


def _goto_next_page(
    session: requests.Session,
    soup: BeautifulSoup,
    original_url: str,
    current_page: int,
) -> Optional[BeautifulSoup]:
    """
    Navigate to the next page via ASP.NET postback.
    Returns BeautifulSoup of next page, or None if no more pages.
    """
    # Check if there's a DataPager next button.
    next_btn = soup.find("input", {"id": re.compile(r"btnNext", re.I)})
    if not next_btn:
        next_btn = soup.find("a", id=re.compile(r"btnNext", re.I))
    if not next_btn:
        return None

    current, total = _extract_pager_position(soup)
    if total is None:
        log.debug("    Pager total pages unavailable; stopping pagination to avoid duplicates.")
        return None
    if current is None:
        current = current_page
    log.debug(f"    Pager: Page {current} of {total}")
    if current >= total:
        return None

    # Build ASP.NET postback data
    viewstate = extract_viewstate(soup)
    if not viewstate.get("__VIEWSTATE"):
        log.warning("No ViewState found — cannot paginate")
        return None

    next_page_num = current + 1
    txt_page_target, next_target = _resolve_pager_targets(soup)
    post_data = {
        **viewstate,
        "__EVENTTARGET": txt_page_target,
        "__EVENTARGUMENT": "",
        txt_page_target: str(next_page_num),
    }

    log.debug(f"    POSTing to page {next_page_num}")
    result = fetch_post(session, original_url, post_data)

    # If postback fails, try btnNext button as event target
    if not result:
        post_data2 = {
            **viewstate,
            "__EVENTTARGET": next_target,
            "__EVENTARGUMENT": "",
        }
        result = fetch_post(session, original_url, post_data2)

    return result


# ─── Tier 3: Detail page ─────────────────────────────────────────────────────

def scrape_detail_page(session: requests.Session, adv_id: str) -> dict:
    """
    Fetch and parse the detail page for a listing.
    Returns dict of additional fields to merge into the listing.
    """
    url = DETAIL_URL_TEMPLATE.format(listing_id=adv_id)
    soup = fetch_get(session, url)
    if not soup:
        return {}

    extra = {}

    # Description
    desc_td = soup.find("td", class_=lambda c: c and "diy-section-content-table-td" in c)
    if desc_td:
        extra["description"] = desc_td.get_text(separator="\n", strip=True)[:4000]

    # Detail-page location fallback (helps when card only shows flag icon).
    page_text = soup.get_text(" | ", strip=True)
    loc_match = re.search(r"Location:\s*([^|]{2,120})", page_text, re.I)
    if loc_match:
        location_raw = re.sub(r"\s+", " ", loc_match.group(1)).strip(" -|,")
        if location_raw:
            extra["location_raw"] = location_raw
            state = _extract_state(location_raw)
            if state:
                extra["state"] = state

    # Engine/prop tables: table.enginePropView
    engine_tables = soup.find_all("table", class_="enginePropView")
    engines: list[dict[str, object]] = []
    props: list[dict[str, object]] = []
    for tbl in engine_tables:
        section_heading = ""
        section_header = tbl.find_previous("div", class_=re.compile(r"adSpecView-image-prop", re.I))
        if section_header:
            section_heading = section_header.get_text(" ", strip=True).lower()

        rows = tbl.find_all("tr")
        if not rows:
            continue

        header_cells = [td.get_text(" ", strip=True).lower() for td in rows[0].find_all("td")]
        metric_col_idx = None
        metric_label = ""
        for idx, header in enumerate(header_cells):
            normalized = header.replace(" ", "")
            if "tso" in normalized:
                metric_col_idx = idx
                metric_label = "TSO"
                break
            if "tsn" in normalized:
                metric_col_idx = idx
                metric_label = "TSN"
                break
            if "spoh" in normalized or "propsinceoverhaul" in normalized:
                metric_col_idx = idx
                metric_label = "SPOH"
                break
        if metric_col_idx is None:
            continue

        for row in rows[1:]:
            cells = [td.get_text(" ", strip=True) for td in row.find_all("td")]
            if not cells or metric_col_idx >= len(cells):
                continue
            position = cells[0] if cells else ""
            metric_raw = cells[metric_col_idx]
            metric_hours = _parse_int(metric_raw)
            record = {
                "position": position,
                "metric_type": metric_label,
                "metric_raw": metric_raw,
                "metric_hours": metric_hours,
            }
            if "prop" in section_heading or metric_label == "SPOH":
                props.append(record)
            else:
                engines.append(record)
    if engines:
        extra["engines_raw"] = engines
        extra["engine_count"] = len(engines)
        first_engine_hours = next(
            (int(row["metric_hours"]) for row in engines if isinstance(row.get("metric_hours"), int)),
            None,
        )
        if first_engine_hours is not None:
            extra["engine_tsn"] = first_engine_hours
            # ASO provides either TSO or TSN; map either into canonical overhaul field.
            extra["time_since_overhaul"] = first_engine_hours
        second_engine_hours = next(
            (
                int(row["metric_hours"])
                for idx, row in enumerate(engines)
                if idx >= 1 and isinstance(row.get("metric_hours"), int)
            ),
            None,
        )
        if second_engine_hours is not None:
            extra["second_engine_time_since_overhaul"] = second_engine_hours
    if props:
        extra["props_raw"] = props
        first_prop_hours = next(
            (int(row["metric_hours"]) for row in props if isinstance(row.get("metric_hours"), int)),
            None,
        )
        if first_prop_hours is not None:
            extra["time_since_prop_overhaul"] = first_prop_hours
        second_prop_hours = next(
            (
                int(row["metric_hours"])
                for idx, row in enumerate(props)
                if idx >= 1 and isinstance(row.get("metric_hours"), int)
            ),
            None,
        )
        if second_prop_hours is not None:
            extra["second_time_since_prop_overhaul"] = second_prop_hours

    # Time since overhaul — often in description text
    if extra.get("description") and extra.get("time_since_overhaul") is None:
        tso_match = re.search(
            r'(?:SMOH|TSMOH|TSO|TSN|SOH|since\s+OH)\s*[:\-]?\s*([\d,]+)',
            extra["description"], re.I
        )
        if tso_match:
            try:
                extra["time_since_overhaul"] = int(tso_match.group(1).replace(",", ""))
            except ValueError:
                pass

    # Seller/contact info
    contact_table = soup.find("table", class_="adSpecView-contacts-section-outerTable")
    if contact_table:
        contact_text = contact_table.get_text(separator=" ", strip=True)
        # Try to extract phone
        phone_match = re.search(r'(\d{3}[-.\s]\d{3}[-.\s]\d{4})', contact_text)
        if phone_match:
            extra["seller_phone"] = phone_match.group(1)

    return extra


# ─── Results count ───────────────────────────────────────────────────────────

def get_results_count(soup: BeautifulSoup) -> Optional[int]:
    """Extract total result count from 'X Aircraft Meet Your Criteria'."""
    heading = soup.find("span", class_="asoAcSearchHeading")
    if heading:
        m = re.search(r'(\d[\d,]*)\s+Aircraft', heading.get_text())
        if m:
            return int(m.group(1).replace(",", ""))
    return None


# ─── Supabase upsert ─────────────────────────────────────────────────────────

UPSERT_FIELDS = [
    "source", "source_site", "listing_source", "source_id", "source_listing_id", "source_url", "url", "title", "year", "make", "model",
    "aircraft_type", "asking_price", "price_text", "n_number", "serial_number",
    "total_time_airframe", "engine_count", "time_since_overhaul", "time_since_prop_overhaul",
    "second_engine_time_since_overhaul", "second_time_since_prop_overhaul",
    "location_raw", "state", "seller_name", "seller_type", "primary_image_url",
    "description", "engines_raw", "props_raw", "engine_tsn", "seller_phone",
    "condition", "scraped_at",
]

def upsert_listing(supabase, listing: dict) -> bool:
    """Upsert a single listing into aircraft_listings table."""
    row = {k: listing.get(k) for k in UPSERT_FIELDS if k in listing or listing.get(k) is not None}
    conflict_keys = ["source_id", "source_site,source_id", "source_site,source_listing_id"]
    conflict_idx = 0
    # Some environments have a narrower aircraft_listings schema; remove unknown columns
    # and adapt to available unique constraints.
    while True:
        try:
            supabase.table("aircraft_listings") \
                .upsert(row, on_conflict=conflict_keys[conflict_idx]) \
                .execute()
            return True
        except Exception as e:
            msg = str(e)
            missing_col_match = re.search(r"Could not find the '([^']+)' column", msg)
            if missing_col_match:
                missing_col = missing_col_match.group(1)
                if missing_col in row:
                    row.pop(missing_col, None)
                    log.warning(
                        "Upsert schema mismatch for %s: dropping column '%s' and retrying.",
                        listing.get("source_id"),
                        missing_col,
                    )
                    if not row:
                        log.error("Upsert aborted for %s: no remaining columns after schema filtering.", listing.get("source_id"))
                        return False
                    continue

            if "no unique or exclusion constraint matching the ON CONFLICT specification" in msg:
                if conflict_idx < len(conflict_keys) - 1:
                    conflict_idx += 1
                    log.warning(
                        "Upsert conflict key unsupported for %s, retrying with on_conflict='%s'.",
                        listing.get("source_id"),
                        conflict_keys[conflict_idx],
                    )
                    continue

            log.error(f"Upsert failed for {listing.get('source_id')}: {e}")
            return False


def get_existing_source_ids(supabase) -> set[str]:
    """Fetch all ASO source_ids already in the database."""
    result = supabase.table("aircraft_listings") \
        .select("source_id") \
        .like("source_id", "aso_%") \
        .execute()
    return {row["source_id"] for row in result.data}


# ─── Main orchestration ───────────────────────────────────────────────────────

def run(args):
    log.info("=== ASO Scraper starting ===")

    session = requests.Session()
    # Warm up session (get cookies)
    try:
        session.get(BASE_URL, headers=REQUEST_HEADERS, timeout=10)
    except Exception as e:
        log.warning(f"Warm-up request failed: {e}")

    supabase = None
    existing_ids: set[str] = set()

    if not args.dry_run:
        supabase = get_supabase()
        if args.resume:
            existing_ids = get_existing_source_ids(supabase)
            log.info(f"Resume mode: {len(existing_ids)} existing ASO listings in DB")

    # Determine which categories to scrape
    if args.category:
        cats = {args.category: CATEGORIES[args.category]}
    else:
        cats = CATEGORIES

    all_results = []
    total_saved = 0
    total_skipped = 0
    seen_source_ids_in_run: set[str] = set()
    skip_remaining_categories = False

    for cat_name, cat_info in cats.items():
        if skip_remaining_categories:
            log.info(
                "Skipping remaining categories after duplicate-only fallback pages were detected."
            )
            break

        log.info(f"\n── Category: {cat_name} ──")
        groups = scrape_model_groups(session, cat_info["url"])

        if args.limit:
            groups = groups[:args.limit]
            log.info(f"  Limiting to {args.limit} model groups")

        for i, group in enumerate(groups, 1):
            log.info(f"  [{i}/{len(groups)}] {group['name']} ({group['count']} listed) — {group['url']}")

            listings = scrape_model_group_listings(
                session,
                group["url"],
                cat_info["aircraft_type"],
            )
            log.info(f"    → {len(listings)} listings scraped")

            if not listings:
                continue

            # ASO category URLs currently resolve to largely identical global result sets.
            # De-duplicate by source_id inside this run to avoid overwriting rows repeatedly.
            deduped_listings: list[dict] = []
            duplicate_count = 0
            for listing in listings:
                source_id = str(listing.get("source_id") or "").strip()
                if not source_id:
                    continue
                if source_id in seen_source_ids_in_run:
                    duplicate_count += 1
                    continue
                seen_source_ids_in_run.add(source_id)
                deduped_listings.append(listing)
            if duplicate_count:
                log.info(
                    "    ↺ Skipped %d duplicate source_ids already seen earlier in this run.",
                    duplicate_count,
                )
            listings = deduped_listings
            if not listings:
                if (
                    not args.category
                    and len(groups) == 1
                    and group.get("name") == "category_page"
                ):
                    log.info(
                        "    No new listings in fallback category page; remaining categories are likely duplicates."
                    )
                    skip_remaining_categories = True
                continue

            # Optionally fetch detail pages
            if not args.no_detail:
                for j, listing in enumerate(listings):
                    adv_id = listing.get("aso_adv_id", "")
                    if not adv_id:
                        continue
                    if args.resume and listing["source_id"] in existing_ids:
                        log.debug(f"    Skip detail (exists): {listing['source_id']}")
                        total_skipped += 1
                        continue
                    log.debug(f"    Detail {j+1}/{len(listings)}: adv_id={adv_id}")
                    detail = scrape_detail_page(session, adv_id)
                    listing.update(detail)

            # Always finalize aircraft type from listing evidence.
            for listing in listings:
                listing["aircraft_type"] = _infer_aircraft_type_from_listing(
                    listing,
                    default_type=cat_info["aircraft_type"],
                )

            # Save or print
            if args.dry_run:
                for listing in listings[:3]:  # Print first 3
                    print(json.dumps(listing, indent=2, default=str))
                all_results.extend(listings)
            else:
                for listing in listings:
                    if args.resume and listing["source_id"] in existing_ids:
                        total_skipped += 1
                        continue
                    if upsert_listing(supabase, listing):
                        total_saved += 1

    if args.dry_run:
        log.info(f"\nDry run complete. {len(all_results)} total listings found (not saved).")
        # Save to JSON for inspection
        out_file = "aso_dry_run.json"
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(all_results, f, indent=2, default=str)
        log.info(f"Results written to {out_file}")
    else:
        log.info(f"\n✓ Done. Saved: {total_saved} | Skipped: {total_skipped}")


# ─── CLI ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="ASO.com Aircraft Scraper")
    parser.add_argument(
        "--category",
        choices=list(CATEGORIES.keys()),
        help="Scrape a single category (default: all)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch data and print results without writing to DB",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max number of model groups to scrape per category (for testing)",
    )
    parser.add_argument(
        "--no-detail",
        action="store_true",
        help="Skip detail page fetches (faster, less data)",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Skip source_ids already in DB",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable debug logging",
    )
    args = parser.parse_args()

    global log
    log = setup_logging(args.verbose)
    run(args)


if __name__ == "__main__":
    main()
