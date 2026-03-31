from __future__ import annotations

from scraper_health import (
    looks_like_challenge_html,
    detect_challenge_type,
    log_scraper_error,
    retry_with_backoff,
    SelectorConfig,
    ScraperResult,
    ErrorType,
)

# 2026-03-04: Integrate AeroTrader v2 scraper using canonical schema/upsert conventions.
# 2026-03-05: Add pagination loop guards for repeated pages and consecutive no-op saves.

import argparse
import html as html_module
import json
import logging
import os
import random
import re
import time
from datetime import date
from pathlib import Path
from typing import Any, Optional, TYPE_CHECKING
from urllib.parse import parse_qsl, quote, unquote, urlencode, urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup
from dotenv import load_dotenv
from playwright.sync_api import Browser, BrowserContext, Page, Playwright, sync_playwright

if TYPE_CHECKING:
    from supabase import Client

try:
    from config import get_manufacturer_tier, normalize_manufacturer
    from description_parser import parse_description
    from env_check import env_check
    from media_refresh_utils import apply_media_update, fetch_refresh_rows, load_source_ids_file, seen_within_hours
    from schema import validate_listing
    from scraper_base import safe_upsert_with_fallback, setup_logging, get_supabase
except ImportError:  # pragma: no cover
    try:
        from .config import get_manufacturer_tier, normalize_manufacturer
        from .description_parser import parse_description
        from .env_check import env_check
        from .media_refresh_utils import apply_media_update, fetch_refresh_rows, load_source_ids_file, seen_within_hours
        from .schema import validate_listing
        from .scraper_base import safe_upsert_with_fallback, setup_logging, get_supabase
    except ImportError:
        # Keep media-refresh workflows runnable even if manufacturer config is unavailable.
        from .description_parser import parse_description
        from .env_check import env_check
        from .media_refresh_utils import apply_media_update, fetch_refresh_rows, load_source_ids_file, seen_within_hours
        from .schema import validate_listing
        from .scraper_base import safe_upsert_with_fallback, setup_logging, get_supabase

        def normalize_manufacturer(value: Any) -> str:
            return str(value or "").strip()

        def get_manufacturer_tier(_: Any) -> None:
            return None

load_dotenv()

log = logging.getLogger(__name__)

BASE_URL = "https://www.aerotrader.com"
DEFAULT_SEARCH_ZIP = "83854"
DEFAULT_SEARCH_RADIUS = "10000"
LISTINGS_PER_PAGE = 25
SOURCE_SITE = "aerotrader"
CHECKPOINT_FILE = Path("scraper/state/aerotrader_checkpoint.json")
KNOWN_TYPE_QUERIES = {
    "single-engine-prop": "Single Engine Prop|5976093",
    "single engine prop": "Single Engine Prop|5976093",
    "multi-engine-prop": "Multi Engine Prop|5976097",
    "multi engine prop": "Multi Engine Prop|5976097",
    "helicopter": "Helicopter|5976153",
    "jet": "Jet|5976107",
    "turbo-prop": "Turbo Prop|113398242",
    "turbo prop": "Turbo Prop|113398242",
    "experimental-homebuilt": "Experimental/Homebuilt|5976145",
    "experimental/homebuilt": "Experimental/Homebuilt|5976145",
    "war-plane": "War Plane|5976127",
    "war plane": "War Plane|5976127",
}


def _build_browser(headless: bool) -> tuple[Playwright, Browser, BrowserContext, Page]:
    playwright = sync_playwright().start()
    browser = playwright.chromium.launch(
        headless=headless,
        args=[
            "--no-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
        ],
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
    context.add_init_script(
        """
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins',   { get: () => [1, 2, 3] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        """
    )
    page = context.new_page()
    return playwright, browser, context, page


def _close_browser(playwright: Playwright, browser: Browser, context: BrowserContext, page: Page) -> None:
    try:
        page.close()
    except Exception:
        pass
    try:
        context.close()
    except Exception:
        pass
    try:
        browser.close()
    except Exception:
        pass
    try:
        playwright.stop()
    except Exception:
        pass


def _compute_backoff(attempt: int, base_delay: float = 8.0, max_delay: float = 120.0) -> float:
    delay = base_delay * (2**attempt)
    jitter = random.uniform(0, delay * 0.3)
    return min(delay + jitter, max_delay)


def _resolve_search_context(search_zip: str | None, search_radius: str | None) -> tuple[str, str]:
    resolved_zip = str(search_zip or os.getenv("AEROTRADER_SEARCH_ZIP") or DEFAULT_SEARCH_ZIP).strip()
    resolved_radius = str(search_radius or os.getenv("AEROTRADER_SEARCH_RADIUS") or DEFAULT_SEARCH_RADIUS).strip()
    if not resolved_zip:
        resolved_zip = DEFAULT_SEARCH_ZIP
    if not resolved_radius:
        resolved_radius = DEFAULT_SEARCH_RADIUS
    return resolved_zip, resolved_radius


def _with_search_context(url: str, *, search_zip: str, search_radius: str) -> str:
    parsed = urlparse(url)
    pairs = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True) if k.lower() not in {"zip", "radius"}]
    pairs.extend([("zip", search_zip), ("radius", search_radius)])
    return urlunparse(parsed._replace(query=urlencode(pairs, doseq=True)))


def _make_discovery_urls(search_zip: str, search_radius: str) -> tuple[str, str]:
    browse = _with_search_context(f"{BASE_URL}/aircraft-for-sale", search_zip=search_zip, search_radius=search_radius)
    view = _with_search_context(f"{BASE_URL}/aircraft-for-sale/make", search_zip=search_zip, search_radius=search_radius)
    return browse, view


def _looks_like_challenge_html(html_text: str) -> bool:
    return bool(looks_like_challenge_html(html_text))


def _fetch_page_soup(page: Page, url: str, label: str = "", max_retries: int = 5) -> Optional[BeautifulSoup]:
    for attempt in range(max_retries):
        try:
            response = page.goto(url, wait_until="domcontentloaded", timeout=40000)
            status = response.status if response else None
            if status == 200:
                html_text = page.content()
                if _looks_like_challenge_html(html_text):
                    wait = _compute_backoff(attempt)
                    log.warning(
                        "[%s] Challenge-like HTML detected on HTTP 200; waiting %.1fs before retry.",
                        label or "fetch",
                        wait,
                    )
                    time.sleep(wait)
                    continue
                return BeautifulSoup(html_text, "html.parser")
            if status in (403, 429, 503):
                wait = _compute_backoff(attempt)
                log.warning("[%s] HTTP %s blocked/challenged; waiting %.1fs", label or "fetch", status, wait)
                time.sleep(wait)
                continue
            log.warning("[%s] HTTP %s for %s", label or "fetch", status, url)
            return None
        except Exception as exc:
            wait = _compute_backoff(attempt)
            log.warning("[%s] Fetch error (%s); waiting %.1fs", label or "fetch", exc, wait)
            time.sleep(wait)
    return None


def _extract_make_links(soup: BeautifulSoup, *, search_zip: str, search_radius: str) -> list[dict[str, str]]:
    makes: list[dict[str, str]] = []
    seen: set[str] = set()
    for anchor in soup.find_all("a", href=True):
        href = anchor["href"]
        match = re.search(r"[?&]make=([^|%&]+)[|%7C]+(\d+)", href, flags=re.I)
        if not match:
            continue
        raw_name = unquote(match.group(1)).strip()
        make_id = match.group(2).strip()
        if not raw_name or not make_id:
            continue
        key = raw_name.lower()
        if key in seen:
            continue
        seen.add(key)
        make_url = _with_search_context(
            f"{BASE_URL}/{raw_name}/aircraft-for-sale?make={quote(raw_name, safe='')}%7C{make_id}",
            search_zip=search_zip,
            search_radius=search_radius,
        )
        makes.append({"name": raw_name, "id": make_id, "url": make_url})
    return makes


def _build_seed_make_infos(seed_urls: list[str], *, search_zip: str, search_radius: str) -> list[dict[str, str]]:
    infos: list[dict[str, str]] = []
    seen_urls: set[str] = set()
    for idx, raw_url in enumerate(seed_urls, start=1):
        normalized = _with_search_context(str(raw_url).strip(), search_zip=search_zip, search_radius=search_radius)
        if not normalized or normalized in seen_urls:
            continue
        seen_urls.add(normalized)
        parsed = urlparse(normalized)
        params = dict(parse_qsl(parsed.query, keep_blank_values=True))
        label = (
            params.get("make")
            or params.get("type")
            or Path(parsed.path).name
            or f"seed-{idx}"
        )
        infos.append({"name": str(label), "id": "", "url": normalized})
    return infos


def discover_makes(
    page: Page,
    *,
    search_zip: str,
    search_radius: str,
    seed_urls: Optional[list[str]] = None,
) -> list[dict[str, str]]:
    makes_browse_url, makes_view_url = _make_discovery_urls(search_zip, search_radius)

    soup = _fetch_page_soup(page, makes_view_url, label="makes-view")
    makes = _extract_make_links(soup, search_zip=search_zip, search_radius=search_radius) if soup else []
    if makes:
        log.info("Discovered %s makes via view page", len(makes))
        return makes

    soup = _fetch_page_soup(page, makes_browse_url, label="makes-browse")
    makes = _extract_make_links(soup, search_zip=search_zip, search_radius=search_radius) if soup else []
    log.info("Discovered %s makes via browse page", len(makes))
    if makes:
        return makes
    if seed_urls:
        fallback = _build_seed_make_infos(seed_urls, search_zip=search_zip, search_radius=search_radius)
        if fallback:
            log.warning(
                "Make discovery unavailable; using %s fallback seed URL(s).",
                len(fallback),
            )
            return fallback
    return makes


def _parse_total_count(soup: BeautifulSoup) -> Optional[int]:
    text = soup.get_text(" ", strip=True)
    for pattern in (
        r"(\d[\d,]*)\s+(?:aircraft|listings?)\s+for\s+sale",
        r"(\d[\d,]*)\s+(?:aircraft|listings?)\s+found",
        r"(\d[\d,]*)\s+results?",
    ):
        match = re.search(pattern, text, flags=re.I)
        if match:
            return int(match.group(1).replace(",", ""))
    return None


def _get_cards(soup: BeautifulSoup) -> list[Any]:
    cards = [
        article
        for article in soup.find_all("article")
        if re.fullmatch(r"\d{7,12}", str(article.get("data-ad-id") or "").strip())
    ]
    if cards:
        return cards
    cards = [article for article in soup.find_all("article") if re.search(r"\d{7,}", article.get("id", ""))]
    if cards:
        return cards
    return soup.find_all("article", class_=re.compile(r"search-card", flags=re.I))


def _build_page_url(make_url: str, page: int) -> str:
    if page <= 1:
        return make_url
    separator = "&" if "?" in make_url else "?"
    return f"{make_url}{separator}page={page}"


def _build_make_info_from_arg(raw_make: str, *, search_zip: str, search_radius: str) -> dict[str, str]:
    """
    Support --make values in two formats:
      1) "Cessna"
      2) "Cessna|2237190" (explicit AeroTrader make id)
    """
    raw = str(raw_make or "").strip()
    if not raw:
        return {"name": "", "id": "", "url": ""}
    if "|" in raw:
        name, make_id = raw.split("|", 1)
        safe_name = name.strip()
        safe_id = make_id.strip()
        encoded_name = quote(safe_name, safe="")
        return {
            "name": safe_name,
            "id": safe_id,
            "url": _with_search_context(
                f"{BASE_URL}/{safe_name}/aircraft-for-sale?make={encoded_name}%7C{safe_id}",
                search_zip=search_zip,
                search_radius=search_radius,
            ),
        }
    return {
        "name": raw,
        "id": "",
        "url": _with_search_context(
            f"{BASE_URL}/{raw}/aircraft-for-sale?make={quote(raw, safe='')}",
            search_zip=search_zip,
            search_radius=search_radius,
        ),
    }


def _build_type_seed_urls(
    raw_types: list[str],
    *,
    search_zip: str,
    search_radius: str,
) -> list[str]:
    seed_urls: list[str] = []
    seen_urls: set[str] = set()
    tokens: list[str] = []
    for raw in raw_types:
        parts = [chunk.strip() for chunk in str(raw or "").split(",")]
        tokens.extend([chunk for chunk in parts if chunk])
    for token in tokens:
        norm = re.sub(r"[\s_]+", "-", token.strip().lower())
        type_query = KNOWN_TYPE_QUERIES.get(norm) or KNOWN_TYPE_QUERIES.get(token.strip().lower()) or token.strip()
        url = _with_search_context(
            f"{BASE_URL}/aircraft-for-sale?{urlencode({'type': type_query})}",
            search_zip=search_zip,
            search_radius=search_radius,
        )
        if url in seen_urls:
            continue
        seen_urls.add(url)
        seed_urls.append(url)
    return seed_urls


def _parse_hours(text: str) -> dict[str, int]:
    output: dict[str, int] = {}
    patterns = {
        "total_time_airframe": (
            r"TTAF[\s:]*(\d[\d,]+)",
            r"TTSN[\s:]*(\d[\d,]+)",
            r"\b(\d[\d,]+)\s*TT\b",
            r"TOTAL[\s\-]*TIME[\s:]*(\d[\d,]+)",
        ),
        "engine_time_since_overhaul": (
            r"SMOH[\s:]*(\d[\d,]+)",
            r"SRAM[\s:]*(\d[\d,]+)",
            r"SINCE[\s]+(?:MAJOR[\s]+)?OVERHAUL[\s:]*(\d[\d,]+)",
        ),
        "time_since_prop_overhaul": (
            r"SPOH[\s:]*(\d[\d,]+)",
            r"SINCE[\s]+PROP(?:ELLER)?[\s]+OVERHAUL[\s:]*(\d[\d,]+)",
        ),
    }
    for key, rule_list in patterns.items():
        for rule in rule_list:
            match = re.search(rule, text, flags=re.I)
            if not match:
                continue
            try:
                value = int(match.group(1).replace(",", ""))
            except ValueError:
                continue
            if 0 <= value <= 100000:
                output[key] = value
                break
    return output


def _infer_aircraft_type(text: str) -> str:
    low = text.lower()
    if any(token in low for token in ("jet", "citation", "learjet", "gulfstream", "falcon")):
        return "jet"
    if any(token in low for token in ("turboprop", "pt6", "tpe331", "king air", "tbm", "pc-12")):
        return "turboprop"
    if any(token in low for token in ("helicopter", "robinson", "bell 206", "r22", "r44")):
        return "helicopter"
    if any(token in low for token in ("multi", "twin", "baron", "seneca", "aztec", "seminole", "310", "414")):
        return "multi_engine_piston"
    return "single_engine_piston"


def _clean_card_description(text: str | None) -> Optional[str]:
    if not text:
        return None
    cleaned = html_module.unescape(text)
    cleaned = re.sub(r"\bFeatured\b", " ", cleaned, flags=re.I)
    cleaned = re.sub(r"\bSee\s+More\b", " ", cleaned, flags=re.I)
    cleaned = re.sub(r"\bPrivate\s+Seller\b", " ", cleaned, flags=re.I)
    cleaned = re.sub(r"\b\d{1,4}(?:,\d{3})?\s+mi\s+away\b", " ", cleaned, flags=re.I)
    cleaned = re.sub(r"\$\s*\d[\d,]*", " ", cleaned)
    cleaned = re.sub(r"\bOBO\b", " ", cleaned, flags=re.I)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -,:")
    if len(cleaned) < 12:
        return None
    return cleaned[:1000]


def _extract_engine_model(upper_text: str) -> Optional[str]:
    """
    Extract canonical engine model tokens only.
    Avoid broad phrase matches like "Lycoming Power".
    """
    strict_patterns = (
        r"\b(TSIO-\d{3}[A-Z0-9\-]*)\b",
        r"\b(IO-\d{3}[A-Z0-9\-]*)\b",
        r"\b(O-\d{3}[A-Z0-9\-]*)\b",
        r"\b(PT6A-\d+[A-Z0-9\-]*)\b",
        r"\b(TPE331-\d+[A-Z0-9\-]*)\b",
        r"\b(ROTAX\s+\d{3,4}[A-Z0-9\-]*)\b",
        r"\b(LYCOMING\s+(?:IO|O|AEIO|TIO|TO|HIO|IGO)-\d{3}[A-Z0-9\-]*)\b",
        r"\b(CONTINENTAL\s+(?:IO|O|TSIO|TIO|GO)-\d{3}[A-Z0-9\-]*)\b",
    )
    for pattern in strict_patterns:
        match = re.search(pattern, upper_text)
        if match:
            return match.group(1).strip().title()
    return None


def _is_plausible_serial(candidate: str | None) -> bool:
    if not candidate:
        return False
    value = str(candidate).strip().upper()
    if len(value) < 3 or len(value) > 16:
        return False
    if re.search(r"[^A-Z0-9\-]", value):
        return False
    if not re.search(r"\d", value):
        return False
    # Reject common site chrome noise seen on AeroTrader pages.
    if any(token in value for token in ("MOBILE", "SHOWMOBILE", "OWMOBILE")):
        return False
    return True


def _normalize_state_code(value: str | None) -> Optional[str]:
    if not value:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    upper = raw.upper()
    if re.fullmatch(r"[A-Z]{2}", upper):
        return upper

    state_map = {
        "ALABAMA": "AL",
        "ALASKA": "AK",
        "ARIZONA": "AZ",
        "ARKANSAS": "AR",
        "CALIFORNIA": "CA",
        "COLORADO": "CO",
        "CONNECTICUT": "CT",
        "DELAWARE": "DE",
        "DISTRICT OF COLUMBIA": "DC",
        "FLORIDA": "FL",
        "GEORGIA": "GA",
        "HAWAII": "HI",
        "IDAHO": "ID",
        "ILLINOIS": "IL",
        "INDIANA": "IN",
        "IOWA": "IA",
        "KANSAS": "KS",
        "KENTUCKY": "KY",
        "LOUISIANA": "LA",
        "MAINE": "ME",
        "MARYLAND": "MD",
        "MASSACHUSETTS": "MA",
        "MICHIGAN": "MI",
        "MINNESOTA": "MN",
        "MISSISSIPPI": "MS",
        "MISSOURI": "MO",
        "MONTANA": "MT",
        "NEBRASKA": "NE",
        "NEVADA": "NV",
        "NEW HAMPSHIRE": "NH",
        "NEW JERSEY": "NJ",
        "NEW MEXICO": "NM",
        "NEW YORK": "NY",
        "NORTH CAROLINA": "NC",
        "NORTH DAKOTA": "ND",
        "OHIO": "OH",
        "OKLAHOMA": "OK",
        "OREGON": "OR",
        "PENNSYLVANIA": "PA",
        "RHODE ISLAND": "RI",
        "SOUTH CAROLINA": "SC",
        "SOUTH DAKOTA": "SD",
        "TENNESSEE": "TN",
        "TEXAS": "TX",
        "UTAH": "UT",
        "VERMONT": "VT",
        "VIRGINIA": "VA",
        "WASHINGTON": "WA",
        "WEST VIRGINIA": "WV",
        "WISCONSIN": "WI",
        "WYOMING": "WY",
    }
    return state_map.get(upper)


def _normalize_space(value: str | None) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _clean_city_value(value: str | None) -> Optional[str]:
    city = _normalize_space(value)
    if not city:
        return None
    city = re.sub(r".*View\s+Details[^-]*-\s*", "", city, flags=re.I)
    city = re.sub(r".*\.\.\.\s*", "", city)
    city = _normalize_space(city)
    if len(city) < 2:
        return None
    if re.fullmatch(r"[A-Za-z]{2}", city):
        if _normalize_state_code(city.upper()):
            return None
    return city.title()


def _is_noisy_make_or_model(value: str | None) -> bool:
    text = _normalize_space(value).upper()
    if not text:
        return True
    noisy_tokens = ("FEATURED", "SEE MORE", "PRIVATE SELLER", " MI AWAY")
    if any(token in text for token in noisy_tokens):
        return True
    if "$" in text:
        return True
    return False


def parse_card_from_article(article: Any) -> Optional[dict[str, Any]]:
    source_id = (article.get("data-ad-id") or "").strip()
    if not source_id:
        id_attr = article.get("id", "")
        id_match = re.search(r"(\d{7,})", id_attr)
        source_id = id_match.group(1) if id_match else ""
    if not source_id or not re.fullmatch(r"\d{7,12}", source_id):
        return None

    dlr_url = (article.get("data-dlr-url") or "").strip()
    if not dlr_url:
        link = article.find("a", href=re.compile(r"/listing/"))
        dlr_url = link.get("href", "") if link else ""
    detail_path = dlr_url.split("#")[0]
    sid_match = re.search(r"#sid=(\d+)", dlr_url)
    sid = sid_match.group(1) if sid_match else ""
    url = urljoin(BASE_URL, detail_path)
    if sid:
        url = f"{url}?sid={sid}"

    make = (article.get("data-make-ymm") or article.get("data-ad-make") or "").strip()
    model = (article.get("data-ad-model") or "").strip()
    if _is_noisy_make_or_model(make):
        make = ""
    if _is_noisy_make_or_model(model):
        model = ""
    year_raw = (article.get("data-ad-year") or "").strip()
    price_raw = (article.get("data-ad-price") or "").strip()
    location_raw = (article.get("data-ad-location") or "").strip()
    condition = (article.get("data-ad-condition") or "used").strip().lower()

    asking_price: Optional[int] = int(price_raw) if price_raw.isdigit() else None

    year: Optional[int] = int(year_raw) if re.match(r"^\d{4}$", year_raw) else None
    if not year:
        year_match = re.search(r"/listing/(\d{4})-", detail_path)
        year = int(year_match.group(1)) if year_match else None

    listing_link = article.find("a", href=re.compile(r"/listing/"))
    listing_title_text = _normalize_space(listing_link.get_text(" ", strip=True) if listing_link else "")
    noisy_tokens = ("FEATURED", "SEE MORE", "PRIVATE SELLER", " MI AWAY")
    is_noisy_title = any(token in listing_title_text.upper() for token in noisy_tokens) or "$" in listing_title_text
    if listing_title_text and not is_noisy_title and (not make or not model):
        title_match = re.match(
            r"^(?:(?P<year>19\d{2}|20\d{2})\s+)?(?P<make>[A-Za-z0-9]+)\s+(?P<model>.+)$",
            listing_title_text,
            flags=re.I,
        )
        if title_match:
            if not year and title_match.group("year"):
                try:
                    year = int(title_match.group("year"))
                except ValueError:
                    pass
            if not make:
                make = title_match.group("make")
            if not model:
                model = title_match.group("model")

    # Fallback from URL slug: /listing/1964-Cessna-172-5038176592
    if not make or not model:
        slug = urlparse(url).path.rsplit("/", 1)[-1]
        slug_match = re.match(r"(?P<year>\d{4})-(?P<make>[A-Za-z0-9]+)-(?P<model>.+)-\d{6,12}$", slug)
        if slug_match:
            if not year:
                try:
                    year = int(slug_match.group("year"))
                except ValueError:
                    pass
            if not make:
                make = slug_match.group("make")
            if not model:
                model = slug_match.group("model").replace("-", " ")

    location_city: Optional[str] = None
    location_state: Optional[str] = None
    if location_raw:
        loc_match = re.search(r"^(.*?),\s*([A-Z]{2})\s*$", location_raw, flags=re.I)
        if loc_match:
            location_city = _clean_city_value(loc_match.group(1))
            location_state = loc_match.group(2).upper()

    card_text = article.get_text(" ", strip=True)
    if asking_price is None and card_text:
        price_match = re.search(r"\$\s*([\d,]{3,12})", card_text)
        if price_match:
            try:
                asking_price = int(price_match.group(1).replace(",", ""))
            except ValueError:
                pass

    if (location_city is None or location_state is None) and card_text:
        card_loc_match = re.search(r"\b([A-Za-z .'-]{2,}),\s*([A-Z]{2})\b", card_text)
        if card_loc_match:
            location_city = location_city or _clean_city_value(card_loc_match.group(1))
            location_state = location_state or card_loc_match.group(2).upper()

    title = f"{year or ''} {make} {model}".strip()

    seller_name: Optional[str] = None
    seller_type = "private"
    dealer_el = article.find(class_=re.compile(r"dealer-wrapper", flags=re.I))
    if dealer_el:
        seller_name = dealer_el.get_text(strip=True)[:200]
        seller_upper = seller_name.upper()
        if seller_upper != "PRIVATE SELLER" and any(
            token in seller_upper for token in ("LLC", "INC", "CORP", "AVIATION", "SALES", "AIRCRAFT", "JETS")
        ):
            seller_type = "dealer"

    description: Optional[str] = None
    content_el = article.find(class_="content-wrapper")
    if content_el:
        description = _clean_card_description(content_el.get_text(separator=" ", strip=True))
    if not description and card_text:
        compact = re.sub(r"\s+", " ", card_text).strip()
        description = _clean_card_description(compact)

    image_url: Optional[str] = None
    image_el = article.find("img")
    if image_el:
        src = image_el.get("data-src") or image_el.get("src") or ""
        if src.startswith("http") and "coming-soon" not in src and "undefined.webp" not in src.lower():
            image_url = src

    parsed = {
        "source_site": SOURCE_SITE,
        "listing_source": SOURCE_SITE,
        "source_id": str(source_id),
        "source_listing_id": str(source_id),
        "url": url,
        "title": title or None,
        "year": year,
        "make": make.title() if make else None,
        "model": model.upper() if model else None,
        "aircraft_type": _infer_aircraft_type(f"{make} {model}"),
        "price_asking": asking_price,
        "asking_price": asking_price,
        "condition": condition,
        "location_city": location_city,
        "location_state": location_state,
        "seller_name": seller_name,
        "seller_type": seller_type,
        "primary_image_url": image_url,
        "description": description,
    }
    parsed.update(_parse_hours((description or "").upper()))
    return parsed


def parse_detail_page(soup: BeautifulSoup, listing: dict[str, Any]) -> dict[str, Any]:
    try:
        desc_el = soup.select_one("div.dealer-description.clearBoth") or soup.find(
            "div", class_=lambda c: bool(c) and "dealer-description" in c
        )
        if desc_el:
            listing["description_full"] = html_module.unescape(desc_el.get_text(separator="\n", strip=True)[:7000])
            if not listing.get("description"):
                listing["description"] = html_module.unescape(desc_el.get_text(separator=" ", strip=True)[:2000])

        full_text = soup.get_text(" ", strip=True)
        upper_text = full_text.upper()

        if not listing.get("n_number"):
            n_match = re.search(r"\b(N\d{1,5}[A-Z]{0,2})\b", upper_text)
            if n_match:
                listing["n_number"] = n_match.group(1).upper()

        if not listing.get("serial_number"):
            for pattern in (
                r"S/?N[\s:#]*((?=[A-Z0-9\-]*\d)[A-Z0-9\-]{3,16})",
                r"SERIAL[\s#:]*(?:NO\.?|NUMBER)?[\s:#]*((?=[A-Z0-9\-]*\d)[A-Z0-9\-]{3,16})",
            ):
                serial_match = re.search(pattern, upper_text)
                if serial_match:
                    candidate = serial_match.group(1).upper().strip()
                    if _is_plausible_serial(candidate):
                        listing["serial_number"] = candidate
                        break

        engine_model = _extract_engine_model(upper_text)
        if engine_model:
            listing["engine_model"] = engine_model

        parsed_hours = _parse_hours(upper_text)
        for key, value in parsed_hours.items():
            if listing.get(key) in (None, "", 0):
                listing[key] = value

        av_keywords = [
            "G1000",
            "G500",
            "G600",
            "GTN 750",
            "GTN 650",
            "GFC 500",
            "WAAS",
            "ADS-B",
            "GARMIN",
            "ASPEN",
            "DYNON",
            "AVIDYNE",
            "AUTOPILOT",
            "G3X",
            "S-TEC",
        ]
        found = [item for item in av_keywords if item in upper_text]
        if found:
            listing["avionics_description"] = ", ".join(found[:12])

        location_el = soup.find("div", class_=re.compile(r"location-wrapper", flags=re.I))
        if location_el:
            location_text = location_el.get_text(strip=True)
            location_match = re.search(r"^(.*?),\s*([A-Z]{2})\s*$", location_text, flags=re.I)
            if location_match:
                cleaned_city = _clean_city_value(location_match.group(1))
                if cleaned_city:
                    listing["location_city"] = cleaned_city
                listing["location_state"] = location_match.group(2).upper()
            else:
                location_name_match = re.search(r"^(.*?),\s*([A-Za-z ]{4,})\s*$", location_text, flags=re.I)
                if location_name_match:
                    state_code = _normalize_state_code(location_name_match.group(2))
                    if state_code:
                        cleaned_city = _clean_city_value(location_name_match.group(1))
                        if cleaned_city:
                            listing["location_city"] = cleaned_city
                        listing["location_state"] = state_code
        elif listing.get("location_city") in (None, "") or listing.get("location_state") in (None, ""):
            text_location = re.search(
                r"Aircraft\s+Location\s*:?\s*([A-Za-z .'-]+),\s*([A-Z]{2})\b",
                full_text,
                flags=re.I,
            )
            if text_location:
                cleaned_city = _clean_city_value(text_location.group(1))
                if cleaned_city:
                    listing["location_city"] = cleaned_city
                listing["location_state"] = text_location.group(2).upper()
        if listing.get("location_city") in (None, "") or listing.get("location_state") in (None, ""):
            generic_loc = re.search(r"\bin\s+([A-Za-z .'-]+),\s*([A-Z]{2})\b", full_text, flags=re.I)
            if generic_loc:
                cleaned_city = _clean_city_value(generic_loc.group(1))
                if cleaned_city and not listing.get("location_city"):
                    listing["location_city"] = cleaned_city
                listing["location_state"] = listing.get("location_state") or generic_loc.group(2).upper()
        if listing.get("location_city") in (None, "") or listing.get("location_state") in (None, ""):
            for script_tag in soup.select("script[type='application/ld+json']"):
                script_text = (script_tag.string or script_tag.get_text() or "").strip()
                if not script_text:
                    continue
                try:
                    payload = json.loads(script_text)
                except Exception:
                    continue
                candidates = payload if isinstance(payload, list) else [payload]
                for item in candidates:
                    if not isinstance(item, dict):
                        continue
                    address = item.get("address") if isinstance(item.get("address"), dict) else {}
                    city = address.get("addressLocality")
                    state = address.get("addressRegion")
                    if city and not listing.get("location_city"):
                        cleaned_city = _clean_city_value(str(city))
                        if cleaned_city:
                            listing["location_city"] = cleaned_city
                    if state and not listing.get("location_state"):
                        state_code = _normalize_state_code(str(state))
                        if state_code:
                            listing["location_state"] = state_code
                    if listing.get("location_city") and listing.get("location_state"):
                        break
                if listing.get("location_city") and listing.get("location_state"):
                    break

        days_match = re.search(r"(\d+)\s+days?\s+listed", upper_text, flags=re.I)
        if days_match:
            listing["days_on_market"] = int(days_match.group(1))

        photos: list[str] = []
        seen: set[str] = set()
        gallery = soup.find(id="Gallery") or soup.find(class_=re.compile(r"gallery|rsDefault", flags=re.I))
        if gallery:
            for image in gallery.find_all("img"):
                src = image.get("data-src") or image.get("src") or ""
                if not src.startswith("http"):
                    continue
                if "coming-soon" in src:
                    continue
                low_src = src.lower()
                if low_src.endswith(".svg") or "/ic_" in low_src:
                    continue
                if src in seen:
                    continue
                seen.add(src)
                photos.append(src)
        if not photos:
            for image in soup.select("img[src], img[data-src]"):
                src = image.get("data-src") or image.get("src") or ""
                if not src.startswith("http"):
                    continue
                low_src = src.lower()
                if "coming-soon" in low_src or "undefined.webp" in low_src:
                    continue
                if low_src.endswith(".svg") or "/ic_" in low_src:
                    continue
                if any(token in low_src for token in ("logo", "icon", "sprite", "placeholder")):
                    continue
                if src in seen:
                    continue
                seen.add(src)
                photos.append(src)
        if photos:
            listing["image_urls"] = photos[:20]
            if not listing.get("primary_image_url"):
                listing["primary_image_url"] = photos[0]
    except Exception as exc:
        log.warning("Detail parse error source_id=%s err=%s", listing.get("source_id"), exc)
    return listing


def load_checkpoint(checkpoint_file: Path) -> Optional[dict[str, Any]]:
    if not checkpoint_file.exists():
        return None
    try:
        data = json.loads(checkpoint_file.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    except Exception as exc:
        log.warning("Failed to load checkpoint %s: %s", checkpoint_file, exc)
    return None


def save_checkpoint(checkpoint_file: Path, payload: dict[str, Any]) -> None:
    checkpoint_file.parent.mkdir(parents=True, exist_ok=True)
    checkpoint_file.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")


def clear_checkpoint(checkpoint_file: Path) -> None:
    if checkpoint_file.exists():
        checkpoint_file.unlink(missing_ok=True)


def _fetch_existing_ids_for_make(supabase: "Client", make_name: str) -> int:
    try:
        resp = (
            supabase.table("aircraft_listings")
            .select("source_id", count="exact")
            .eq("source_site", SOURCE_SITE)
            .ilike("make", make_name)
            .execute()
        )
        return int(resp.count or 0)
    except Exception:
        return 0


def _fetch_existing_source_ids(supabase: "Client", source_ids: list[str]) -> set[str]:
    existing_ids: set[str] = set()
    if not source_ids:
        return existing_ids
    unique_source_ids = list(dict.fromkeys(source_ids))
    for idx in range(0, len(unique_source_ids), 200):
        chunk = unique_source_ids[idx : idx + 200]
        try:
            rows = (
                supabase.table("aircraft_listings")
                .select("source_id")
                .eq("source_site", SOURCE_SITE)
                .in_("source_id", chunk)
                .execute()
            )
            for row in rows.data or []:
                sid = row.get("source_id")
                if sid is not None:
                    existing_ids.add(str(sid))
        except Exception as exc:
            log.warning("[%s] Existing source-id lookup failed: %s", SOURCE_SITE, exc)
            break
    return existing_ids


def _upsert_listings(supabase: "Client", listings: list[dict[str, Any]]) -> int:
    if not listings:
        return 0

    today_iso = date.today().isoformat()
    source_ids = [str(item.get("source_id")) for item in listings if item.get("source_id")]
    existing_by_source_id: dict[str, dict[str, Any]] = {}

    if source_ids:
        unique_source_ids = list(dict.fromkeys(source_ids))
        for idx in range(0, len(unique_source_ids), 200):
            chunk = unique_source_ids[idx : idx + 200]
            rows = (
                supabase.table("aircraft_listings")
                .select("source_id,first_seen_date,price_asking,asking_price")
                .eq("source_site", SOURCE_SITE)
                .in_("source_id", chunk)
                .execute()
            )
            for row in rows.data or []:
                sid = row.get("source_id")
                if sid is not None:
                    existing_by_source_id[str(sid)] = row

    out_rows: list[dict[str, Any]] = []
    obs_rows: list[dict[str, Any]] = []
    for raw in listings:
        parser_text = f"{raw.get('description') or ''} {raw.get('description_full') or ''}".strip()
        if parser_text:
            parsed = parse_description(parser_text)
            raw["description_intelligence"] = parsed
            parsed_smoh = parsed.get("times", {}).get("engine_smoh")
            if raw.get("engine_time_since_overhaul") in (None, "", 0) and isinstance(parsed_smoh, int):
                raw["engine_time_since_overhaul"] = parsed_smoh
            parsed_tt = parsed.get("times", {}).get("total_time")
            if raw.get("total_time_airframe") in (None, "", 0) and isinstance(parsed_tt, int):
                raw["total_time_airframe"] = parsed_tt

        row, warnings = validate_listing(raw)
        if warnings:
            log.warning("Skipping invalid listing %s: %s", raw.get("source_id"), "; ".join(warnings))
            continue

        row["source_site"] = SOURCE_SITE
        row["listing_source"] = SOURCE_SITE
        normalized_make = normalize_manufacturer(str(row.get("make") or ""))
        if normalized_make:
            row["make"] = normalized_make
        tier = get_manufacturer_tier(row.get("make"))
        if tier is not None:
            row["manufacturer_tier"] = tier
        if row.get("price_asking") is not None and row.get("asking_price") is None:
            row["asking_price"] = row["price_asking"]
        if row.get("asking_price") is not None and row.get("price_asking") is None:
            row["price_asking"] = row["asking_price"]

        row["last_seen_date"] = today_iso
        row["is_active"] = True
        row["inactive_date"] = None
        existing = existing_by_source_id.get(str(row.get("source_id") or ""))
        row["first_seen_date"] = today_iso if not existing else existing.get("first_seen_date")

        if row.get("image_urls") is not None and not isinstance(row.get("image_urls"), list):
            row["image_urls"] = [str(row.get("image_urls"))]

        out_rows.append(row)
        obs_rows.append(
            {
                "source_site": SOURCE_SITE,
                "source_id": str(row.get("source_id")),
                "observed_on": today_iso,
                "observed_at": f"{today_iso}T00:00:00Z",
                "asking_price": row.get("price_asking") if row.get("price_asking") is not None else row.get("asking_price"),
                "url": row.get("url"),
                "title": row.get("title"),
                "listing_fingerprint": row.get("listing_fingerprint"),
                "is_active": True,
            }
        )

    if not out_rows:
        return 0

    all_keys: set[str] = set()
    for row in out_rows:
        all_keys.update(row.keys())
    for row in out_rows:
        for key in all_keys:
            row.setdefault(key, None)

    candidate_rows = out_rows
    for _ in range(3):
        try:
            saved = safe_upsert_with_fallback(
                supabase=supabase,
                table="aircraft_listings",
                rows=candidate_rows,
                on_conflict="source_site,source_id",
                fallback_match_keys=["source_site", "source_id"],
                logger=log,
            )
            break
        except Exception as exc:
            message = str(exc)
            missing_match = re.search(r"Could not find the '([^']+)' column", message)
            if not missing_match:
                raise
            missing_col = missing_match.group(1)
            log.warning("[%s] Missing DB column '%s'; dropping from payload and retrying.", SOURCE_SITE, missing_col)
            for row in candidate_rows:
                row.pop(missing_col, None)
    else:
        raise RuntimeError("Upsert retries exhausted due to missing columns.")
    if obs_rows:
        try:
            supabase.table("listing_observations").upsert(
                obs_rows,
                on_conflict="source_site,source_id,observed_on",
            ).execute()
        except Exception as exc:
            log.warning("Observation upsert failed: %s", exc)
    return saved


def _mark_inactive_listings(supabase: "Client") -> int:
    today_iso = date.today().isoformat()
    try:
        resp = (
            supabase.table("aircraft_listings")
            .update({"is_active": False, "inactive_date": today_iso})
            .eq("source_site", SOURCE_SITE)
            .lt("last_seen_date", today_iso)
            .eq("is_active", True)
            .execute()
        )
        return len(resp.data or [])
    except Exception as exc:
        log.warning("[%s] mark inactive failed: %s", SOURCE_SITE, exc)
        return 0


def _print_listing(listing: dict[str, Any]) -> None:
    print(json.dumps(listing, indent=2, ensure_ascii=True))


def run_media_refresh_mode(
    *,
    page: Page,
    supabase: "Client",
    source_ids_file: str | None,
    limit: int | None,
    dry_run: bool,
    ignore_detail_stale: bool,
) -> None:
    source_ids = load_source_ids_file(source_ids_file)
    candidates = fetch_refresh_rows(
        supabase,
        source_site=SOURCE_SITE,
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
        if not ignore_detail_stale and seen_within_hours(row.get("last_seen_date"), 48):
            continue
        scanned += 1
        detail_soup = _fetch_page_soup(page, detail_url, label="media-refresh-detail")
        if not detail_soup:
            continue
        refreshed = parse_detail_page(detail_soup, {"source_id": source_id, "url": detail_url})
        image_urls = refreshed.get("image_urls") if isinstance(refreshed.get("image_urls"), list) else []
        primary_image_url = str(refreshed.get("primary_image_url") or "").strip() or (image_urls[0] if image_urls else None)
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
            source_site=SOURCE_SITE,
            source_id=source_id,
            image_urls=image_urls,
            primary_image_url=primary_image_url,
        )
        updated += 1
    log.info(
        "[media-refresh] %s complete candidates=%s scanned=%s updated=%s dry_run=%s",
        SOURCE_SITE,
        len(candidates),
        scanned,
        updated,
        dry_run,
    )


def _scrape_make(
    page: Page,
    make_info: dict[str, str],
    fetch_details: bool,
    limit: Optional[int],
    dry_run: bool,
    supabase: Optional["Client"],
    output_list: list[dict[str, Any]],
    detail_delay_min: float = 0.0,
    detail_delay_max: float = 0.0,
    page_delay_min: float = 2.0,
    page_delay_max: float = 4.0,
    max_consecutive_zero_save_pages: int = 3,
    new_only: bool = False,
) -> int:
    make_name = make_info["name"]
    make_url = make_info["url"]
    log.info("[%s] Start scrape: %s", make_name, make_url)

    page_num = 1
    processed = 0
    seen_source_ids: set[str] = set()
    seen_page_signatures: set[tuple[str, ...]] = set()
    consecutive_zero_save_pages = 0
    while True:
        current_url = _build_page_url(make_url, page_num)
        soup = _fetch_page_soup(page, current_url, label=f"{make_name}-p{page_num}")
        if not soup:
            log.warning("[%s] Failed page %s", make_name, page_num)
            break

        if page_num == 1:
            total_count = _parse_total_count(soup)
            if total_count is not None:
                log.info("[%s] Total: %s aircraft", make_name, total_count)

        cards = _get_cards(soup)
        log.info("[%s] Page %s: %s cards", make_name, page_num, len(cards))
        if not cards:
            break

        page_rows: list[dict[str, Any]] = []
        page_card_ids: list[str] = []
        for card in cards:
            row = parse_card_from_article(card)
            if not row:
                continue
            sid = str(row.get("source_id") or "")
            if sid:
                page_card_ids.append(sid)
                if sid in seen_source_ids:
                    continue
                seen_source_ids.add(sid)
            page_rows.append(row)

        page_signature = tuple(sorted(set(page_card_ids)))
        if page_signature:
            if page_signature in seen_page_signatures:
                log.warning(
                    "[%s] Detected repeated pagination signature on page %s; stopping make to avoid no-op loop.",
                    make_name,
                    page_num,
                )
                break
            seen_page_signatures.add(page_signature)

        if new_only and supabase is not None and page_rows:
            page_source_ids = [str(row.get("source_id") or "") for row in page_rows if row.get("source_id")]
            existing_ids = _fetch_existing_source_ids(supabase, page_source_ids)
            if existing_ids:
                before = len(page_rows)
                page_rows = [row for row in page_rows if str(row.get("source_id") or "") not in existing_ids]
                skipped = before - len(page_rows)
                if skipped > 0:
                    log.info("[%s] New-only skip: %s existing rows on page %s", make_name, skipped, page_num)

        if limit is not None and processed < limit and page_rows:
            remaining = max(0, limit - processed)
            if len(page_rows) > remaining:
                page_rows = page_rows[:remaining]

        if fetch_details and page_rows:
            enriched_rows: list[dict[str, Any]] = []
            for row in page_rows:
                if row.get("url"):
                    detail_soup = _fetch_page_soup(page, str(row.get("url")), label=f"{make_name}-detail")
                    if detail_soup:
                        row = parse_detail_page(detail_soup, row)
                    if detail_delay_max > 0:
                        time.sleep(random.uniform(max(0.0, detail_delay_min), max(detail_delay_min, detail_delay_max)))
                enriched_rows.append(row)
            page_rows = enriched_rows

        processed += len(page_rows)

        if dry_run:
            for row in page_rows[:2]:
                _print_listing(row)
            saved = len(page_rows)
        else:
            saved = _upsert_listings(supabase, page_rows) if supabase else 0
            log.info("[%s] Saved %s/%s rows", make_name, saved, len(page_rows))

        if saved == 0:
            consecutive_zero_save_pages += 1
            if consecutive_zero_save_pages >= max(1, max_consecutive_zero_save_pages):
                log.warning(
                    "[%s] Hit %s consecutive zero-save pages; stopping make to avoid pagination loop.",
                    make_name,
                    consecutive_zero_save_pages,
                )
                break
        else:
            consecutive_zero_save_pages = 0

        output_list.extend(page_rows)
        if limit is not None and processed >= limit:
            break
        if len(cards) < LISTINGS_PER_PAGE:
            break

        page_num += 1
        if page_delay_max > 0:
            time.sleep(random.uniform(max(0.0, page_delay_min), max(page_delay_min, page_delay_max)))

    return processed


def main() -> None:
    parser = argparse.ArgumentParser(description="AeroTrader scraper aligned to Full Hangar conventions")
    parser.add_argument("--make", nargs="+", help="One or more makes to scrape")
    parser.add_argument("--types", nargs="+", help="Optional AeroTrader type filter(s), e.g. 'Jet|5976107' or 'jet'")
    parser.add_argument("--seed-url", nargs="+", help="Optional search URL(s) to use when make discovery is blocked")
    parser.add_argument("--search-zip", default=None, help=f"Search ZIP (default env AEROTRADER_SEARCH_ZIP or {DEFAULT_SEARCH_ZIP})")
    parser.add_argument(
        "--search-radius",
        default=None,
        help=f"Search radius miles (default env AEROTRADER_SEARCH_RADIUS or {DEFAULT_SEARCH_RADIUS}; 10000 behaves as nationwide)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Parse and print rows; do not write DB")
    parser.add_argument("--no-detail", action="store_true", help="Skip detail-page enrichment")
    parser.add_argument("--resume", action="store_true", help="Resume from checkpoint and/or skip already-scraped makes")
    parser.add_argument("--new-only", action="store_true", help="Only process listings not already captured in DB.")
    parser.add_argument("--headless", default="true", help="Headless browser mode (true/false)")
    parser.add_argument("--limit", type=int, default=None, help="Max listings per make")
    parser.add_argument("--detail-delay-min", type=float, default=0.0, help="Min seconds delay between detail fetches")
    parser.add_argument("--detail-delay-max", type=float, default=0.0, help="Max seconds delay between detail fetches")
    parser.add_argument("--page-delay-min", type=float, default=2.0, help="Min seconds delay between result pages")
    parser.add_argument("--page-delay-max", type=float, default=4.0, help="Max seconds delay between result pages")
    parser.add_argument(
        "--max-consecutive-zero-save-pages",
        type=int,
        default=3,
        help="Stop a make after this many consecutive pages with Saved 0/x (default: 3).",
    )
    parser.add_argument("--output", default="", help="Optional JSON output path")
    parser.add_argument(
        "--checkpoint-file",
        default=str(CHECKPOINT_FILE),
        help=f"Checkpoint file path (default: {CHECKPOINT_FILE})",
    )
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging")
    parser.add_argument("--media-refresh-only", action="store_true", help="Run targeted image refresh mode only")
    parser.add_argument("--source-ids-file", default=None, help="Optional file with one source_id per line")
    parser.add_argument(
        "--ignore-detail-stale",
        action="store_true",
        help="Bypass stale-detail guard in media refresh mode",
    )
    args = parser.parse_args()

    global log
    log = setup_logging(args.verbose)
    env_check(required=[] if args.dry_run else None)
    if args.new_only and args.dry_run:
        log.warning("--new-only is ignored in --dry-run mode (no DB state available).")

    checkpoint_file = Path(args.checkpoint_file)
    checkpoint_data = load_checkpoint(checkpoint_file) if args.resume else None
    if not checkpoint_data:
        clear_checkpoint(checkpoint_file)

    search_zip, search_radius = _resolve_search_context(args.search_zip, args.search_radius)
    log.info("[%s] Search context zip=%s radius=%s", SOURCE_SITE, search_zip, search_radius)
    seed_urls = [str(item).strip() for item in (args.seed_url or []) if str(item).strip()]
    if args.types:
        seed_urls.extend(_build_type_seed_urls(args.types, search_zip=search_zip, search_radius=search_radius))

    headless = str(args.headless).strip().lower() not in {"false", "0", "no"}
    playwright, browser, context, page = _build_browser(headless=headless)
    supabase = None if args.dry_run else get_supabase()

    all_rows: list[dict[str, Any]] = []
    total_processed = 0
    try:
        if args.media_refresh_only:
            if supabase is None:
                supabase = get_supabase()
            run_media_refresh_mode(
                page=page,
                supabase=supabase,
                source_ids_file=args.source_ids_file,
                limit=args.limit,
                dry_run=args.dry_run,
                ignore_detail_stale=args.ignore_detail_stale,
            )
            return

        if args.make:
            # Use explicit makes directly to avoid discovery preflight blocks.
            makes = [
                _build_make_info_from_arg(name, search_zip=search_zip, search_radius=search_radius)
                for name in args.make
            ]
        else:
            discovered = discover_makes(
                page,
                search_zip=search_zip,
                search_radius=search_radius,
                seed_urls=seed_urls,
            )
            makes = discovered

        if not makes:
            raise SystemExit(
                "No AeroTrader makes discovered; run with --make or provide --seed-url/--types when discovery is challenged."
            )

        if checkpoint_data and checkpoint_data.get("make"):
            checkpoint_make = str(checkpoint_data["make"]).lower()
            make_names = [item["name"].lower() for item in makes]
            if checkpoint_make in make_names:
                start_idx = make_names.index(checkpoint_make)
                makes = makes[start_idx:]

        for idx, make_info in enumerate(makes, start=1):
            make_name = make_info["name"]
            if args.resume and supabase is not None and not args.make:
                existing_count = _fetch_existing_ids_for_make(supabase, make_name)
                if existing_count > 0:
                    log.info("[%s] Resume skip: %s existing rows", make_name, existing_count)
                    continue

            log.info("[%s/%s] %s", idx, len(makes), make_name)
            save_checkpoint(checkpoint_file, {"source_site": SOURCE_SITE, "make": make_name})
            count = _scrape_make(
                page=page,
                make_info=make_info,
                fetch_details=not args.no_detail,
                limit=args.limit,
                dry_run=args.dry_run,
                supabase=supabase,
                output_list=all_rows,
                detail_delay_min=args.detail_delay_min,
                detail_delay_max=args.detail_delay_max,
                page_delay_min=args.page_delay_min,
                page_delay_max=args.page_delay_max,
                max_consecutive_zero_save_pages=args.max_consecutive_zero_save_pages,
                new_only=args.new_only,
            )
            total_processed += count

        if args.output:
            Path(args.output).write_text(json.dumps(all_rows, indent=2, ensure_ascii=True), encoding="utf-8")
            log.info("Wrote %s rows to %s", len(all_rows), args.output)

        if supabase and not args.make:
            marked = _mark_inactive_listings(supabase)
            if marked:
                log.info("[%s] Marked %s inactive listings", SOURCE_SITE, marked)
        clear_checkpoint(checkpoint_file)
        log.info("AeroTrader run complete. processed=%s", total_processed)
    finally:
        _close_browser(playwright, browser, context, page)


if __name__ == "__main__":
    main()
