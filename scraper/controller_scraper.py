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
import random
import re
import hashlib
import time
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional, TYPE_CHECKING
from urllib.parse import urlencode, urljoin, urlparse

from bs4 import BeautifulSoup
from dotenv import load_dotenv

if TYPE_CHECKING:
    from supabase import Client

try:
    from adaptive_rate import AdaptiveRateLimiter
    from config import get_makes_for_tiers, get_manufacturer_tier, normalize_manufacturer
    from description_parser import parse_description, sanitize_engine_model
    from env_check import env_check
    from media_refresh_utils import apply_media_update, fetch_refresh_rows, load_source_ids_file
    from schema import validate_listing
    from scraper_base import (
        compute_listing_fingerprint,
        get_supabase,
        safe_upsert_with_fallback,
        setup_logging,
    )
except ImportError:  # pragma: no cover
    from .adaptive_rate import AdaptiveRateLimiter
    from .config import get_makes_for_tiers, get_manufacturer_tier, normalize_manufacturer
    from .description_parser import parse_description, sanitize_engine_model
    from .env_check import env_check
    from .media_refresh_utils import apply_media_update, fetch_refresh_rows, load_source_ids_file
    from .schema import validate_listing
    from .scraper_base import (
        compute_listing_fingerprint,
        get_supabase,
        safe_upsert_with_fallback,
        setup_logging,
    )

load_dotenv()


log = logging.getLogger(__name__)

BASE_URL = "https://www.controller.com"
SEARCH_PATH = "/listings/search"
CAPTCHA_RESUME_FILE = Path("scraper/.captcha_resume")
DEFAULT_CHECKPOINT_FILE = Path("scraper/state/controller_checkpoint.json")
FAILED_URLS_FILE = Path("scraper/failed_urls_controller.json")
HUMAN_PAGE_RENDER_WAIT_MS = (3500, 7000)
HUMAN_BETWEEN_MAKES_SECONDS = (20.0, 45.0)
HUMAN_MICRO_PAUSE_SECONDS = (0.4, 1.4)
HUMAN_OCCASIONAL_PAUSE_SECONDS = (4.0, 9.0)
HUMAN_BEFORE_DETAIL_SECONDS = (0.8, 2.0)
HUMAN_AFTER_DETAIL_RETURN_SECONDS = (2.4, 4.8)

# Confirmed from Controller search URL patterns in DevTools and external task notes.
CONTROLLER_CATEGORIES: dict[str, tuple[int, str]] = {
    "single_piston": (6, "single_engine_piston"),
    "single_engine_piston": (6, "single_engine_piston"),
    "twin_piston": (8, "multi_engine_piston"),
    "twin_engine_piston": (8, "multi_engine_piston"),
    "multi_engine_piston": (8, "multi_engine_piston"),
    "jet": (3, "jet"),
    "jets": (3, "jet"),
    "turboprop": (8, "turboprop"),
    "turbine_helicopter": (7, "helicopter"),
    "piston_helicopter": (5, "helicopter"),
    "light_sport": (433, "light_sport"),
    "light_sport_aircraft": (433, "light_sport"),
    "experimental": (2, "experimental"),
    "experimental_homebuilt": (2, "experimental"),
    "piston_float": (1, "amphibious_float"),
    "piston_amphibious_floatplanes": (1, "amphibious_float"),
    "turbine_float": (71, "amphibious_float"),
    "turbine_amphibious_floatplanes": (71, "amphibious_float"),
}


class CaptchaPauseRequested(RuntimeError):
    """Raised when scraper is intentionally paused for manual restart."""


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


async def _connect_cdp_context(playwright, cdp_url: str):
    """
    Attach to an already-running Chromium/Chrome/Brave session via CDP.
    This reuses the user's logged-in browser state/cookies.
    """
    browser = await playwright.chromium.connect_over_cdp(cdp_url)
    context = browser.contexts[0] if browser.contexts else await browser.new_context()
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


def build_category_url(category_id: int, page: int = 1, manufacturer: str = "") -> str:
    params: dict[str, str | int] = {"Category": category_id}
    if page > 1:
        params["page"] = page
    if manufacturer:
        params["Manufacturer"] = manufacturer.strip()
    return f"{BASE_URL}{SEARCH_PATH}?{urlencode(params)}"


def _parse_price(price_text: str) -> Optional[int]:
    numeric = re.sub(r"[^\d]", "", price_text or "")
    if not numeric:
        return None
    try:
        return int(numeric)
    except ValueError:
        return None


def _parse_hours_value(raw_text: str) -> Optional[int]:
    """
    Parse an hours-like integer from mixed spec text.
    Examples: "1,245", "1,245 HRS", "SMOH: 845", "TTSN 2,010".
    """
    if not raw_text:
        return None
    match = re.search(r"[\d,]{2,7}", raw_text)
    if not match:
        return None
    try:
        return int(match.group().replace(",", ""))
    except ValueError:
        return None


def _extract_engine_position(label: str) -> str:
    match = re.search(r"\bengine\s*(\d+)\b", label or "", re.IGNORECASE)
    if match:
        return f"engine_{match.group(1)}"
    return "engine_1"


def _extract_prop_position(label: str) -> str:
    match = re.search(r"\bprop(?:eller)?\s*(\d+)\b", label or "", re.IGNORECASE)
    if match:
        return f"prop_{match.group(1)}"
    return "prop_1"


def _dedupe_metric_rows(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    deduped: list[dict[str, object]] = []
    seen_positions: set[str] = set()
    for row in rows:
        position = str(row.get("position") or "").strip().lower()
        if not position:
            position = f"position_{len(deduped) + 1}"
            row["position"] = position
        if position in seen_positions:
            continue
        seen_positions.add(position)
        deduped.append(row)
    return deduped


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


def _looks_like_location(candidate: str) -> bool:
    text = (candidate or "").strip()
    if not text:
        return False
    low = text.lower()
    if low in {"location", "location:"}:
        return False
    if any(token in low for token in ("serial", "registration", "engine", "description", "snew", "smoh")):
        return False
    if "," in text:
        return True
    # Accept "City ST" fallback.
    if re.search(r"\b[A-Z]{2}\b$", text):
        return True
    # Accept "City, StateName" without comma only if state name appears.
    return any(state_name in low for state_name in _STATE_ABBREV.keys())


def _is_probable_listing_image(image_url: str) -> bool:
    low = (image_url or "").lower()
    if not low:
        return False
    blocked_tokens = (
        "/cdn/images/flags/",
        "flag.png",
        "logo.svg",
        "/content/controller/logo",
        "currency-icon",
        "/images/acc/",
        "privacyoptions",
        "bat.bing.com/action",
        "doubleclick.net",
        "googletagmanager",
    )
    if any(token in low for token in blocked_tokens):
        return False
    if any(token in low for token in ("logo", "icon", "sprite")) and "img.axd" not in low:
        return False
    if "img.axd" in low:
        return True
    return bool(re.search(r"\.(?:jpe?g|png|webp|gif)(?:\?|$)", low))


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


def _fetch_existing_fingerprints(supabase: "Client", source_ids: list[str]) -> dict[str, dict[str, Any]]:
    if not source_ids:
        return {}
    existing: dict[str, dict[str, Any]] = {}
    unique_source_ids = list(dict.fromkeys(source_ids))
    for idx in range(0, len(unique_source_ids), 200):
        chunk = unique_source_ids[idx : idx + 200]
        rows = (
            supabase.table("aircraft_listings")
            .select("source_id,listing_fingerprint,last_seen_date")
            .eq("source_site", "controller")
            .in_("source_id", chunk)
            .execute()
        )
        for row in rows.data or []:
            sid = row.get("source_id")
            if sid is None:
                continue
            existing[str(sid)] = {
                "listing_fingerprint": str(row.get("listing_fingerprint") or ""),
                "last_seen_date": row.get("last_seen_date"),
            }
    return existing


def _seen_within_hours(last_seen_date: Any, hours: int) -> bool:
    if not last_seen_date:
        return False
    try:
        if isinstance(last_seen_date, str):
            text = last_seen_date.strip()
            if len(text) == 10:
                seen_dt = datetime.fromisoformat(text).replace(tzinfo=timezone.utc)
            else:
                seen_dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
                if seen_dt.tzinfo is None:
                    seen_dt = seen_dt.replace(tzinfo=timezone.utc)
        elif isinstance(last_seen_date, datetime):
            seen_dt = last_seen_date if last_seen_date.tzinfo else last_seen_date.replace(tzinfo=timezone.utc)
        else:
            return False
        age_seconds = (datetime.now(timezone.utc) - seen_dt).total_seconds()
        return age_seconds <= hours * 3600
    except Exception:
        return False




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
                    extra["asking_price"] = p

        # --- Location (confirmed: div.detail__machine-location, double underscore) ---
        loc_el = soup.select_one("div.detail__machine-location")
        if loc_el:
            loc_text = re.sub(r"Aircraft\s*Location\s*:", "", loc_el.get_text(strip=True), flags=re.I).strip()
            if loc_text:
                extra["location_raw"] = loc_text
            city, state = _split_city_state(loc_text)
            if city:
                extra["location_city"] = city
            if state:
                extra["location_state"] = state
                extra["state"] = state

        # --- Seller info (dealer/private) ---
        seller_name = ""
        seller_branch = soup.select_one(".dealer-contact__branch-name strong, .dealer-contact__branch-name")
        if seller_branch:
            seller_name = seller_branch.get_text(" ", strip=True)
        if not seller_name:
            seller_title = soup.select_one(".seller-info h2, .seller-info h3, .sellerName [itemprop='name']")
            if seller_title:
                seller_name = seller_title.get_text(" ", strip=True)
        if seller_name:
            extra["seller_name"] = seller_name
            branch_area = soup.select_one(".dealer-contact, [class*='dealer-contact']")
            if branch_area:
                extra["seller_type"] = "dealer"
            else:
                upper = seller_name.upper()
                dealer_terms = ("LLC", "INC", "CORP", "AVIATION", "AIRCRAFT", "SALES", "JETS")
                extra["seller_type"] = "dealer" if any(term in upper for term in dealer_terms) else "private"

        # --- Photos/Gallery: collect all available image URLs ---
        gallery_urls: list[str] = []
        seen_gallery_urls: set[str] = set()
        for img in soup.select("section.photos img, .photos img, .gallery img, img[src], img[data-src]"):
            src = (img.get("data-src") or img.get("src") or "").strip()
            if not src:
                continue
            absolute_src = urljoin(BASE_URL, src)
            if not _is_probable_listing_image(absolute_src):
                continue
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
                cleaned_engine_model = sanitize_engine_model(specs[key].strip())
                if cleaned_engine_model:
                    extra["engine_model"] = cleaned_engine_model
                break
        engine_rows: list[dict[str, object]] = []
        for spec_key, spec_val in specs.items():
            spec_key_lower = spec_key.lower()
            if "engine" not in spec_key_lower:
                continue
            if not any(token in spec_key_lower for token in ("time", "smoh", "overhaul", "tso", "tsn")):
                continue
            hours_value = _parse_hours_value(spec_val)
            if hours_value is None:
                continue
            engine_rows.append(
                {
                    "position": _extract_engine_position(spec_key_lower),
                    "metric_type": "ENGINE_TIME",
                    "metric_raw": spec_val,
                    "metric_hours": hours_value,
                    "source_key": spec_key,
                }
            )

        engine_rows.sort(key=lambda item: str(item.get("position") or ""))
        engine_rows = _dedupe_metric_rows(engine_rows)
        if engine_rows:
            extra["engines_raw"] = engine_rows
            extra["engine_count"] = len(engine_rows)
            first_hours = _parse_hours_value(str(engine_rows[0].get("metric_raw") or ""))
            if first_hours is not None:
                extra["engine_time_since_overhaul"] = first_hours
                extra["time_since_overhaul"] = first_hours
            if len(engine_rows) >= 2:
                second_hours = _parse_hours_value(str(engine_rows[1].get("metric_raw") or ""))
                if second_hours is not None:
                    extra["second_engine_time_since_overhaul"] = second_hours

        for key in ("engine 1 time", "engine time", "smoh", "time since overhaul"):
            if key in specs:
                hours_value = _parse_hours_value(specs[key])
                if hours_value is not None:
                    extra.setdefault("engine_time_since_overhaul", hours_value)
                    extra.setdefault("time_since_overhaul", hours_value)
                    break
        if "engine tbo" in specs:
            hours_value = _parse_hours_value(specs["engine tbo"])
            if hours_value is not None:
                extra["engine_tbo_hours"] = hours_value

        # Propeller: map to canonical completeness field for audit visibility.
        prop_rows: list[dict[str, object]] = []
        for spec_key, spec_val in specs.items():
            spec_key_lower = spec_key.lower()
            if not any(token in spec_key_lower for token in ("prop", "propeller")):
                continue
            if not any(token in spec_key_lower for token in ("time", "spoh", "overhaul", "smoh")):
                continue
            hours_value = _parse_hours_value(spec_val)
            if hours_value is None:
                continue
            prop_rows.append(
                {
                    "position": _extract_prop_position(spec_key_lower),
                    "metric_type": "PROP_TIME",
                    "metric_raw": spec_val,
                    "metric_hours": hours_value,
                    "source_key": spec_key,
                }
            )

        prop_rows.sort(key=lambda item: str(item.get("position") or ""))
        prop_rows = _dedupe_metric_rows(prop_rows)
        if prop_rows:
            extra["props_raw"] = prop_rows
            first_prop_hours = _parse_hours_value(str(prop_rows[0].get("metric_raw") or ""))
            if first_prop_hours is not None:
                extra["time_since_prop_overhaul"] = first_prop_hours
            if len(prop_rows) >= 2:
                second_prop_hours = _parse_hours_value(str(prop_rows[1].get("metric_raw") or ""))
                if second_prop_hours is not None:
                    extra["second_time_since_prop_overhaul"] = second_prop_hours

        for key in (
            "prop 1 time",
            "prop time",
            "propeller time",
            "spoh",
            "prop smoh",
            "time since prop overhaul",
            "time since propeller overhaul",
        ):
            if key in specs:
                hours_value = _parse_hours_value(specs[key])
                if hours_value is not None:
                    extra.setdefault("time_since_prop_overhaul", hours_value)
                    break

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

def _parse_card_specs(specs_el) -> tuple[Optional[int], Optional[int], Optional[str]]:
    """Parse card-level specs container for year, total time, and serial number."""
    if specs_el is None:
        return None, None, None
    text = specs_el.get_text(" ", strip=True)
    year_value = None
    tt_value = None
    serial_value = None

    year_match = re.search(r"\bYear[:\s]*(\d{4})\b", text, re.IGNORECASE)
    if year_match:
        year_value = int(year_match.group(1))
    tt_match = re.search(r"(?:Total\s+Time|TTAF|TT)[:\s]*([\d,]+)", text, re.IGNORECASE)
    if tt_match:
        tt_value = int(tt_match.group(1).replace(",", ""))
    sn_match = re.search(r"(?:S/?N|Serial(?:\s+Number)?)[:\s#]*([A-Z0-9\-]{3,20})", text, re.IGNORECASE)
    if sn_match:
        serial_value = sn_match.group(1)

    return year_value, tt_value, serial_value


def parse_listing_card(card, default_aircraft_type: str = "single_engine_piston") -> Optional[dict]:
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

        # Confirmed Controller card title link selector in list layout.
        link_tag = (
            card.select_one("a.list-listing-title-link[href*='/listing/']")
            or card.select_one("a[href*='/listing/']")
            or card.select_one("a[href]")
        )
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

        # --- Title: prefer confirmed list title-link, fallback to legacy selectors ---
        title_el = card.select_one("a.list-listing-title-link")
        # Fallback for manufacturer page layout
        if not title_el:
            title_el = card.select_one("div.list-listing-title") or card.select_one("h3.sub-title")
        title_text = ""
        if title_el:
            title_text = (title_el.get("title") or title_el.get_text(" ", strip=True) or "").strip()

        # Extract year (4 digits) and make+model from title
        year_value = None
        make_value = None
        model_text = None
        year_match = re.search(r"\b(19|20)\d{2}\b", title_text)
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
        price_el = (
            card.select_one("div.price-contain")
            or card.select_one("span.price")
            or card.select_one(".price.main")
        )
        price_text = price_el.get_text(" ", strip=True) if price_el else ""
        price_value = None if any(tok in price_text.lower() for tok in ("call", "offer", "request")) else _parse_price(price_text)

        # --- N-Number from registration span or stock number ---
        stock_el = card.select_one("div.stock-number, span.registration, div.specs-container")
        stock_text = stock_el.get_text(" ", strip=True) if stock_el else ""
        n_number = _extract_n_number(stock_text)

        # --- Parse card specs container for stronger TT/year/serial extraction ---
        specs_el = card.select_one("div.specs-container")
        year_from_specs, tt_value, serial_value = _parse_card_specs(specs_el)
        if year_value is None and year_from_specs is not None:
            year_value = year_from_specs

        # --- Location ---
        location_text = ""
        location_candidates: list[str] = []
        location_nodes = card.select("span.location-span, div.listing-location, div.location, [class*='location']")
        for node in location_nodes:
            direct_text = node.get_text(" ", strip=True)
            if direct_text:
                location_candidates.append(direct_text)
            for attr_name in ("title", "aria-label", "data-original-title"):
                attr_value = (node.get(attr_name) or "").strip()
                if attr_value:
                    location_candidates.append(attr_value)
            if direct_text.lower() in {"location", "location:"}:
                sibling = node.find_next_sibling()
                sibling_text = sibling.get_text(" ", strip=True) if sibling else ""
                if sibling_text:
                    location_candidates.append(sibling_text)

        for candidate in location_candidates:
            cleaned = re.sub(r"^\s*Location\s*:\s*", "", candidate, flags=re.I).strip(" -|")
            if _looks_like_location(cleaned):
                location_text = cleaned
                break

        if not location_text:
            card_text = card.get_text(" ", strip=True)
            location_match = re.search(
                r"Location\s*:?\s*([A-Za-z .'-]+,\s*[A-Za-z ]{2,30}|[A-Za-z .'-]+\s+[A-Z]{2})",
                card_text,
                re.IGNORECASE,
            )
            if location_match:
                candidate = location_match.group(1).strip(" -|,")
                if _looks_like_location(candidate):
                    location_text = candidate

        city, state = _split_city_state(location_text)

        # --- Card primary image ---
        primary_image_url = None
        primary_img = card.select_one("div.listing-image img, img")
        if primary_img:
            src = (primary_img.get("data-src") or primary_img.get("src") or "").strip()
            if src:
                candidate = urljoin(BASE_URL, src)
                if _is_probable_listing_image(candidate):
                    primary_image_url = candidate

        # --- Seller ---
        seller_el = card.select_one(".contact-container, .dealer-wrapper span, .seller, span[class*='seller'], div[class*='seller']")
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
            "asking_price": price_value,
            "serial_number": serial_value,
            "n_number": n_number,
            "location_raw": location_text or None,
            "location_city": city,
            "location_state": state,
            "state": state,
            "total_time_airframe": tt_value,
            "primary_image_url": primary_image_url,
            "description": description or None,
            "aircraft_type": default_aircraft_type,
        }
        return listing
    except Exception as exc:
        log.warning(f"Error parsing listing card: {exc}")
        return None


async def fetch_page_soup(page, url: str) -> Optional[BeautifulSoup]:
    """Navigate via Playwright browser session and return parsed HTML."""
    try:
        response = await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(random.randint(*HUMAN_PAGE_RENDER_WAIT_MS))
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


def _get_listing_cards(soup: BeautifulSoup) -> list:
    cards = soup.select("div.list-listing-card-wrapper")
    if cards:
        return cards
    return soup.select("article.search-card")


async def wait_for_manual_captcha_resume(label: str, *, resume_mode: str = "file") -> None:
    """
    True pause mode: halt all requests until operator explicitly resumes.
    Resume by creating scraper/.captcha_resume.
    """
    if resume_mode == "stop":
        log.warning(
            "[%s] CAPTCHA/challenge detected. Scraper paused for manual restart. "
            "Restart with --resume when ready.",
            label,
        )
        raise CaptchaPauseRequested(label)
    if resume_mode == "prompt":
        log.warning(
            "[%s] CAPTCHA/challenge detected. Scraper is paused. "
            "Solve CAPTCHA in browser, then press Enter in terminal to continue.",
            label,
        )
        await asyncio.to_thread(input, f"[{label}] CAPTCHA solved? Press Enter to resume...")
    else:
        log.warning(
            "[%s] CAPTCHA/challenge detected. Scraper is paused. "
            "After solving CAPTCHA, create %s to resume.",
            label,
            CAPTCHA_RESUME_FILE,
        )
        while not CAPTCHA_RESUME_FILE.exists():
            await asyncio.sleep(2)
        try:
            CAPTCHA_RESUME_FILE.unlink()
        except OSError:
            pass
    log.info("[%s] CAPTCHA resume signal received. Continuing scrape.", label)


async def wait_for_search_ready(page, initial_url: str, label: str, *, resume_mode: str = "file") -> None:
    """
    Wait until the initial search page returns listing cards.

    If Controller serves a challenge/CAPTCHA page, scraper enters true pause mode
    and waits for an explicit resume signal.
    """
    while True:
        soup = await fetch_page_soup(page, initial_url)
        cards = _get_listing_cards(soup) if soup else []

        if cards:
            log.info("[%s] Initial page ready (%d cards). Continuing scrape.", label, len(cards))
            return

        await wait_for_manual_captcha_resume(label, resume_mode=resume_mode)


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


def load_failed_entries(failed_file: Path) -> list[dict[str, Any]]:
    if not failed_file.exists():
        return []
    try:
        payload = json.loads(failed_file.read_text(encoding="utf-8"))
    except Exception as exc:
        log.warning("Failed to read failed URL file %s: %s", failed_file, exc)
        return []
    if not isinstance(payload, list):
        return []
    return [entry for entry in payload if isinstance(entry, dict)]


def save_failed_entries(failed_file: Path, failed_entries: list[dict[str, Any]]) -> None:
    failed_file.parent.mkdir(parents=True, exist_ok=True)
    failed_file.write_text(json.dumps(failed_entries, indent=2, ensure_ascii=True), encoding="utf-8")


def log_scraper_session(
    supabase: "Client",
    *,
    site: str,
    started_at: datetime,
    ended_at: datetime,
    listings_attempted: int,
    listings_succeeded: int,
    first_error_at_listing: int | None,
    error_type: str | None,
    avg_delay_ms: int,
    batch_size: int,
    session_notes: str,
) -> None:
    row = {
        "id": str(uuid.uuid4()),
        "site": site,
        "started_at": started_at.isoformat(),
        "ended_at": ended_at.isoformat(),
        "listings_attempted": listings_attempted,
        "listings_succeeded": listings_succeeded,
        "first_error_at_listing": first_error_at_listing,
        "error_type": error_type,
        "avg_delay_ms": avg_delay_ms,
        "batch_size": batch_size,
        "session_notes": session_notes[:1000],
    }
    try:
        supabase.table("scraper_sessions").insert(row).execute()
    except Exception as exc:
        log.warning("Failed to write scraper session row: %s", exc)


async def scrape_make(
    page,
    make: str,
    limit: Optional[int] = None,
    fetch_details: bool = True,
    default_aircraft_type: str = "single_engine_piston",
    start_page: int = 1,
    on_page_complete: Optional[Callable[[int, list[dict]], None]] = None,
    supabase: Optional["Client"] = None,
    limiter: Optional[AdaptiveRateLimiter] = None,
    session_deadline_epoch: Optional[float] = None,
    failed_entries: Optional[list[dict[str, Any]]] = None,
    session_stats: Optional[dict[str, Any]] = None,
    captcha_resume_mode: str = "file",
    force_detail_fetch: bool = False,
) -> list[dict]:
    """Scrape one make by incrementing page=1..N until no new cards appear."""
    listings: list[dict] = []
    seen_source_ids: set[str] = set()
    page_num = max(1, start_page)

    while True:
        if session_deadline_epoch and time.time() >= session_deadline_epoch:
            log.warning("[%s] Session budget reached before page %s.", make, page_num)
            break
        page_url = build_make_url(make, page=page_num)
        log.info(f"[{make}] Fetching page {page_num}: {page_url}")

        soup = await fetch_page_soup(page, page_url)
        if not soup:
            log.warning(
                "[%s] Fetch/block failure on page %s; entering CAPTCHA pause mode.",
                make,
                page_num,
            )
            await wait_for_manual_captcha_resume(make, resume_mode=captcha_resume_mode)
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
            listing = parse_listing_card(card, default_aircraft_type=default_aircraft_type)
            if listing:
                parsed_cards.append(listing)

        existing_fingerprints: dict[str, dict[str, Any]] = {}
        if supabase and parsed_cards:
            source_ids = [str(item.get("source_id")) for item in parsed_cards if item.get("source_id")]
            existing_fingerprints = _fetch_existing_fingerprints(supabase, source_ids)

        new_cards_on_page = 0
        page_new_listings: list[dict] = []
        for listing in parsed_cards:
            if session_deadline_epoch and time.time() >= session_deadline_epoch:
                log.warning("[%s] Session budget reached mid-page; stopping.", make)
                if on_page_complete and page_new_listings:
                    on_page_complete(page_num, page_new_listings)
                return listings
            source_id = listing["source_id"]
            if source_id in seen_source_ids:
                continue

            seen_source_ids.add(source_id)
            if session_stats is not None:
                session_stats["attempted"] = int(session_stats.get("attempted", 0)) + 1
            listing["listing_fingerprint"] = compute_listing_fingerprint(listing)
            existing_state = existing_fingerprints.get(str(source_id), {})
            previous_fingerprint = str(existing_state.get("listing_fingerprint") or "")
            recently_scraped = _seen_within_hours(existing_state.get("last_seen_date"), 48)
            should_fetch_detail = force_detail_fetch or (previous_fingerprint != listing["listing_fingerprint"])

            # Fetch detail page for richer data + human-like navigation
            detail_url = listing.get("url")
            if fetch_details and detail_url and should_fetch_detail:
                if (not force_detail_fetch) and recently_scraped and previous_fingerprint == listing["listing_fingerprint"]:
                    log.info("[%s] Skipping detail fetch (seen within 48h) source_id=%s", make, source_id)
                else:
                    log.info(f"[{make}] Fetching detail: {detail_url}")
                    await asyncio.sleep(random.uniform(*HUMAN_BEFORE_DETAIL_SECONDS))
                    try:
                        extra = await fetch_listing_detail(page, detail_url)
                        if not extra:
                            if limiter:
                                limiter.on_challenge_or_429()
                            await asyncio.sleep(random.uniform(1.0, 2.0))
                            extra = await fetch_listing_detail(page, detail_url)
                        listing.update(extra)
                    except Exception as exc:
                        if session_stats is not None:
                            if session_stats.get("first_error_at_listing") is None:
                                session_stats["first_error_at_listing"] = session_stats.get("attempted")
                            session_stats["error_type"] = f"detail_fetch_error:{type(exc).__name__}"
                        fail_row = {
                            "source_site": "controller",
                            "source_id": source_id,
                            "url": detail_url,
                            "make": make,
                            "error": str(exc),
                            "at": datetime.now(timezone.utc).isoformat(),
                            "listing": listing,
                        }
                        if failed_entries is not None:
                            failed_entries.append(fail_row)
                        log.warning("[%s] Detail fetch failed source_id=%s url=%s err=%s", make, source_id, detail_url, exc)
                    # Go back to search results
                    await page.go_back(wait_until="domcontentloaded", timeout=15000)
                    await page.wait_for_timeout(random.uniform(2000, 4000))
                    await asyncio.sleep(random.uniform(*HUMAN_AFTER_DETAIL_RETURN_SECONDS))
            elif detail_url and fetch_details:
                log.info("[%s] Skipping unchanged detail fetch for source_id=%s", make, source_id)

            listings.append(listing)
            page_new_listings.append(listing)
            new_cards_on_page += 1
            if session_stats is not None:
                session_stats["succeeded"] = int(session_stats.get("succeeded", 0)) + 1

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

            if limiter:
                effective_delay = await asyncio.to_thread(limiter.wait)
                if session_stats is not None:
                    delay_samples = session_stats.setdefault("delay_samples", [])
                    if isinstance(delay_samples, list):
                        delay_samples.append(int(effective_delay * 1000))
                await asyncio.sleep(random.uniform(*HUMAN_MICRO_PAUSE_SECONDS))
                if random.random() < 0.12:
                    await asyncio.sleep(random.uniform(*HUMAN_OCCASIONAL_PAUSE_SECONDS))
                await asyncio.sleep(random.uniform(*HUMAN_MICRO_PAUSE_SECONDS))
                if random.random() < 0.12:
                    await asyncio.sleep(random.uniform(*HUMAN_OCCASIONAL_PAUSE_SECONDS))
                if limiter.should_pause():
                    pause_seconds = limiter.pause_duration_seconds()
                    log.info("[%s] Adaptive pause for %ss after batch.", make, pause_seconds)
                    await asyncio.sleep(pause_seconds)

        if on_page_complete and page_new_listings:
            on_page_complete(page_num, page_new_listings)

        log.info(f"[{make}] Page {page_num} new cards: {new_cards_on_page}")
        if new_cards_on_page == 0:
            log.info(f"[{make}] No new cards found on page {page_num}; stopping pagination.")
            break

        page_num += 1
        if limiter:
            delay = await asyncio.to_thread(limiter.wait)
            log.info(f"[{make}] Adaptive wait {delay:.1f}s before next page...")
            await asyncio.sleep(random.uniform(1.0, 3.0))
        else:
            delay = random.uniform(8.0, 12.0)
            log.info(f"[{make}] Waiting {delay:.1f}s before next page...")
            await asyncio.sleep(delay)

    return listings


async def scrape_category(
    page,
    category_key: str,
    *,
    manufacturer: str = "",
    limit: Optional[int] = None,
    fetch_details: bool = True,
    supabase: Optional["Client"] = None,
    limiter: Optional[AdaptiveRateLimiter] = None,
    session_deadline_epoch: Optional[float] = None,
    failed_entries: Optional[list[dict[str, Any]]] = None,
    session_stats: Optional[dict[str, Any]] = None,
    captcha_resume_mode: str = "file",
    force_detail_fetch: bool = False,
) -> list[dict]:
    category_id, aircraft_type = CONTROLLER_CATEGORIES[category_key]
    label = f"category:{category_key}"
    listings: list[dict] = []
    seen_source_ids: set[str] = set()
    page_num = 1

    while True:
        if session_deadline_epoch and time.time() >= session_deadline_epoch:
            log.warning("[%s] Session budget reached before page %s.", label, page_num)
            break
        page_url = build_category_url(category_id, page=page_num, manufacturer=manufacturer)
        log.info("[%s] Fetching page %s: %s", label, page_num, page_url)
        soup = await fetch_page_soup(page, page_url)
        if not soup:
            await wait_for_manual_captcha_resume(label, resume_mode=captcha_resume_mode)
            continue

        cards = _get_listing_cards(soup)
        if not cards:
            log.info("[%s] No cards found on page %s; stopping.", label, page_num)
            break

        parsed_cards = [
            item
            for item in (parse_listing_card(card, default_aircraft_type=aircraft_type) for card in cards)
            if item is not None
        ]
        existing_fingerprints: dict[str, dict[str, Any]] = {}
        if supabase and parsed_cards:
            source_ids = [str(item.get("source_id")) for item in parsed_cards if item.get("source_id")]
            existing_fingerprints = _fetch_existing_fingerprints(supabase, source_ids)

        page_new = 0
        for listing in parsed_cards:
            source_id = listing["source_id"]
            if source_id in seen_source_ids:
                continue
            seen_source_ids.add(source_id)
            if session_stats is not None:
                session_stats["attempted"] = int(session_stats.get("attempted", 0)) + 1

            listing["listing_fingerprint"] = compute_listing_fingerprint(listing)
            existing_state = existing_fingerprints.get(str(source_id), {})
            previous_fingerprint = str(existing_state.get("listing_fingerprint") or "")
            recently_scraped = _seen_within_hours(existing_state.get("last_seen_date"), 48)
            should_fetch_detail = force_detail_fetch or (previous_fingerprint != listing["listing_fingerprint"])

            detail_url = listing.get("url")
            if fetch_details and detail_url and should_fetch_detail:
                if (not force_detail_fetch) and recently_scraped and previous_fingerprint == listing["listing_fingerprint"]:
                    pass
                else:
                    await asyncio.sleep(random.uniform(*HUMAN_BEFORE_DETAIL_SECONDS))
                    try:
                        listing.update(await fetch_listing_detail(page, detail_url))
                        await asyncio.sleep(random.uniform(*HUMAN_AFTER_DETAIL_RETURN_SECONDS))
                    except Exception as exc:
                        if session_stats is not None:
                            if session_stats.get("first_error_at_listing") is None:
                                session_stats["first_error_at_listing"] = session_stats.get("attempted")
                            session_stats["error_type"] = f"detail_fetch_error:{type(exc).__name__}"
                        if failed_entries is not None:
                            failed_entries.append(
                                {
                                    "source_site": "controller",
                                    "source_id": source_id,
                                    "url": detail_url,
                                    "make": listing.get("make"),
                                    "error": str(exc),
                                    "at": datetime.now(timezone.utc).isoformat(),
                                    "listing": listing,
                                }
                            )

            listings.append(listing)
            page_new += 1
            if session_stats is not None:
                session_stats["succeeded"] = int(session_stats.get("succeeded", 0)) + 1
            if limit is not None and len(listings) >= limit:
                return listings
            if limiter:
                effective_delay = await asyncio.to_thread(limiter.wait)
                if session_stats is not None:
                    delay_samples = session_stats.setdefault("delay_samples", [])
                    if isinstance(delay_samples, list):
                        delay_samples.append(int(effective_delay * 1000))

        if page_new == 0:
            break
        page_num += 1

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
        parser_text = f"{listing.get('description') or ''} {listing.get('description_full') or ''}".strip()
        if parser_text:
            parsed_intel = parse_description(parser_text)
            listing["description_intelligence"] = parsed_intel
            parsed_engine_model = parsed_intel.get("engine", {}).get("model")
            existing_engine_model = listing.get("engine_model")
            existing_engine_model_text = str(existing_engine_model).strip() if existing_engine_model else ""
            if isinstance(parsed_engine_model, str):
                if not existing_engine_model_text or len(existing_engine_model_text) > 120:
                    listing["engine_model"] = parsed_engine_model
            parsed_smoh = parsed_intel.get("times", {}).get("engine_smoh")
            if listing.get("engine_time_since_overhaul") in (None, "", 0) and isinstance(parsed_smoh, int):
                listing["engine_time_since_overhaul"] = parsed_smoh
            if listing.get("time_since_overhaul") in (None, "", 0) and isinstance(parsed_smoh, int):
                listing["time_since_overhaul"] = parsed_smoh
            parsed_spoh = parsed_intel.get("times", {}).get("prop_spoh")
            if listing.get("time_since_prop_overhaul") in (None, "", 0) and isinstance(parsed_spoh, int):
                listing["time_since_prop_overhaul"] = parsed_spoh
            parsed_tt = parsed_intel.get("times", {}).get("total_time")
            if listing.get("total_time_airframe") in (None, "", 0) and isinstance(parsed_tt, int):
                listing["total_time_airframe"] = parsed_tt

        row, warnings = validate_listing(listing)
        if warnings:
            listing_id = listing.get("source_id") or listing.get("source_listing_id") or "unknown"
            log.warning("Skipping invalid listing %s: %s", listing_id, "; ".join(warnings))
            continue
        source_id = row.get("source_id")
        existing = existing_by_source_id.get(str(source_id)) if source_id is not None else None

        row["last_seen_date"] = today_iso
        normalized_make = normalize_manufacturer(str(row.get("make") or ""))
        if normalized_make:
            row["make"] = normalized_make
        manufacturer_tier = get_manufacturer_tier(row.get("make"))
        if manufacturer_tier is not None:
            row["manufacturer_tier"] = manufacturer_tier
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

    if not rows:
        return 0

    # PostgREST requires matching object keys for bulk upsert payloads.
    if rows:
        all_keys: set[str] = set()
        for row in rows:
            all_keys.update(row.keys())
        for row in rows:
            for key in all_keys:
                row.setdefault(key, None)

    # This workspace DB enforces uniqueness on source_listing_id path in some environments.
    # Try that conflict key first, then fall back.
    conflict_attempts = [
        ("source_site,source_listing_id", ["source_site", "source_listing_id"]),
        ("source_site,source_id", ["source_site", "source_id"]),
    ]
    saved = 0
    last_exc: Exception | None = None
    for on_conflict, match_keys in conflict_attempts:
        try:
            saved = safe_upsert_with_fallback(
                supabase=supabase,
                table="aircraft_listings",
                rows=rows,
                on_conflict=on_conflict,
                fallback_match_keys=match_keys,
                logger=log,
            )
            if saved:
                break
        except Exception as exc:
            last_exc = exc
            msg = str(exc)
            if "no unique or exclusion constraint matching the ON CONFLICT specification" in msg:
                log.warning("Batch upsert conflict key unsupported (%s). Trying next fallback.", on_conflict)
                continue
            log.error(f"Batch upsert failed: {exc}")
            break
    if saved == 0:
        log.warning(
            "Falling back to row-level upserts after batch path saved 0 rows%s.",
            f" ({last_exc})" if last_exc else "",
        )
        for row in rows:
            row_saved = False
            for on_conflict, _match_keys in conflict_attempts:
                try:
                    supabase.table("aircraft_listings").upsert(row, on_conflict=on_conflict).execute()
                    saved += 1
                    row_saved = True
                    break
                except Exception as row_exc:
                    msg = str(row_exc)
                    if "no unique or exclusion constraint matching the ON CONFLICT specification" in msg:
                        log.warning(
                            "Row upsert conflict key unsupported (%s) for %s. Trying next fallback.",
                            on_conflict,
                            row.get("source_id"),
                        )
                        continue
                    log.error(f"Failed upsert for source_id={row.get('source_id')}: {row_exc}")
                    break
            if not row_saved:
                log.warning("Row upsert failed for %s after all conflict fallbacks.", row.get("source_id"))
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


async def run_media_refresh_mode(
    *,
    page: Any,
    supabase: "Client",
    source_ids_file: str | None,
    limit: int | None,
    dry_run: bool,
    ignore_detail_stale: bool,
) -> None:
    source_ids = load_source_ids_file(source_ids_file)
    candidates = fetch_refresh_rows(
        supabase,
        source_site="controller",
        source_ids=source_ids,
        limit=limit,
    )
    scanned = 0
    updated = 0
    for row in candidates:
        source_id = str(row.get("source_id") or "").strip()
        detail_url = str(row.get("url") or "").strip()
        if not source_id or not detail_url:
            continue
        if not ignore_detail_stale and _seen_within_hours(row.get("last_seen_date"), 48):
            continue
        scanned += 1
        try:
            extra = await fetch_listing_detail(page, detail_url)
        except Exception as exc:
            log.warning("[media-refresh] source_id=%s failed: %s", source_id, exc)
            continue
        image_urls = extra.get("image_urls") if isinstance(extra.get("image_urls"), list) else []
        primary_image_url = str(extra.get("primary_image_url") or "").strip() or (image_urls[0] if image_urls else None)
        if not image_urls and not primary_image_url:
            continue
        if dry_run:
            log.info(
                "[media-refresh] dry-run source_id=%s gallery_count=%s primary=%s",
                source_id,
                len(image_urls),
                bool(primary_image_url),
            )
            continue
        apply_media_update(
            supabase,
            source_site="controller",
            source_id=source_id,
            image_urls=image_urls,
            primary_image_url=primary_image_url,
        )
        updated += 1
    log.info(
        "[media-refresh] controller complete candidates=%s scanned=%s updated=%s dry_run=%s",
        len(candidates),
        scanned,
        updated,
        dry_run,
    )


async def main() -> None:
    parser = argparse.ArgumentParser(description="Controller.com aircraft listing scraper (Playwright)")
    parser.add_argument("--make", nargs="+", help="One or more makes to scrape")
    parser.add_argument(
        "--category",
        choices=["all", *sorted(CONTROLLER_CATEGORIES.keys())],
        default=None,
        help="Optional category-mode scrape (uses Controller Category IDs).",
    )
    parser.add_argument("--manufacturer", default="", help="Optional make/manufacturer filter for category mode.")
    parser.add_argument("--dry-run", action="store_true", help="Print listings and do not save to DB")
    parser.add_argument("--limit", type=int, default=None, help="Max listings per make (default: no limit)")
    parser.add_argument("--no-detail", action="store_true", help="Skip detail-page enrichment for fast smoke tests")
    parser.add_argument(
        "--force-details",
        action="store_true",
        help="Force detail-page fetch even when listing fingerprint is unchanged.",
    )
    parser.add_argument(
        "--captcha-resume",
        choices=["file", "prompt", "stop"],
        default="stop",
        help="CAPTCHA behavior: file marker resume, prompt resume, or stop for manual restart.",
    )
    parser.add_argument(
        "--cdp-url",
        default=None,
        help="Optional CDP endpoint (example: http://localhost:9222) to reuse an already-open browser session.",
    )
    parser.add_argument("--output", metavar="FILE", help="Write all scraped listings to JSON file")
    parser.add_argument("--resume", action="store_true", help="Resume from checkpoint file")
    parser.add_argument("--max-listings", type=int, default=None, help="Max total listings for this session")
    parser.add_argument("--session-budget-minutes", type=int, default=None, help="Stop run when time budget is reached")
    parser.add_argument("--retry-failed", action="store_true", help="Retry URLs recorded in scraper/failed_urls_controller.json")
    parser.add_argument(
        "--tier",
        nargs="+",
        default=["all"],
        help="Manufacturer tiers to scrape: 1, 2, 3, or all (default: all)",
    )
    parser.add_argument(
        "--failed-file",
        default=str(FAILED_URLS_FILE),
        help=f"Failed URL file path (default: {FAILED_URLS_FILE})",
    )
    parser.add_argument(
        "--checkpoint-file",
        default=str(DEFAULT_CHECKPOINT_FILE),
        help=f"Checkpoint file path (default: {DEFAULT_CHECKPOINT_FILE})",
    )
    parser.add_argument("--verbose", action="store_true", help="Enable DEBUG logging")
    parser.add_argument("--media-refresh-only", action="store_true", help="Run targeted image refresh mode only")
    parser.add_argument("--source-ids-file", default=None, help="Optional file with one source_id per line")
    parser.add_argument(
        "--ignore-detail-stale",
        action="store_true",
        help="Bypass 48h stale-detail guard in media refresh mode",
    )
    args = parser.parse_args()

    global log
    log = setup_logging(args.verbose)
    env_check(required=[] if args.dry_run else None)

    if CAPTCHA_RESUME_FILE.exists():
        CAPTCHA_RESUME_FILE.unlink(missing_ok=True)

    fetch_details = not args.no_detail
    category_mode = args.category is not None
    makes: list[str] = []
    categories: list[str] = []
    if category_mode:
        categories = list(CONTROLLER_CATEGORIES.keys()) if args.category == "all" else [str(args.category)]
        log.info("Category mode enabled: categories=%s manufacturer=%s", categories, args.manufacturer or "(none)")
        if args.resume:
            log.warning("--resume is ignored in category mode.")
    else:
        if args.make:
            makes = args.make
        else:
            try:
                makes = get_makes_for_tiers(args.tier)
            except ValueError as exc:
                raise SystemExit(str(exc)) from exc
        if len(makes) > 1:
            makes = list(makes)
            random.shuffle(makes)
        log.info(f"Makes to scrape: {makes}")
    checkpoint_file = Path(args.checkpoint_file)
    failed_file = Path(args.failed_file)
    checkpoint_data = load_checkpoint(checkpoint_file) if args.resume and not category_mode else None
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
    limiter = None if args.dry_run or supabase is None else AdaptiveRateLimiter(supabase, "controller", logger=log)
    if limiter:
        log.info("[controller] Adaptive settings: %s", limiter.get_recommended_settings())
    failed_entries: list[dict[str, Any]] = []
    session_stats: dict[str, Any] = {
        "attempted": 0,
        "succeeded": 0,
        "first_error_at_listing": None,
        "error_type": None,
        "delay_samples": [],
    }
    session_started = datetime.now(timezone.utc)
    session_deadline_epoch = None
    if args.session_budget_minutes and args.session_budget_minutes > 0:
        session_deadline_epoch = time.time() + args.session_budget_minutes * 60

    from playwright.async_api import async_playwright

    total_count = 0
    per_make_counts: dict[str, int] = {}
    collected: list[dict] = []

    paused_for_captcha = False
    try:
        async with async_playwright() as playwright:
            if args.cdp_url:
                log.info("Connecting to existing browser via CDP: %s", args.cdp_url)
                browser, context = await _connect_cdp_context(playwright, args.cdp_url)
            else:
                browser, context = await _create_browser_context(playwright)
            page = await context.new_page()

            if args.media_refresh_only:
                if supabase is None:
                    supabase = get_supabase()
                await run_media_refresh_mode(
                    page=page,
                    supabase=supabase,
                    source_ids_file=args.source_ids_file,
                    limit=args.limit,
                    dry_run=args.dry_run,
                    ignore_detail_stale=args.ignore_detail_stale,
                )
                return

            if args.retry_failed:
                retry_items = load_failed_entries(failed_file)
                if not retry_items:
                    log.info("No failed entries found in %s", failed_file)
                    return

                retried_rows: list[dict[str, Any]] = []
                still_failed: list[dict[str, Any]] = []
                for item in retry_items:
                    listing = item.get("listing") if isinstance(item.get("listing"), dict) else {}
                    listing = dict(listing)
                    source_id = item.get("source_id") or listing.get("source_id")
                    detail_url = item.get("url") or listing.get("url")
                    if source_id:
                        listing.setdefault("source_id", source_id)
                    if detail_url:
                        listing.setdefault("url", detail_url)
                    if not listing.get("source_site"):
                        listing["source_site"] = "controller"
                    if not listing.get("listing_source"):
                        listing["listing_source"] = "controller"

                    if not detail_url:
                        item["error"] = "missing_url"
                        item["at"] = datetime.now(timezone.utc).isoformat()
                        still_failed.append(item)
                        continue

                    try:
                        listing.update(await fetch_listing_detail(page, detail_url))
                        retried_rows.append(listing)
                    except Exception as exc:
                        item["error"] = str(exc)
                        item["at"] = datetime.now(timezone.utc).isoformat()
                        still_failed.append(item)

                if args.dry_run:
                    _print_listings(retried_rows)
                elif retried_rows and supabase is not None:
                    saved = upsert_listings(supabase, retried_rows)
                    log.info("Retried failed URLs: saved=%s attempted=%s", saved, len(retried_rows))

                save_failed_entries(failed_file, still_failed)
                log.info("Retry-failed complete: recovered=%s remaining_failed=%s", len(retried_rows), len(still_failed))
                return

            if category_mode:
                first_category = categories[0]
                first_category_id, _ = CONTROLLER_CATEGORIES[first_category]
                initial_url = build_category_url(first_category_id, page=1, manufacturer=args.manufacturer)
                log.info("Opening initial category page: %s", initial_url)
                await wait_for_search_ready(
                    page=page,
                    initial_url=initial_url,
                    label=f"category:{first_category}",
                    resume_mode=args.captcha_resume,
                )

                for category_key in categories:
                    if args.max_listings is not None:
                        remaining_total = args.max_listings - total_count
                        if remaining_total <= 0:
                            break
                        category_limit = remaining_total if args.limit is None else min(args.limit, remaining_total)
                    else:
                        category_limit = args.limit

                    category_listings = await scrape_category(
                        page=page,
                        category_key=category_key,
                        manufacturer=args.manufacturer,
                        limit=category_limit,
                        fetch_details=fetch_details,
                        supabase=supabase,
                        limiter=limiter,
                        session_deadline_epoch=session_deadline_epoch,
                        failed_entries=failed_entries,
                        session_stats=session_stats,
                        captcha_resume_mode=args.captcha_resume,
                        force_detail_fetch=args.force_details,
                    )

                    if args.dry_run:
                        _print_listings(category_listings)
                    elif category_listings and supabase is not None:
                        saved = upsert_listings(supabase, category_listings)
                        log.info("[%s] Upserted %s/%s listings.", category_key, saved, len(category_listings))

                    count = len(category_listings)
                    total_count += count
                    per_make_counts[f"category:{category_key}"] = count
                    collected.extend(category_listings)

                    if session_deadline_epoch and time.time() >= session_deadline_epoch:
                        break
                    if args.max_listings is not None and total_count >= args.max_listings:
                        break
            else:
                initial_url = build_make_url(makes[0], page=1)
                log.info(f"Opening initial page for challenge detection: {initial_url}")
                await wait_for_search_ready(
                    page=page,
                    initial_url=initial_url,
                    label=makes[0],
                    resume_mode=args.captcha_resume,
                )

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
                    make_limit = args.limit
                    if args.max_listings is not None:
                        remaining_total = args.max_listings - total_count
                        if remaining_total <= 0:
                            log.info("Session max listings reached (%s). Stopping.", args.max_listings)
                            break
                        make_limit = remaining_total if make_limit is None else min(make_limit, remaining_total)

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
                        limit=make_limit,
                        fetch_details=fetch_details,
                        start_page=start_page,
                        on_page_complete=on_page_complete,
                        supabase=supabase,
                        limiter=limiter,
                        session_deadline_epoch=session_deadline_epoch,
                        failed_entries=failed_entries,
                        session_stats=session_stats,
                        captcha_resume_mode=args.captcha_resume,
                        force_detail_fetch=args.force_details,
                    )
                    count = len(make_listings)
                    total_count += count
                    per_make_counts[make] = count
                    collected.extend(make_listings)
                    if session_deadline_epoch and time.time() >= session_deadline_epoch:
                        log.warning("Session budget exhausted after make=%s", make)
                        break
                    if args.max_listings is not None and total_count >= args.max_listings:
                        log.info("Session max listings reached (%s).", args.max_listings)
                        break

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
                        if limiter:
                            between_delay = await asyncio.to_thread(limiter.wait)
                            delay_samples = session_stats.setdefault("delay_samples", [])
                            if isinstance(delay_samples, list):
                                delay_samples.append(int(between_delay * 1000))
                            extra_delay = random.uniform(*HUMAN_BETWEEN_MAKES_SECONDS)
                            log.info(
                                "Adaptive wait %.1fs + human dwell %.1fs before next make...",
                                between_delay,
                                extra_delay,
                            )
                            await asyncio.sleep(extra_delay)
                        else:
                            between_delay = random.uniform(*HUMAN_BETWEEN_MAKES_SECONDS)
                            log.info(f"Waiting {between_delay:.1f}s before next make...")
                            await asyncio.sleep(between_delay)
    except CaptchaPauseRequested:
        paused_for_captcha = True
        log.warning("Paused for CAPTCHA. Waiting for manual restart command.")

    if args.output:
        output_path = Path(args.output)
        output_path.write_text(json.dumps(collected, indent=2, ensure_ascii=True), encoding="utf-8")
        log.info(f"Wrote {len(collected)} listings to {output_path}")

    for make, count in per_make_counts.items():
        log.info(f"Final count [{make}]: {count}")
    log.info(f"Final total listings: {total_count}")
    if failed_entries:
        save_failed_entries(failed_file, failed_entries)
        log.warning(
            "Session finished: %s succeeded, %s failed (see %s)",
            session_stats.get("succeeded", 0),
            len(failed_entries),
            failed_file,
        )
    elif failed_file.exists() and not args.retry_failed:
        save_failed_entries(failed_file, [])
    if supabase and not category_mode and not args.make:
        mark_inactive_listings(supabase, "controller")
    if supabase and not args.dry_run:
        session_ended = datetime.now(timezone.utc)
        delay_samples = session_stats.get("delay_samples", [])
        avg_delay_ms = int(sum(delay_samples) / len(delay_samples)) if isinstance(delay_samples, list) and delay_samples else (
            limiter.get_recommended_settings().get("safe_delay_ms", 2500) if limiter else 2500
        )
        batch_size = limiter.get_recommended_settings().get("safe_batch_size", 10) if limiter else 10
        notes = (
            f"max_listings={args.max_listings};budget_min={args.session_budget_minutes};"
            f"retry_failed={args.retry_failed};failed_count={len(failed_entries)}"
        )
        log_scraper_session(
            supabase,
            site="controller",
            started_at=session_started,
            ended_at=session_ended,
            listings_attempted=int(session_stats.get("attempted", 0)),
            listings_succeeded=int(session_stats.get("succeeded", 0)),
            first_error_at_listing=session_stats.get("first_error_at_listing"),
            error_type=session_stats.get("error_type"),
            avg_delay_ms=avg_delay_ms,
            batch_size=batch_size,
            session_notes=notes,
        )
    if not paused_for_captcha:
        clear_checkpoint(checkpoint_file)


if __name__ == "__main__":
    asyncio.run(main())