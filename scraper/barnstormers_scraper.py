from __future__ import annotations

# 2026-03-03: Add Barnstormers scraper with requests-first fetch and Playwright fallback.

import argparse
import hashlib
import json
import random
import re
import time
from datetime import date
from pathlib import Path
from typing import Any, Optional
from urllib.parse import quote, urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

try:
    from config import BARNSTORMERS_CATEGORIES, SCRAPE_ORDER, get_manufacturer_tier, normalize_manufacturer
    from description_parser import parse_description
    from env_check import env_check
    from media_refresh_utils import apply_media_update, fetch_refresh_rows, load_source_ids_file, seen_within_hours
    from schema import validate_listing
    from scraper_base import (
        compute_listing_fingerprint,
        get_supabase,
        safe_upsert_with_fallback,
        setup_logging,
    )
except ImportError:  # pragma: no cover
    from .config import BARNSTORMERS_CATEGORIES, SCRAPE_ORDER, get_manufacturer_tier, normalize_manufacturer
    from .description_parser import parse_description
    from .env_check import env_check
    from .media_refresh_utils import apply_media_update, fetch_refresh_rows, load_source_ids_file, seen_within_hours
    from .schema import validate_listing
    from .scraper_base import (
        compute_listing_fingerprint,
        get_supabase,
        safe_upsert_with_fallback,
        setup_logging,
    )

BASE_URL = "https://www.barnstormers.com"
SOURCE_SITE = "barnstormers"
CHECKPOINT_FILE = Path(__file__).resolve().parent / "barnstormers_checkpoint.json"
TIMEOUT_SECONDS = 30
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
)

US_STATE_CODES = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "IA", "ID", "IL", "IN",
    "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MS", "MT", "NC", "ND", "NE", "NH",
    "NJ", "NM", "NV", "NY", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA",
    "VT", "WA", "WI", "WV", "WY", "DC",
}

CATEGORY_TYPE_MAP: dict[str, str] = {
    "Single Engine Piston": "single_engine_piston",
    "Multi-Engine Piston": "multi_engine_piston",
    "Turboprop": "turboprop",
    "Jet": "jet",
    "Helicopter": "helicopter",
    "Experimental/Homebuilt": "experimental",
    "Vintage/Warbird": "warbird",
    "Light Sport Aircraft": "light_sport",
    "Amphibious/Float": "seaplane",
}

log = setup_logging()
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")


def _normalize_space(text: str | None) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()


def _parse_price(value: str | None) -> Optional[int]:
    if not value:
        return None
    m = re.search(r"\$?\s*([\d,]{2,9})", value)
    if not m:
        return None
    try:
        return int(m.group(1).replace(",", ""))
    except ValueError:
        return None


def _extract_source_id(url_or_text: str | None, fallback_adid: str | None = None) -> str | None:
    if fallback_adid and fallback_adid.strip():
        return fallback_adid.strip()
    text = url_or_text or ""
    m = re.search(r"classified-(\d+)", text, flags=re.I)
    return m.group(1) if m else None


def _extract_year_make_model(title: str) -> tuple[Optional[int], Optional[str], Optional[str]]:
    text = _normalize_space(title)
    if not text:
        return None, None, None

    year_match = re.search(r"\b(19\d{2}|20\d{2})\b", text)
    year = int(year_match.group(1)) if year_match else None
    rest = re.sub(r"\b(19\d{2}|20\d{2})\b", "", text, count=1).strip() if year_match else text

    lead_noise = {
        "CLEAN", "MINT", "NICE", "BEAUTIFUL", "SHARP", "GORGEOUS", "LOW", "TIME", "FRESH",
        "ANNUAL", "READY", "MUST", "SELL", "GREAT", "NICE!", "IMMACULATE",
    }
    tokens = rest.split()
    while len(tokens) > 2 and tokens and tokens[0].upper() in lead_noise:
        tokens = tokens[1:]
    rest = " ".join(tokens).strip()
    if not rest:
        return year, None, None

    known_makes: list[str] = []
    for make_name in SCRAPE_ORDER:
        canonical = normalize_manufacturer(make_name) or make_name
        if canonical not in known_makes:
            known_makes.append(canonical)
    for extra in ["PZL", "OMF", "Schweizer", "Zenith", "Robin", "Robinson", "Bell", "Enstrom", "Hughes", "Rans"]:
        if extra not in known_makes:
            known_makes.append(extra)

    known_makes.sort(key=lambda item: len(item.split()), reverse=True)
    rest_upper = rest.upper()
    for known in known_makes:
        known_upper = known.upper()
        if rest_upper == known_upper or rest_upper.startswith(f"{known_upper} "):
            model = rest[len(known):].strip() or None
            model = _clean_model_text(model)
            return year, known, model

    parts = rest.split()
    first_token = parts[0] if parts else ""
    remaining_parts = parts[1:] if len(parts) > 1 else []
    # If title starts with bare digits (e.g., "46 TCRAFT ..."), shift make token right.
    if first_token.isdigit() and remaining_parts:
        first_token = remaining_parts[0]
        remaining_parts = remaining_parts[1:]

    if re.fullmatch(r"[A-Z0-9&/\-]{2,6}", first_token) and re.search(r"[A-Z]", first_token) and (
        len(first_token) <= 4 or bool(re.search(r"[0-9&/\-]", first_token))
    ):
        make = first_token
    else:
        make = first_token.title() if first_token else None
    model = " ".join(remaining_parts).strip() if remaining_parts else None
    model = _clean_model_text(model)
    return year, make, model


def _clean_model_text(model: str | None) -> str | None:
    text = _normalize_space(model)
    if not text:
        return None

    # Remove common sales/marketing tails while preserving variant codes.
    tail_patterns = [
        r"\b(READY\s+TO\s+SHIP|FRESH\s+ANNUAL|FOR\s+SALE|MUST\s+SELL|PRICE\s+REDUCED)\b.*$",
        r"\b(AVAILABLE\s+FOR\s+IMMEDIATE\s+SALE|SHOW\s+ME\s+WHAT\s+YOU'?VE\s+GOT)\b.*$",
        # Trim trailing time/ops phrases accidentally appended to model text.
        r"\b\d{2,5}\s*(?:HRS?|HOURS?)\s*(?:TT|TTAF)\b.*$",
        r"\b(?:TT|TTAF|SMOH|SPOH)\s*[:\-]?\s*\d{2,5}\b.*$",
        r"\b\d{2,5}\s*(?:TT|TTAF)\b.*$",
        r"\b\d{2,5}\s*(?:SMOH|SPOH)\b.*$",
    ]
    for pat in tail_patterns:
        text = re.sub(pat, "", text, flags=re.I).strip(" -,:;/")

    # Collapse duplicated punctuation/spacing.
    text = re.sub(r"\s{2,}", " ", text)
    text = text.strip(" -,:;/")
    return text or None


def _extract_location(contact_text: str) -> tuple[Optional[str], Optional[str]]:
    cleaned = _normalize_space(contact_text)
    m = re.search(r"located\s+([^,]+),\s*([A-Z]{2})\b", cleaned, flags=re.I)
    if not m:
        return None, None
    city = m.group(1).strip()
    state = m.group(2).upper()
    if state not in US_STATE_CODES:
        return city, None
    return city, state


def _extract_posted_date(raw_text: str) -> Optional[str]:
    m = re.search(r"Posted\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})", raw_text)
    if not m:
        return None
    return m.group(1).strip()


def _extract_phone(raw_text: str) -> Optional[str]:
    if "Telephone: ----------" in raw_text:
        return None
    m = re.search(r"Telephone:\s*([0-9][0-9\-\s()]{6,})", raw_text, flags=re.I)
    if not m:
        return None
    return _normalize_space(m.group(1))


def _extract_time_signals(raw_text: str) -> dict[str, int]:
    """
    Extract high-confidence time fields from labeled patterns only.
    Avoids false positives from model numbers (e.g. "Skybolt 250").
    """
    text = raw_text or ""
    patterns: dict[str, list[str]] = {
        "total_time_airframe": [
            r"\bTTAF\s*[:\-]?\s*([\d,]+)\b",
            r"\bTOTAL\s+TIME\s*[:\-]?\s*([\d,]+)\b",
            r"\bTT\s*[:\-]?\s*([\d,]+)\b",
            r"\b([\d,]+)\s*HRS?\s*TT\b",
        ],
        "engine_time_since_overhaul": [
            r"\bSMOH\s*[:\-]?\s*([\d,]+)\b",
            r"\bSRAM\s*[:\-]?\s*([\d,]+)\b",
            r"\bSINCE\s+MAJOR\s+OVERHAUL\s*[:\-]?\s*([\d,]+)\b",
            r"\b([\d,]+)\s*HRS?\s*SMOH\b",
        ],
    }
    out: dict[str, int] = {}
    for field, regexes in patterns.items():
        for regex in regexes:
            match = re.search(regex, text, flags=re.I)
            if not match:
                continue
            try:
                out[field] = int(match.group(1).replace(",", ""))
                break
            except ValueError:
                continue
    return out


def _normalize_aircraft_type(category_name: str, title: str | None, description: str | None) -> str:
    base_type = CATEGORY_TYPE_MAP.get(category_name, _normalize_space(category_name).lower().replace(" ", "_"))
    return _apply_aircraft_type_overrides(base_type, title, description)


def _apply_aircraft_type_overrides(base_type: str, title: str | None, description: str | None) -> str:
    text = f"{title or ''} {description or ''}".upper()
    text = re.sub(r"\s+", " ", text)

    # Strong type overrides for obvious cross-category listings.
    if (
        re.search(r"\bHELICOPTER\b|\bROTOR\b|\bROBINSON\b|\bR22\b|\bR44\b", text)
        or re.search(r"\bBELL\s*206\b", text)
        or re.search(r"\bSCHWEIZER\s*269[ABC]?\b", text)
    ):
        return "helicopter"
    if any(token in text for token in ["TURBOPROP", "KING AIR", "CARAVAN", "TBM", "PC-12", "PT6A-"]):
        return "turboprop"
    if any(token in text for token in ["LEARJET", "CITATION", "GULFSTREAM", "FALCON 50", "TURBOJET"]):
        return "jet"
    if any(token in text for token in ["FLOAT", "AMPHIB", "SEAPLANE", "FLOATPLANE"]):
        return "seaplane"
    if any(token in text for token in ["EXPERIMENTAL", "HOMEBUILT", "KITBUILT", "KITFOX", "VAN'S", "RV-"]):
        return "experimental"
    if any(token in text for token in ["LIGHT SPORT", "S-LSA", "E-LSA", "ULTRALIGHT"]):
        return "light_sport"
    if any(token in text for token in ["TWIN", "MULTI-ENGINE", "SENECA", "BARON", "AZTEC", "DUCHESS"]):
        return "multi_engine_piston"

    return base_type


def _extract_engine_model_from_text(raw_text: str) -> Optional[str]:
    text = (raw_text or "").upper()
    patterns = [
        r"\b(TSIO-\d{3,4}[A-Z0-9\-]*)\b",
        r"\b(PT6A-\d{1,3}[A-Z0-9\-]*)\b",
        r"\b(HIO-\d{3,4}[A-Z0-9\-]*)\b",
        r"\b(AEIO-\d{3,4}[A-Z0-9\-]*)\b",
        r"\b(IO-\d{3,4}[A-Z0-9\-]*)\b",
        r"\b(O-\d{3,4}[A-Z0-9\-]*)\b",
        r"\b(LYCOMING\s+[A-Z]{1,6}-\d{2,4}[A-Z0-9\-]*)\b",
        r"\b(CONTINENTAL\s+[A-Z]{1,6}-\d{2,4}[A-Z0-9\-]*)\b",
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if not m:
            continue
        model = _normalize_space(m.group(1))
        if model:
            return model
    return None


def _is_noisy_engine_model(value: str | None) -> bool:
    model = _normalize_space(value)
    if not model:
        return True
    upper = model.upper()
    noisy_tokens = [
        " IN A BOX",
        " COMPONENT",
        "$",
        ",",
        " LOGS",
        " GREAT",
        " ANNUAL",
    ]
    if any(tok in upper for tok in noisy_tokens):
        return True
    if len(model) > 36:
        return True
    if len(model) < 4:
        return True
    # Reject generic words that are not engine model identifiers.
    if upper in {"OPEN", "COMPONENTS", "ENGINE", "OUT", "IN"}:
        return True
    if not re.search(r"\d", upper):
        known_prefixes = ("LYCOMING", "CONTINENTAL", "ROTAX", "PT6", "IO-", "O-", "TSIO-", "HIO-", "AEIO-")
        if not any(upper.startswith(prefix) for prefix in known_prefixes):
            return True
    if re.search(r"\b(ADS-B|GARMIN|GNS|GTN|AUDIO PANEL|TRANSPONDER)\b", upper):
        return True
    return False


def _fingerprint_listing(title: str | None, price_asking: Optional[int], description: str | None) -> str:
    material = f"{_normalize_space(title)}|{price_asking or ''}|{_normalize_space(description)[:200]}"
    return hashlib.sha1(material.encode("utf-8")).hexdigest()


class HtmlFetcher:
    def __init__(self, no_playwright_fallback: bool = False):
        self._session = requests.Session()
        self._session.headers.update({"User-Agent": USER_AGENT})
        self.no_playwright_fallback = no_playwright_fallback
        self._consecutive_blocked = 0

    def fetch(self, url: str) -> str | None:
        try:
            resp = self._session.get(url, timeout=TIMEOUT_SECONDS)
            blocked = resp.status_code == 429 or "/cdn-cgi/" in str(resp.url).lower() or "cf-challenge" in resp.text
            if blocked:
                self._consecutive_blocked += 1
            else:
                self._consecutive_blocked = 0

            if self._consecutive_blocked >= 5:
                log.warning("Blocked 5 consecutive requests; pausing 60s before retry.")
                time.sleep(60)
                self._consecutive_blocked = 0
                resp = self._session.get(url, timeout=TIMEOUT_SECONDS)

            if resp.status_code == 200 and not blocked:
                return resp.text
            log.warning("Request fetch failed (%s) for %s", resp.status_code, url)
        except requests.RequestException as exc:
            log.warning("Request fetch exception for %s: %s", url, exc)

        if self.no_playwright_fallback:
            return None
        return self._fetch_with_playwright(url)

    def _fetch_with_playwright(self, url: str) -> str | None:
        try:
            from playwright.sync_api import sync_playwright

            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page()
                page.goto(url, wait_until="domcontentloaded", timeout=45000)
                html = page.content()
                browser.close()
                return html
        except Exception as exc:  # pragma: no cover
            log.error("Playwright fallback failed for %s: %s", url, exc)
            return None


def _build_category_page_url(base_url: str, page: int) -> str:
    if page <= 1:
        return base_url
    slug = urlparse(base_url).path.lstrip("/")
    return f"{base_url}?seocategory={quote('/' + slug, safe='')}&page={page}"


def _parse_listing_card(card: Any, category_name: str) -> dict[str, Any] | None:
    title_link = card.select_one("a.listing_header[href]")
    if not title_link:
        return None

    title = _normalize_space(title_link.get_text(" ", strip=True))
    rel_url = title_link.get("href") or ""
    listing_url = urljoin(BASE_URL, rel_url)
    source_id = _extract_source_id(rel_url, card.get("data-adid"))
    if not source_id:
        return None

    year, make, model = _extract_year_make_model(title)
    price_asking = _parse_price(card.select_one("span.price").get_text(" ", strip=True) if card.select_one("span.price") else "")
    action_phrase = _normalize_space(card.select_one("span.action_phrase").get_text(" ", strip=True) if card.select_one("span.action_phrase") else "")
    description = _normalize_space(card.select_one("span.body").get_text(" ", strip=True) if card.select_one("span.body") else "")
    contact_text = _normalize_space(card.select_one("span.contact").get_text(" ", strip=True) if card.select_one("span.contact") else "")
    city, state = _extract_location(contact_text)
    posted_date = _extract_posted_date(card.get_text(" ", strip=True))
    seller_name = _normalize_space(card.select_one("span.contact a span").get_text(" ", strip=True) if card.select_one("span.contact a span") else "")

    # Keep the canonical fingerprint for dedupe checks and DB skip behavior.
    listing_fingerprint = _fingerprint_listing(title, price_asking, description)

    card_html = str(card)
    image_candidates: list[str] = []
    for rel_or_abs in re.findall(r"""(?:https?://[^\s"'<>]+|/media/[^\s"'<>]+)""", card_html):
        lower = rel_or_abs.lower()
        if "listing_images" not in lower:
            continue
        full = rel_or_abs if rel_or_abs.startswith("http") else urljoin(BASE_URL, rel_or_abs)
        image_candidates.append(full)
    primary_image_url = image_candidates[0] if image_candidates else None

    return {
        "source_site": SOURCE_SITE,
        "listing_source": SOURCE_SITE,
        "source_id": source_id,
        "source_listing_id": source_id,
        "url": listing_url,
        "source_url": listing_url,
        "title": title,
        "year": year,
        "make": make,
        "model": model,
        "price_asking": price_asking,
        "asking_price": price_asking,
        "description": description or None,
        "aircraft_type": _normalize_aircraft_type(category_name, title, description),
        "location_city": city,
        "location_state": state,
        "listing_status_text": action_phrase or None,
        "posted_date_text": posted_date,
        "seller_name": seller_name or None,
        "seller_phone": _extract_phone(card.get_text(" ", strip=True)),
        "listing_fingerprint": listing_fingerprint,
        "primary_image_url": primary_image_url,
    }


def _extract_detail_fields(fetcher: HtmlFetcher, listing: dict[str, Any]) -> dict[str, Any]:
    listing_url = str(listing.get("url") or "")
    source_id = str(listing.get("source_id") or "")
    html = fetcher.fetch(listing_url)
    if not html:
        return {}

    soup = BeautifulSoup(html, "html.parser")
    detail_card = soup.select_one("div.classified_single")
    if not detail_card:
        return {}

    detail_text = _normalize_space(detail_card.get_text(" ", strip=True))
    detail_desc = _normalize_space(
        detail_card.select_one("span.body").get_text(" ", strip=True) if detail_card.select_one("span.body") else ""
    )
    description_full = detail_desc or _normalize_space(listing.get("description"))
    posted_date = _extract_posted_date(detail_text)
    seller_name = _normalize_space(
        detail_card.select_one("span.contact a span").get_text(" ", strip=True)
        if detail_card.select_one("span.contact a span")
        else ""
    )

    image_urls: list[str] = []
    zoom_url = f"{BASE_URL}/listing_images_zoom.php?id={source_id}&so=1"
    zoom_html = fetcher.fetch(zoom_url)
    if zoom_html:
        zoom_soup = BeautifulSoup(zoom_html, "html.parser")
        for img in zoom_soup.select("img.zoomimg[src]"):
            src = urljoin(BASE_URL, img.get("src", ""))
            if "listing_images/large/" in src:
                image_urls.append(src)
    if not image_urls:
        # Listing photos are sometimes outside the detail card wrapper.
        # Scan whole page for Barnstormers listing image paths.
        for img in soup.select("img[src*='/media/listing_images/'], img[data-src*='/media/listing_images/']"):
            src = img.get("data-src") or img.get("src", "")
            src = urljoin(BASE_URL, src)
            if src:
                image_urls.append(src)
    if not image_urls:
        raw_html = str(detail_card)
        for rel_or_abs in re.findall(r"""(?:https?://[^\s"'<>]+|/media/[^\s"'<>]+)""", raw_html):
            lower = rel_or_abs.lower()
            if "listing_images" not in lower:
                continue
            full = rel_or_abs if rel_or_abs.startswith("http") else urljoin(BASE_URL, rel_or_abs)
            image_urls.append(full)
    if image_urls:
        deduped: list[str] = []
        seen: set[str] = set()
        for candidate in image_urls:
            if candidate in seen:
                continue
            low = candidate.lower()
            if any(token in low for token in ("/media/logos/", "/media/barnbann/", "index-barntitle2.png")):
                continue
            seen.add(candidate)
            deduped.append(candidate)
        image_urls = deduped[:25]

    spec_links = [
        urljoin(BASE_URL, a.get("href", ""))
        for a in detail_card.select('a[href*="doc_SPECIFICATION"]')
        if a.get("href")
    ]
    all_specs: dict[str, Any] = {"spec_links": spec_links} if spec_links else {}

    parser_payload = parse_description(f"{listing.get('description') or ''} {description_full}".strip())
    parsed_smoh = parser_payload.get("times", {}).get("engine_smoh")
    parsed_ttaf = parser_payload.get("times", {}).get("total_time")
    time_signals = _extract_time_signals(f"{detail_text} {description_full}")
    parser_engine_model = None
    if isinstance(parser_payload.get("engine"), dict):
        parser_engine_model = parser_payload.get("engine", {}).get("model")
    detected_engine_model = _extract_engine_model_from_text(f"{detail_text} {description_full}")
    clean_engine_model = detected_engine_model
    if not clean_engine_model and not _is_noisy_engine_model(parser_engine_model):
        clean_engine_model = _normalize_space(parser_engine_model)
    if isinstance(parser_payload.get("engine"), dict):
        if clean_engine_model:
            parser_payload["engine"]["model"] = clean_engine_model
        else:
            parser_payload["engine"].pop("model", None)

    n_number = None
    n_match = re.search(r"\bN\d{1,5}[A-Z]{0,2}\b", detail_text, flags=re.I)
    if n_match:
        n_number = n_match.group(0).upper()

    if isinstance(time_signals.get("engine_time_since_overhaul"), int):
        parsed_smoh = time_signals["engine_time_since_overhaul"]
    if isinstance(time_signals.get("total_time_airframe"), int):
        parsed_ttaf = time_signals["total_time_airframe"]

    return {
        "description_full": description_full or None,
        "posted_date_text": posted_date or listing.get("posted_date_text"),
        "seller_name": seller_name or listing.get("seller_name"),
        "seller_phone": _extract_phone(detail_text) or listing.get("seller_phone"),
        # Barnstormers hides direct emails behind contact form.
        "seller_email": None,
        "spec_links": spec_links or None,
        "description_intelligence": parser_payload,
        "engine_model": clean_engine_model or listing.get("engine_model"),
        "engine_time_since_overhaul": parsed_smoh if isinstance(parsed_smoh, int) else listing.get("engine_time_since_overhaul"),
        "total_time_airframe": parsed_ttaf if isinstance(parsed_ttaf, int) else listing.get("total_time_airframe"),
        "n_number": n_number or listing.get("n_number"),
        "image_urls": image_urls or None,
        "primary_image_url": image_urls[0] if image_urls else listing.get("primary_image_url"),
        "listing_fingerprint": compute_listing_fingerprint(
            {
                "source_site": SOURCE_SITE,
                "source_id": listing.get("source_id"),
                "url": listing.get("url"),
                "price_asking": listing.get("price_asking"),
                "year": listing.get("year"),
                "make": listing.get("make"),
                "model": listing.get("model"),
                "description": description_full or listing.get("description"),
            }
        ),
    }


def _fetch_existing_state(supabase: Any, source_ids: list[str]) -> dict[str, dict[str, Any]]:
    if not source_ids:
        return {}
    existing_by_id: dict[str, dict[str, Any]] = {}
    for idx in range(0, len(source_ids), 200):
        chunk = source_ids[idx : idx + 200]
        rows = (
            supabase.table("aircraft_listings")
            .select("source_id,listing_fingerprint,last_seen_date,first_seen_date")
            .eq("source_site", SOURCE_SITE)
            .in_("source_id", chunk)
            .execute()
        )
        for row in rows.data or []:
            sid = row.get("source_id")
            if sid is not None:
                existing_by_id[str(sid)] = row
    return existing_by_id


def scrape_categories(
    fetcher: HtmlFetcher,
    categories: list[str],
    limit: Optional[int] = None,
    dry_run: bool = False,
    resume_state: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    supabase = None if dry_run else get_supabase()
    listings: list[dict[str, Any]] = []
    per_page_sleep = (1.5, 3.5)
    per_detail_sleep = (2.0, 4.5)

    start_category = (resume_state or {}).get("category")
    start_page = int((resume_state or {}).get("page") or 1)
    skip_until_category = bool(start_category)

    for category_name in categories:
        base_url = BARNSTORMERS_CATEGORIES[category_name]
        page = start_page if skip_until_category and category_name == start_category else 1
        if skip_until_category and category_name != start_category:
            continue
        skip_until_category = False

        while True:
            page_url = _build_category_page_url(base_url, page)
            log.info("[%s] Fetching page %s: %s", category_name, page, page_url)
            html = fetcher.fetch(page_url)
            if not html:
                log.warning("[%s] Empty page response at page %s", category_name, page)
                break

            soup = BeautifulSoup(html, "html.parser")
            cards = soup.select("div.classified_single")
            if not cards:
                log.info("[%s] No cards found on page %s", category_name, page)
                break

            parsed_page: list[dict[str, Any]] = []
            for card in cards:
                listing = _parse_listing_card(card, category_name)
                if listing:
                    parsed_page.append(listing)

            if not parsed_page:
                log.info("[%s] No parsed listings on page %s", category_name, page)
                break

            existing_by_id = _fetch_existing_state(supabase, [str(x["source_id"]) for x in parsed_page]) if supabase else {}
            today_iso = date.today().isoformat()

            for listing in parsed_page:
                existing = existing_by_id.get(str(listing.get("source_id")))
                should_fetch_detail = True
                if existing:
                    old_fp = str(existing.get("listing_fingerprint") or "")
                    new_fp = str(listing.get("listing_fingerprint") or "")
                    should_fetch_detail = old_fp != new_fp
                if should_fetch_detail:
                    details = _extract_detail_fields(fetcher, listing)
                    if details:
                        listing.update(details)
                    time.sleep(random.uniform(*per_detail_sleep))
                else:
                    log.info("[%s] Skip unchanged detail fetch source_id=%s", category_name, listing.get("source_id"))

                listing["first_seen_date"] = today_iso if not existing else existing.get("first_seen_date")
                listing["last_seen_date"] = today_iso
                listing["is_active"] = True
                listing["inactive_date"] = None
                listings.append(listing)

                if limit is not None and len(listings) >= limit:
                    _save_checkpoint({"category": category_name, "page": page})
                    return listings

            _save_checkpoint({"category": category_name, "page": page + 1})
            time.sleep(random.uniform(*per_page_sleep))
            page += 1

    return listings


def _save_checkpoint(data: dict[str, Any]) -> None:
    CHECKPOINT_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _load_checkpoint() -> dict[str, Any] | None:
    if not CHECKPOINT_FILE.exists():
        return None
    try:
        return json.loads(CHECKPOINT_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def _clear_checkpoint() -> None:
    if CHECKPOINT_FILE.exists():
        CHECKPOINT_FILE.unlink()


def upsert_listings(supabase: Any, listings: list[dict[str, Any]]) -> int:
    if not listings:
        return 0

    rows: list[dict[str, Any]] = []
    for listing in listings:
        listing["aircraft_type"] = _apply_aircraft_type_overrides(
            str(listing.get("aircraft_type") or "single_engine_piston"),
            listing.get("title"),
            listing.get("description_full") or listing.get("description"),
        )

        normalized_make = normalize_manufacturer(listing.get("make"))
        if normalized_make:
            listing["make"] = normalized_make
            listing["manufacturer_tier"] = get_manufacturer_tier(normalized_make)

        row, warnings = validate_listing(listing)
        if warnings:
            log.warning("Skipping invalid listing %s: %s", listing.get("source_id"), "; ".join(warnings))
            continue
        row["source_site"] = SOURCE_SITE
        row["listing_source"] = SOURCE_SITE
        row["source_id"] = str(row.get("source_id"))
        if row.get("price_asking") is not None and row.get("asking_price") is None:
            row["asking_price"] = row["price_asking"]
        rows.append(row)

    if not rows:
        return 0

    all_keys: set[str] = set()
    for row in rows:
        all_keys.update(row.keys())
    for row in rows:
        for key in all_keys:
            row.setdefault(key, None)

    saved = safe_upsert_with_fallback(
        supabase=supabase,
        table="aircraft_listings",
        rows=rows,
        on_conflict="source_site,source_id",
        fallback_match_keys=["source_site", "source_id"],
        logger=log,
    )
    return saved


def mark_inactive_listings(supabase: Any) -> int:
    today_iso = date.today().isoformat()
    try:
        response = (
            supabase.table("aircraft_listings")
            .update({"is_active": False, "inactive_date": today_iso})
            .eq("source_site", SOURCE_SITE)
            .lt("last_seen_date", today_iso)
            .eq("is_active", True)
            .execute()
        )
        return len(response.data or [])
    except Exception as exc:
        log.warning("[%s] Failed to mark inactive listings: %s", SOURCE_SITE, exc)
        return 0


def _print_dry_run(listings: list[dict[str, Any]]) -> None:
    for item in listings:
        print(json.dumps(item, indent=2, ensure_ascii=True))


def run_media_refresh_mode(
    *,
    fetcher: HtmlFetcher,
    supabase: Any,
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
        details = _extract_detail_fields(fetcher, {"source_id": source_id, "url": detail_url})
        image_urls = details.get("image_urls") if isinstance(details.get("image_urls"), list) else []
        primary_image_url = str(details.get("primary_image_url") or "").strip() or (image_urls[0] if image_urls else None)
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


def main() -> None:
    parser = argparse.ArgumentParser(description="Barnstormers aircraft scraper")
    parser.add_argument("--category", nargs="+", help="Category name(s) from BARNSTORMERS_CATEGORIES")
    parser.add_argument("--limit", type=int, default=None, help="Max listings to scrape")
    parser.add_argument("--dry-run", action="store_true", help="Do not write to database")
    parser.add_argument("--resume", action="store_true", help="Resume from checkpoint")
    parser.add_argument("--output", help="Optional JSON output file path")
    parser.add_argument("--verbose", action="store_true", help="Verbose logging")
    parser.add_argument("--no-playwright-fallback", action="store_true", help="Disable Playwright fallback")
    parser.add_argument("--media-refresh-only", action="store_true", help="Run targeted image refresh mode only")
    parser.add_argument("--source-ids-file", default=None, help="Optional file with one source_id per line")
    parser.add_argument(
        "--ignore-detail-stale",
        action="store_true",
        help="Bypass stale-detail guard in media refresh mode",
    )
    args = parser.parse_args()

    global log
    log = setup_logging(verbose=args.verbose)

    if not args.dry_run:
        env_check()

    selected = args.category or list(BARNSTORMERS_CATEGORIES.keys())
    invalid = [name for name in selected if name not in BARNSTORMERS_CATEGORIES]
    if invalid:
        raise SystemExit(f"Unknown category name(s): {', '.join(invalid)}")

    resume_state = _load_checkpoint() if args.resume else None
    fetcher = HtmlFetcher(no_playwright_fallback=args.no_playwright_fallback)

    if args.media_refresh_only:
        supabase = get_supabase()
        run_media_refresh_mode(
            fetcher=fetcher,
            supabase=supabase,
            source_ids_file=args.source_ids_file,
            limit=args.limit,
            dry_run=args.dry_run,
            ignore_detail_stale=args.ignore_detail_stale,
        )
        return

    listings = scrape_categories(
        fetcher=fetcher,
        categories=selected,
        limit=args.limit,
        dry_run=args.dry_run,
        resume_state=resume_state,
    )

    if args.output:
        Path(args.output).write_text(json.dumps(listings, indent=2, ensure_ascii=True), encoding="utf-8")
        log.info("Wrote %s listings to %s", len(listings), args.output)

    if args.dry_run:
        _print_dry_run(listings)
        log.info("Dry run complete. Parsed %s listings.", len(listings))
        return

    supabase = get_supabase()
    saved = upsert_listings(supabase, listings)
    marked_inactive = mark_inactive_listings(supabase)
    _clear_checkpoint()
    log.info("Barnstormers scrape complete. parsed=%s saved=%s marked_inactive=%s", len(listings), saved, marked_inactive)


if __name__ == "__main__":
    main()

