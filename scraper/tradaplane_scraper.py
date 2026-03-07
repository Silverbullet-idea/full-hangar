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
import random
import re
import time
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional, TYPE_CHECKING
from urllib.parse import parse_qs, urlencode, urljoin, urlparse

import requests
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

BASE_URL = "https://www.trade-a-plane.com"
SEARCH_PATH = "/search"
DEFAULT_CHECKPOINT_FILE = Path("scraper/state/tradaplane_checkpoint.json")
FAILED_URLS_FILE = Path("scraper/failed_urls_tap.json")

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

N_NUMBER_PATTERN = re.compile(r"\bN[\s\-]*([0-9]{1,5}[A-HJ-NP-Z]{0,2})\b", re.I)


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
    money_match = re.search(r"\$\s*[\d,]+", text)
    if money_match:
        return money_match.group(0)
    usd_match = re.search(r"\bUSD\s*[\$]?\s*[\d,]+\b", text, flags=re.I)
    if usd_match:
        return usd_match.group(0)
    call_match = re.search(r"\bcall(?:\s+for\s+price)?\b", text, flags=re.I)
    if call_match:
        return "Call"
    return None


def _normalize_n_number(raw_value: str | None) -> Optional[str]:
    if not raw_value:
        return None
    compact = re.sub(r"[^A-Za-z0-9]", "", raw_value).upper()
    if not compact:
        return None
    if not compact.startswith("N"):
        compact = f"N{compact}"
    if re.fullmatch(r"N[0-9]{1,5}[A-HJ-NP-Z]{0,2}", compact):
        return compact
    return None


def _extract_n_number(text: str) -> Optional[str]:
    if not text:
        return None
    match = N_NUMBER_PATTERN.search(text.upper())
    if not match:
        return None
    return _normalize_n_number(f"N{match.group(1)}")


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


def _extract_detail_sections(soup: BeautifulSoup) -> dict[str, str]:
    """Extract key/value text blocks from listing detail panels."""
    sections: dict[str, str] = {}
    for box in soup.select(".btm-detail-box"):
        header_el = box.select_one("h3")
        header = header_el.get_text(" ", strip=True).lower() if header_el else ""
        if not header:
            continue

        content_parts: list[str] = []
        for block in box.select("pre, p, li, td"):
            text = html_module.unescape(block.get_text(" ", strip=True))
            text = re.sub(r"\s+", " ", text).strip()
            if text:
                content_parts.append(text)

        if not content_parts:
            # Fallback to raw text while removing the header copy.
            text = html_module.unescape(box.get_text(" ", strip=True))
            text = re.sub(r"\s+", " ", text).strip()
            if text and text.lower().startswith(header):
                text = text[len(header) :].strip(" :|-")
            if text:
                content_parts = [text]

        if content_parts:
            sections[header] = "\n".join(dict.fromkeys(content_parts))
    return sections


def _fetch_existing_listing_state(supabase: "Client", source_ids: list[str]) -> dict[str, dict[str, Any]]:
    if not source_ids:
        return {}
    existing: dict[str, dict[str, Any]] = {}
    unique_source_ids = list(dict.fromkeys(source_ids))
    for idx in range(0, len(unique_source_ids), 200):
        chunk = unique_source_ids[idx : idx + 200]
        rows = (
            supabase.table("aircraft_listings")
            .select(
                "source_id,listing_fingerprint,price_asking,asking_price,"
                "description_full,avionics_description,total_time_airframe,engine_time_since_overhaul,"
                "last_seen_date,url"
            )
            .eq("source_site", "trade_a_plane")
            .in_("source_id", chunk)
            .execute()
        )
        for row in rows.data or []:
            sid = row.get("source_id")
            if sid is None:
                continue
            existing[str(sid)] = {
                "listing_fingerprint": str(row.get("listing_fingerprint") or ""),
                "price_asking": row.get("price_asking"),
                "asking_price": row.get("asking_price"),
                "description_full": row.get("description_full"),
                "avionics_description": row.get("avionics_description"),
                "total_time_airframe": row.get("total_time_airframe"),
                "engine_time_since_overhaul": row.get("engine_time_since_overhaul"),
                "last_seen_date": row.get("last_seen_date"),
                "url": row.get("url"),
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
    sections = _extract_detail_sections(soup)

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
    detailed_desc = sections.get("detailed description")
    if detailed_desc:
        extra["description"] = detailed_desc

    if sections:
        preferred_order = [
            "detailed description",
            "avionics / equipment",
            "engines / mods / prop",
            "interior / exterior",
            "general specs (cont.)",
            "airframe",
            "remarks",
        ]
        chunk_lines: list[str] = []
        for key in preferred_order:
            value = sections.get(key)
            if value:
                chunk_lines.append(f"{key.title()}:\n{value}")
        for key, value in sections.items():
            if key not in preferred_order:
                chunk_lines.append(f"{key.title()}:\n{value}")
        description_full = "\n\n".join(chunk_lines).strip()
        if description_full:
            extra["description_full"] = description_full

    n_number = _extract_n_number(raw_text)

    specs = _collect_specs_from_soup(soup)
    if specs:
        log.debug("Detail specs parsed: %s", list(specs.keys()))

    if not n_number:
        for key in (
            "registration",
            "registration #",
            "n-number",
            "n number",
            "tail number",
            "tail #",
            "reg #",
            "aircraft registration",
        ):
            if key in specs:
                n_number = _extract_n_number(specs[key] or "")
                if n_number:
                    break

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
    if "total_time_airframe" not in extra:
        m = re.search(r"\b(?:total\s*time|ttaf)\s*[:\-]?\s*([\d,]{2,7})\b", raw_text, flags=re.I)
        if m:
            extra["total_time_airframe"] = int(m.group(1).replace(",", ""))

    for key in ("smoh", "engine time", "time since overhaul", "time since major overhaul"):
        if key in specs:
            m = re.search(r"[\d,]+", specs[key])
            if m:
                extra["engine_time_since_overhaul"] = int(m.group(0).replace(",", ""))
                break
    if "engine_time_since_overhaul" not in extra:
        smoh_patterns = (
            r"\b(?:engine\s*1\s*time|smoh|stoh)\s*[:\-]?\s*([\d,]{2,7})\b",
        )
        for pattern in smoh_patterns:
            m = re.search(pattern, raw_text, flags=re.I)
            if m:
                extra["engine_time_since_overhaul"] = int(m.group(1).replace(",", ""))
                break

    for key in ("engine", "engine model", "engine make/model", "powerplant"):
        if key in specs:
            cleaned_engine_model = sanitize_engine_model(specs[key].strip())
            if cleaned_engine_model:
                extra["engine_model"] = cleaned_engine_model
            break

    for key in ("avionics", "avionics/radios", "panel"):
        if key in specs:
            extra["avionics_description"] = html_module.unescape(specs[key]).strip()
            break
    if "avionics_description" not in extra:
        avionics_block = sections.get("avionics / equipment")
        if avionics_block:
            extra["avionics_description"] = avionics_block

    if n_number:
        extra["n_number"] = n_number

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
        n_number = _extract_n_number(card_text)
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
            if description:
                description = re.sub(r"\s*more\s+info\s*$", "", description, flags=re.I).strip()

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
            "n_number": n_number,
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
    limiter: Optional[AdaptiveRateLimiter] = None,
    session_deadline_epoch: Optional[float] = None,
    failed_entries: Optional[list[dict[str, Any]]] = None,
    session_stats: Optional[dict[str, Any]] = None,
) -> list[dict]:
    listings: list[dict] = []
    seen_source_ids: set[str] = set()
    page_num = max(1, start_page)
    page_url = build_make_url(make, page=page_num)

    while True:
        if session_deadline_epoch and time.time() >= session_deadline_epoch:
            log.warning("[%s] Session budget reached before page %s.", make, page_num)
            break
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

        existing_state: dict[str, dict[str, Any]] = {}
        if supabase and parsed_cards:
            source_ids = [str(item.get("source_id")) for item in parsed_cards if item.get("source_id")]
            existing_state = _fetch_existing_listing_state(supabase, source_ids)

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
            listing["listing_fingerprint"] = compute_listing_fingerprint(
                listing,
                fields=[
                    "source_site",
                    "source_id",
                    "url",
                    "price_asking",
                    "year",
                    "make",
                    "model",
                    "location_city",
                    "location_state",
                    "description",
                ],
            )
            existing = existing_state.get(str(source_id), {})
            previous_fingerprint = str(existing.get("listing_fingerprint") or "")
            existing_price = existing.get("price_asking")
            if existing_price is None:
                existing_price = existing.get("asking_price")
            needs_price_backfill = existing_price in (None, "", 0, "0")
            needs_rich_detail_backfill = not existing.get("description_full") or not existing.get("avionics_description")
            recently_scraped = _seen_within_hours(existing.get("last_seen_date"), 48)
            should_fetch_detail = (
                previous_fingerprint != listing["listing_fingerprint"]
                or needs_price_backfill
                or needs_rich_detail_backfill
            )

            detail_url = listing.get("url")
            if detail_url and should_fetch_detail:
                if recently_scraped and previous_fingerprint == listing["listing_fingerprint"]:
                    log.info("[%s] Skipping detail fetch (seen within 48h) source_id=%s", make, source_id)
                else:
                    if needs_price_backfill and previous_fingerprint == listing["listing_fingerprint"]:
                        log.info("[%s] Fetching detail for missing-price backfill source_id=%s", make, source_id)
                    if needs_rich_detail_backfill and previous_fingerprint == listing["listing_fingerprint"]:
                        log.info("[%s] Fetching detail for rich-text backfill source_id=%s", make, source_id)
                    log.info("[%s] Fetching detail: %s", make, detail_url)
                    try:
                        extra = fetch_listing_detail(fetcher, detail_url)
                        if not extra:
                            if limiter:
                                limiter.on_challenge_or_429()
                            time.sleep(random.uniform(1.0, 2.0))
                            extra = fetch_listing_detail(fetcher, detail_url)
                        listing.update(extra)
                    except Exception as exc:
                        if session_stats is not None:
                            if session_stats.get("first_error_at_listing") is None:
                                session_stats["first_error_at_listing"] = session_stats.get("attempted")
                            session_stats["error_type"] = f"detail_fetch_error:{type(exc).__name__}"
                        fail_row = {
                            "source_site": "trade_a_plane",
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
            elif detail_url:
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
                log.info("[%s] Limit reached (%s).", make, limit)
                return listings

            if limiter:
                effective_delay = limiter.wait()
                if session_stats is not None:
                    delay_samples = session_stats.setdefault("delay_samples", [])
                    if isinstance(delay_samples, list):
                        delay_samples.append(int(effective_delay * 1000))
                if limiter.should_pause():
                    pause_seconds = limiter.pause_duration_seconds()
                    log.info("[%s] Adaptive pause for %ss after batch.", make, pause_seconds)
                    time.sleep(pause_seconds)

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
        if limiter:
            delay = limiter.wait()
            log.info("[%s] Adaptive wait %.1fs before next page...", make, delay)
        else:
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
        observed_share_price = _as_int(listing.get("price_asking"))
        if observed_share_price is None:
            observed_share_price = _as_int(listing.get("asking_price"))
        parser_text = f"{listing.get('description') or ''} {listing.get('description_full') or ''}".strip()
        if parser_text:
            parsed_intel = parse_description(parser_text, observed_price=observed_share_price)
            listing["description_intelligence"] = parsed_intel
            pricing_context = parsed_intel.get("pricing_context") if isinstance(parsed_intel, dict) else None
            if isinstance(pricing_context, dict):
                normalized_full_price = _as_int(pricing_context.get("normalized_full_price"))
                is_fractional = bool(pricing_context.get("is_fractional"))
                share_numerator = _as_int(pricing_context.get("share_numerator"))
                share_denominator = _as_int(pricing_context.get("share_denominator"))
                share_price = _as_int(pricing_context.get("share_price"))
                share_percent = pricing_context.get("share_percent")
                try:
                    share_percent = float(share_percent) if share_percent is not None else None
                except (TypeError, ValueError):
                    share_percent = None
                review_needed = bool(pricing_context.get("review_needed"))
                evidence = pricing_context.get("evidence") if isinstance(pricing_context.get("evidence"), list) else []
                if is_fractional and normalized_full_price is not None and normalized_full_price > 0:
                    if observed_share_price is not None and _as_int(pricing_context.get("share_price")) is None:
                        pricing_context["share_price"] = observed_share_price
                        share_price = observed_share_price
                    listing["price_asking"] = normalized_full_price
                    listing["asking_price"] = normalized_full_price
                    listing["is_fractional_ownership"] = True
                    listing["fractional_share_numerator"] = share_numerator
                    listing["fractional_share_denominator"] = share_denominator
                    listing["fractional_share_percent"] = share_percent
                    listing["fractional_share_price"] = share_price
                    listing["fractional_full_price_estimate"] = normalized_full_price
                    listing["fractional_review_needed"] = review_needed
                    listing["fractional_pricing_evidence"] = evidence[:5]
                    log.info(
                        "Fractional listing normalized source_id=%s share=%s full=%s evidence=%s",
                        listing.get("source_id"),
                        pricing_context.get("share_price"),
                        normalized_full_price,
                        ",".join(str(item) for item in (pricing_context.get("evidence") or [])[:2]),
                    )
                elif bool(pricing_context.get("review_needed")):
                    listing["is_fractional_ownership"] = False
                    listing["fractional_share_numerator"] = share_numerator
                    listing["fractional_share_denominator"] = share_denominator
                    listing["fractional_share_percent"] = share_percent
                    listing["fractional_share_price"] = share_price
                    listing["fractional_full_price_estimate"] = normalized_full_price
                    listing["fractional_review_needed"] = True
                    listing["fractional_pricing_evidence"] = evidence[:5]
                    log.info(
                        "Fractional-review flag source_id=%s evidence=%s",
                        listing.get("source_id"),
                        ",".join(str(item) for item in (pricing_context.get("evidence") or [])[:2]),
                    )
                else:
                    # Keep explicit false/default state for downstream filters.
                    listing["is_fractional_ownership"] = False
                    listing["fractional_review_needed"] = False
            parsed_engine_model = parsed_intel.get("engine", {}).get("model")
            existing_engine_model = listing.get("engine_model")
            existing_engine_model_text = str(existing_engine_model).strip() if existing_engine_model else ""
            if isinstance(parsed_engine_model, str):
                if not existing_engine_model_text or len(existing_engine_model_text) > 120:
                    listing["engine_model"] = parsed_engine_model
            parsed_smoh = parsed_intel.get("times", {}).get("engine_smoh")
            if listing.get("engine_time_since_overhaul") in (None, "", 0) and isinstance(parsed_smoh, int):
                listing["engine_time_since_overhaul"] = parsed_smoh
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

        row["source_site"] = "trade_a_plane"
        row["listing_source"] = "trade_a_plane"
        normalized_make = normalize_manufacturer(str(row.get("make") or ""))
        if normalized_make:
            row["make"] = normalized_make
        manufacturer_tier = get_manufacturer_tier(row.get("make"))
        if manufacturer_tier is not None:
            row["manufacturer_tier"] = manufacturer_tier
        if row.get("price_asking") is not None and row.get("asking_price") is None:
            row["asking_price"] = row.get("price_asking")
        if row.get("asking_price") is not None and row.get("price_asking") is None:
            row["price_asking"] = row.get("asking_price")
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

    try:
        saved = safe_upsert_with_fallback(
            supabase=supabase,
            table="aircraft_listings",
            rows=rows,
            on_conflict="source_site,source_id",
            fallback_match_keys=["source_site", "source_id"],
            logger=log,
        )
    except Exception as exc:
        log.error("Batch upsert failed: %s", exc)
        saved = 0
        for row in rows:
            try:
                supabase.table("aircraft_listings").upsert(row, on_conflict="source_site,source_id").execute()
                saved += 1
            except Exception as row_exc:
                if "42P10" in str(row_exc):
                    source_id = row.get("source_id")
                    if source_id:
                        try:
                            existing = (
                                supabase.table("aircraft_listings")
                                .select("id")
                                .eq("source_site", "trade_a_plane")
                                .eq("source_id", source_id)
                                .limit(1)
                                .execute()
                            )
                            if existing.data:
                                (
                                    supabase.table("aircraft_listings")
                                    .update(row)
                                    .eq("source_site", "trade_a_plane")
                                    .eq("source_id", source_id)
                                    .execute()
                                )
                            else:
                                supabase.table("aircraft_listings").insert(row).execute()
                            saved += 1
                            continue
                        except Exception as fallback_exc:
                            log.error(
                                "Fallback upsert failed for source_id=%s: %s",
                                row.get("source_id"),
                                fallback_exc,
                            )
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


def run_media_refresh_mode(
    *,
    fetcher: "HtmlFetcher",
    supabase: "Client",
    source_ids_file: str | None,
    limit: int | None,
    dry_run: bool,
    ignore_detail_stale: bool,
) -> None:
    source_ids = load_source_ids_file(source_ids_file)
    candidates = fetch_refresh_rows(
        supabase,
        source_site="trade_a_plane",
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
            extra = fetch_listing_detail(fetcher, detail_url)
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
            source_site="trade_a_plane",
            source_id=source_id,
            image_urls=image_urls,
            primary_image_url=primary_image_url,
        )
        updated += 1
    log.info(
        "[media-refresh] trade_a_plane complete candidates=%s scanned=%s updated=%s dry_run=%s",
        len(candidates),
        scanned,
        updated,
        dry_run,
    )


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
    parser.add_argument("--max-listings", type=int, default=None, help="Max total listings for this session")
    parser.add_argument("--session-budget-minutes", type=int, default=None, help="Stop run when time budget is reached")
    parser.add_argument("--retry-failed", action="store_true", help="Retry URLs recorded in scraper/failed_urls_tap.json")
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
    log.info("Makes to scrape: %s", makes)
    checkpoint_file = Path(args.checkpoint_file)
    failed_file = Path(args.failed_file)
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
    limiter = None if args.dry_run or supabase is None else AdaptiveRateLimiter(supabase, "trade_a_plane", logger=log)
    if limiter:
        log.info("[trade_a_plane] Adaptive settings: %s", limiter.get_recommended_settings())
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
                listing["source_site"] = "trade_a_plane"
            if not listing.get("listing_source"):
                listing["listing_source"] = "trade_a_plane"
            if detail_url:
                try:
                    listing.update(fetch_listing_detail(fetcher, detail_url))
                    retried_rows.append(listing)
                except Exception as exc:
                    item["error"] = str(exc)
                    item["at"] = datetime.now(timezone.utc).isoformat()
                    still_failed.append(item)
            else:
                item["error"] = "missing_url"
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

    if args.media_refresh_only:
        if supabase is None:
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
            limit=make_limit,
            start_page=start_page,
            on_page_complete=on_page_complete,
            supabase=supabase,
            limiter=limiter,
            session_deadline_epoch=session_deadline_epoch,
            failed_entries=failed_entries,
            session_stats=session_stats,
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
            if limiter:
                between_delay = limiter.wait()
                delay_samples = session_stats.setdefault("delay_samples", [])
                if isinstance(delay_samples, list):
                    delay_samples.append(int(between_delay * 1000))
                log.info("Adaptive wait %.1fs before next make...", between_delay)
            else:
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
    if supabase and not args.make:
        mark_inactive_listings(supabase, "trade_a_plane")
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
            site="trade_a_plane",
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
    clear_checkpoint(checkpoint_file)


if __name__ == "__main__":
    main()
