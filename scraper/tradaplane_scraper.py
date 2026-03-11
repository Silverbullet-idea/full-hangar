from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import random
import re
from datetime import date
from pathlib import Path
from typing import Any, Optional, TYPE_CHECKING
from urllib.parse import parse_qs, urlencode, urljoin, urlparse

from bs4 import BeautifulSoup
from dotenv import load_dotenv

if TYPE_CHECKING:
    from supabase import Client

try:
    from adaptive_rate import AdaptiveRateLimiter
    from config import TRADAPLANE_CATEGORIES, get_manufacturer_tier, normalize_manufacturer
    from description_parser import extract_times, parse_description
    from env_check import env_check
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
    from .adaptive_rate import AdaptiveRateLimiter
    from .config import TRADAPLANE_CATEGORIES, get_manufacturer_tier, normalize_manufacturer
    from .description_parser import extract_times, parse_description
    from .env_check import env_check
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

BASE_URL = "https://www.trade-a-plane.com"
SEARCH_PATH = "/search"
COOKIE_FILE = Path("scraper/tap_cookies.json")
BLOCK_RETRY_SECONDS = 90
MAX_BLOCK_STREAK = 3
DETAIL_STALE_DAYS = 2
MAX_GALLERY_IMAGES = 20


class AntiBotThresholdReached(RuntimeError):
    pass


def _block_message() -> str:
    return "TAP anti-bot threshold reached - verify session/cookies before resuming"


def _is_probable_block(html_text: str) -> bool:
    low = (html_text or "").lower()
    return any(
        marker in low
        for marker in (
            "please enable js and disable any ad blocker",
            "captcha-delivery.com",
            "verify you are human",
            "access denied",
            "challenge",
        )
    )


def _parse_price(text: str) -> Optional[int]:
    num = re.sub(r"[^\d]", "", text or "")
    if not num:
        return None
    try:
        return int(num)
    except ValueError:
        return None


def _extract_price_text(text: str) -> str:
    src = text or ""
    money = re.search(r"\$\s*[\d,]{3,}", src)
    if money:
        return money.group(0)
    usd = re.search(r"\bUSD\b\s*\$?\s*[\d,]{3,}", src, flags=re.I)
    if usd:
        return usd.group(0)
    return ""


def _extract_listing_id(url: str) -> Optional[str]:
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    for key in ("listing_id", "id"):
        values = query.get(key)
        if values:
            candidate = str(values[0]).strip()
            if candidate.isdigit():
                return candidate
    for seg in reversed([seg for seg in parsed.path.split("/") if seg]):
        if re.fullmatch(r"\d{4,12}", seg):
            return seg
    return None


def _source_id(url: str) -> Optional[str]:
    listing_id = _extract_listing_id(url)
    return f"tap_{listing_id}" if listing_id else None


def _split_city_state(location_text: str) -> tuple[Optional[str], Optional[str]]:
    clean = re.sub(r"\s+", " ", (location_text or "").strip())
    if not clean:
        return None, None
    state_match = re.search(r"\b([A-Z]{2})\b(?:\s+USA)?\s*$", clean)
    state = state_match.group(1) if state_match else None
    parts = [p.strip() for p in clean.split(",") if p.strip()]
    city = parts[0] if parts else clean
    return city or None, state


def _valid_url(value: str) -> bool:
    parsed = urlparse(str(value or ""))
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _normalize_image_url(src: str) -> Optional[str]:
    candidate = urljoin(BASE_URL, (src or "").strip())
    if not _valid_url(candidate):
        return None
    if any(token in candidate.lower() for token in ("logo", "icon", "sprite", "placeholder", "ajax_loader", "insurance.png")):
        return None
    return candidate


def _parse_int(value: Any) -> Optional[int]:
    try:
        if value is None:
            return None
        text = str(value).replace(",", " ").strip()
        direct = re.search(r"\b\d+\b", text)
        if not direct:
            return None
        return int(direct.group(0))
    except (TypeError, ValueError):
        return None


def _extract_tap_engine_prop_rows(soup: BeautifulSoup) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    engines: list[dict[str, Any]] = []
    props: list[dict[str, Any]] = []

    for tbl in soup.find_all("table"):
        rows = tbl.find_all("tr")
        if len(rows) < 2:
            continue

        header_cells = [cell.get_text(" ", strip=True).lower() for cell in rows[0].find_all(["th", "td"])]
        metric_cols: list[tuple[int, str]] = []
        for idx, header in enumerate(header_cells):
            token = header.replace(" ", "")
            if "spoh" in token or "propsinceoverhaul" in token:
                metric_cols.append((idx, "SPOH"))
            elif "tso" in token or "tsmoh" in token or "smoh" in token:
                metric_cols.append((idx, "TSO"))
            elif "tsn" in token:
                metric_cols.append((idx, "TSN"))
        if not metric_cols:
            continue

        section_heading = ""
        heading_node = tbl.find_previous(["h1", "h2", "h3", "h4", "h5", "h6", "div", "span"])
        if heading_node:
            section_heading = heading_node.get_text(" ", strip=True).lower()

        for row in rows[1:]:
            cells = [cell.get_text(" ", strip=True) for cell in row.find_all(["th", "td"])]
            if not cells:
                continue
            position = (cells[0] if cells else "").strip() or f"E{len(engines) + len(props) + 1}"
            for metric_idx, metric_type in metric_cols:
                if metric_idx >= len(cells):
                    continue
                metric_raw = cells[metric_idx].strip()
                if not metric_raw:
                    continue
                metric_hours = _parse_int(metric_raw)
                record = {
                    "position": position,
                    "metric_type": metric_type,
                    "metric_raw": metric_raw,
                    "metric_hours": metric_hours,
                }
                if metric_type == "SPOH" or "prop" in section_heading:
                    props.append(record)
                else:
                    engines.append(record)
    return engines, props


def _extract_general_specs_engine_prop_rows(soup: BeautifulSoup) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    engines: list[dict[str, Any]] = []
    props: list[dict[str, Any]] = []
    specs_root = soup.select_one("#general_specs")
    if not specs_root:
        return engines, props

    for row in specs_root.select("p"):
        label_el = row.select_one("label")
        label = (label_el.get_text(" ", strip=True) if label_el else "").strip().lower().rstrip(":")
        raw_text = row.get_text(" ", strip=True)
        value = raw_text
        if label_el:
            label_text = label_el.get_text(" ", strip=True)
            value = raw_text.replace(label_text, "", 1).strip(" :")
        metric_hours = _parse_int(value)
        if metric_hours is None:
            continue

        if "engine 1 time" in label:
            engines.append(
                {"position": "Engine 1", "metric_type": "TIME", "metric_raw": value, "metric_hours": metric_hours}
            )
        elif "engine 2 time" in label:
            engines.append(
                {"position": "Engine 2", "metric_type": "TIME", "metric_raw": value, "metric_hours": metric_hours}
            )
        elif label == "engine time":
            engines.append({"position": "Engine 1", "metric_type": "TIME", "metric_raw": value, "metric_hours": metric_hours})
        elif "prop 1 time" in label:
            props.append({"position": "Prop 1", "metric_type": "TIME", "metric_raw": value, "metric_hours": metric_hours})
        elif "prop 2 time" in label:
            props.append({"position": "Prop 2", "metric_type": "TIME", "metric_raw": value, "metric_hours": metric_hours})
        elif label == "prop time":
            props.append({"position": "Prop 1", "metric_type": "TIME", "metric_raw": value, "metric_hours": metric_hours})

    return engines, props


def _normalize_cookie_entry(raw_cookie: dict[str, Any]) -> Optional[dict[str, Any]]:
    name = str(raw_cookie.get("name") or "").strip()
    value = str(raw_cookie.get("value") or "")
    if not name:
        return None

    normalized: dict[str, Any] = {"name": name, "value": value}
    domain = raw_cookie.get("domain")
    path = raw_cookie.get("path")
    if domain:
        normalized["domain"] = str(domain)
    if path:
        normalized["path"] = str(path)
    normalized["httpOnly"] = bool(raw_cookie.get("httpOnly", False))
    normalized["secure"] = bool(raw_cookie.get("secure", False))

    same_site_raw = str(raw_cookie.get("sameSite") or "").strip().lower()
    same_site_map = {
        "no_restriction": "None",
        "none": "None",
        "lax": "Lax",
        "strict": "Strict",
        "unspecified": "Lax",
    }
    mapped = same_site_map.get(same_site_raw)
    if mapped:
        normalized["sameSite"] = mapped

    exp = raw_cookie.get("expirationDate")
    if exp not in (None, "", 0):
        try:
            normalized["expires"] = int(float(exp))
        except (TypeError, ValueError):
            pass
    return normalized


def build_category_url(category_name: str, page: int) -> str:
    params = dict(TRADAPLANE_CATEGORIES[category_name].get("params", {}))
    minimal_mode = str(params.pop("_minimal", "")).strip() in {"1", "true", "yes"}
    if page > 1:
        params["s-page"] = str(page)
    if not minimal_mode:
        params.setdefault("s-page_size", "24")
        params.setdefault("s-sort_key", "days_since_update")
        params.setdefault("s-sort_order", "asc")
    return f"{BASE_URL}{SEARCH_PATH}?{urlencode(params)}"


async def _create_browser_context(playwright, *, load_cookies: bool):
    browser = await playwright.chromium.launch(
        headless=False,
        args=["--no-sandbox", "--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage"],
    )
    context = await browser.new_context(
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
        viewport={"width": 1280, "height": 840},
        locale="en-US",
    )
    if load_cookies and COOKIE_FILE.exists():
        try:
            cookies = json.loads(COOKIE_FILE.read_text(encoding="utf-8"))
            if isinstance(cookies, list):
                normalized = [
                    cookie
                    for cookie in (_normalize_cookie_entry(item) for item in cookies if isinstance(item, dict))
                    if cookie is not None
                ]
                if normalized:
                    await context.add_cookies(normalized)
                    log.info("Loaded %s TAP cookies from %s", len(normalized), COOKIE_FILE)
        except Exception as exc:
            log.warning("Failed to load cookie file %s: %s", COOKIE_FILE, exc)
    return browser, context


async def _human_pause(min_seconds: float = 0.35, max_seconds: float = 1.25) -> None:
    await asyncio.sleep(random.uniform(max(0.0, min_seconds), max(min_seconds, max_seconds)))


async def _human_warmup(page) -> None:
    try:
        await page.goto(BASE_URL, wait_until="domcontentloaded", timeout=45000)
        await _human_pause(1.4, 2.8)
        viewport = page.viewport_size or {"width": 1280, "height": 840}
        for _ in range(random.randint(2, 4)):
            x = random.randint(80, max(120, int(viewport["width"] * 0.85)))
            y = random.randint(120, max(220, int(viewport["height"] * 0.85)))
            await page.mouse.move(x, y, steps=random.randint(8, 20))
            await _human_pause(0.2, 0.7)
            await page.mouse.wheel(0, random.randint(220, 560))
            await _human_pause(0.6, 1.5)
        await page.mouse.wheel(0, -random.randint(140, 360))
        await _human_pause(0.5, 1.3)
    except Exception as exc:
        log.warning("Warmup interaction skipped: %s", exc)


async def _first_selector(page, selectors: list[str]) -> Optional[str]:
    for selector in selectors:
        try:
            locator = page.locator(selector).first
            if await locator.count() > 0 and await locator.is_visible():
                return selector
        except Exception:
            continue
    return None


async def _human_type(page, selector: str, value: str) -> bool:
    try:
        locator = page.locator(selector).first
        await locator.click()
        await _human_pause(0.2, 0.5)
        await locator.fill("")
        for ch in value:
            await locator.type(ch, delay=random.randint(40, 130))
        await _human_pause(0.2, 0.6)
        return True
    except Exception:
        return False


async def maybe_login_tap(page, *, username: Optional[str], password: Optional[str]) -> bool:
    if not username or not password:
        return False
    login_url = urljoin(BASE_URL, "/login")
    try:
        await page.goto(login_url, wait_until="domcontentloaded", timeout=45000)
        await _human_pause(1.0, 2.2)

        user_selector = await _first_selector(
            page,
            [
                "input[name='username']",
                "input[name='email']",
                "input[type='email']",
                "#email",
                "#email_modal",
                "input[id*='user']",
            ],
        )
        pass_selector = await _first_selector(
            page,
            [
                "input[name='password']",
                "input[type='password']",
                "#password",
                "#password_modal",
            ],
        )
        if not user_selector or not pass_selector:
            log.warning("TAP login form fields were not detected on /login")
            return False

        typed_user = await _human_type(page, user_selector, username)
        typed_pass = await _human_type(page, pass_selector, password)
        if not typed_user or not typed_pass:
            log.warning("TAP login typing failed")
            return False

        auto_login_selector = await _first_selector(
            page,
            [
                "#defaultCheck",
                "input[name='autologin']",
                "input[type='checkbox'][id*='auto']",
                "input[type='checkbox'][name*='auto']",
            ],
        )
        if auto_login_selector:
            try:
                checkbox = page.locator(auto_login_selector).first
                if not await checkbox.is_checked():
                    await checkbox.click()
                    await _human_pause(0.2, 0.6)
            except Exception:
                log.warning("TAP auto-login checkbox detected but could not be toggled")

        submit_selector = await _first_selector(
            page,
            [
                "button[type='submit']",
                "button:has-text('Log in')",
                "button:has-text('Login')",
                "input[type='submit']",
            ],
        )
        if submit_selector:
            await page.locator(submit_selector).first.click()
        else:
            await page.keyboard.press("Enter")
        await _human_pause(2.0, 4.2)

        page_html = (await page.content()).lower()
        current_url = page.url.lower()
        success = ("my account" in page_html) or ("/account" in current_url) or ("logout" in page_html)
        if success:
            log.info("TAP login appears successful")
            return True
        log.warning("TAP login attempt finished but success markers were not detected")
        return False
    except Exception as exc:
        log.warning("TAP login attempt failed: %s", exc)
        return False


async def fetch_page_soup(page, url: str) -> tuple[Optional[BeautifulSoup], bool]:
    try:
        response = await page.goto(url, wait_until="domcontentloaded", timeout=45000)
        await page.wait_for_timeout(random.uniform(2600, 4200))
        html = await page.content()
        soup = BeautifulSoup(html, "html.parser")
        if response and response.status in (429, 503):
            return None, True
        # Trust parsed cards over marker text; TAP pages can include challenge strings in static assets.
        if _get_cards(soup):
            return soup, False
        if _is_probable_block(html):
            return None, True
        return soup, False
    except Exception as exc:
        log.warning("Failed to fetch %s: %s", url, exc)
        return None, True


def _get_cards(soup: BeautifulSoup) -> list:
    for selector in (
        "div.result_listing",
        "div[class*='result_listing']",
        "div.result-listing",
        "div.result-listing-holder",
        "article.listing-card",
    ):
        cards = soup.select(selector)
        if cards:
            return cards
    return []


def parse_listing_card(card, category_name: str) -> Optional[dict[str, Any]]:
    link = (
        card.select_one("a.log_listing_click[href]")
        or card.select_one("a.result_listing_click[href]")
        or card.select_one("a.listing_click[href]")
        or card.select_one("a[href*='listing_id=']")
        or card.select_one("a[href]")
    )
    if not link:
        return None
    href = (link.get("href") or "").strip()
    if not href:
        return None
    url = urljoin(BASE_URL, href)
    if "trade-a-plane.com" not in urlparse(url).netloc:
        return None
    source_id = _source_id(url)
    if not source_id:
        return None

    title_el = card.select_one("a#title") or card.select_one(".result-title") or card.select_one(".listing-title") or card.select_one("h2, h3, h4")
    title = title_el.get_text(" ", strip=True) if title_el else link.get_text(" ", strip=True)
    title = re.sub(r"\s+", " ", (title or "")).strip()

    year = None
    make = None
    model = None
    year_match = re.search(r"\b(19|20)\d{2}\b", title)
    if year_match:
        year = int(year_match.group(0))
        tail = title[year_match.end() :].strip()
        parts = tail.split(None, 1)
        if parts:
            make = parts[0].title()
            model = parts[1].strip() if len(parts) > 1 else None

    price_el = card.select_one(".txt-price, .price, .listing-price, .result-price, .sale_price")
    raw_price_text = price_el.get_text(" ", strip=True) if price_el else card.get_text(" ", strip=True)
    price_text = _extract_price_text(raw_price_text)
    price = None if "call" in (raw_price_text or "").lower() else _parse_price(price_text)
    if price is None:
        onclick_blob = " ".join(
            str(node.get("onclick") or "")
            for node in card.select("[onclick*='build_referral_link']")
        )
        onclick_price_match = re.search(r"build_referral_link\(\s*'([\d,]+(?:\.\d+)?)'", onclick_blob, flags=re.I)
        if onclick_price_match:
            price = _parse_price(onclick_price_match.group(1))

    location_el = card.select_one(".location, .listing-location, .city-state, .address")
    location_raw = location_el.get_text(" ", strip=True) if location_el else ""
    if not location_raw:
        loc_match = re.search(r"\b[A-Za-z .'-]+,\s*[A-Z]{2}\b", card.get_text(" ", strip=True))
        location_raw = loc_match.group(0) if loc_match else ""
    location_city, location_state = _split_city_state(location_raw)
    n_number = None
    reg_el = card.select_one(".txt-reg-num")
    reg_text = reg_el.get_text(" ", strip=True) if reg_el else ""
    nnum_match = re.search(r"\bN\d{1,5}[A-Z]{0,2}\b", reg_text, flags=re.I)
    if nnum_match:
        n_number = nnum_match.group(0).upper()
    total_time_airframe = None
    tt_el = card.select_one(".txt-total-time")
    if tt_el:
        tt_text = tt_el.get_text(" ", strip=True)
        tt_match = re.search(r"\b([\d,]{2,7})\b", tt_text)
        if tt_match:
            try:
                total_time_airframe = int(tt_match.group(1).replace(",", ""))
            except ValueError:
                total_time_airframe = None

    thumb = None
    img = card.select_one("img[src], img[data-src]")
    if img:
        thumb = _normalize_image_url(str(img.get("data-src") or img.get("src") or ""))

    days_on_market = None
    dom_match = re.search(r"\b(\d+)\s+days?\s+ago\b", card.get_text(" ", strip=True), flags=re.I)
    if dom_match:
        days_on_market = int(dom_match.group(1))

    desc_el = card.select_one("p.description, .description, .listing-description, .result-description")
    description_snippet = ""
    if desc_el:
        description_snippet = re.sub(r"\s+", " ", desc_el.get_text(" ", strip=True)).strip()

    seller_el = card.select_one(
        ".seller-name, .dealer-name, .seller, .company_name, .company-name, [itemprop='name'], a[href*='seller_id=']"
    )
    seller_name = re.sub(r"\s+", " ", seller_el.get_text(" ", strip=True)).strip() if seller_el else None
    seller_type = None
    text_blob = card.get_text(" ", strip=True).lower()
    if "dealer" in text_blob:
        seller_type = "dealer"
    elif "broker" in text_blob:
        seller_type = "broker"
    elif "private" in text_blob:
        seller_type = "private"

    return {
        "source": "trade_a_plane",
        "source_site": "trade_a_plane",
        "listing_source": "trade_a_plane",
        "source_id": source_id,
        "source_listing_id": source_id,
        "url": url,
        "title": title or None,
        "year": year,
        "make": make,
        "model": model,
        "price_asking": price,
        "location_raw": location_raw or None,
        "location_city": location_city,
        "location_state": location_state,
        "state": location_state,
        "primary_image_url": thumb,
        "days_on_market": days_on_market,
        "description": description_snippet or None,
        "n_number": n_number,
        "total_time_airframe": total_time_airframe,
        "seller_name": seller_name,
        "seller_type": seller_type,
        "aircraft_type": str(TRADAPLANE_CATEGORIES[category_name].get("aircraft_type") or "single_engine_piston"),
    }


async def fetch_listing_detail(page, url: str) -> tuple[dict[str, Any], bool]:
    soup, blocked = await fetch_page_soup(page, url)
    if blocked or not soup:
        return {}, True

    detail = extract_listing_detail_from_soup(soup)
    return detail, False


def extract_listing_detail_from_soup(soup: BeautifulSoup) -> dict[str, Any]:
    detail: dict[str, Any] = {}
    page_text = soup.get_text(" ", strip=True)

    desc_el = soup.select_one(".description, #description, .listing-description, .remarks")
    description_raw = re.sub(r"\s+", " ", desc_el.get_text(" ", strip=True)).strip() if desc_el else ""
    detail["description_raw"] = description_raw
    detail["description"] = description_raw

    merged_text = f"{description_raw}\n{page_text}".strip()
    times = extract_times(merged_text)
    if isinstance(times.get("total_time"), int):
        detail["total_time_airframe"] = times["total_time"]
    if isinstance(times.get("engine_smoh"), int):
        detail["engine_time_since_overhaul"] = times["engine_smoh"]
        detail["time_since_overhaul"] = times["engine_smoh"]
        detail["smoh"] = times["engine_smoh"]
    if isinstance(times.get("prop_spoh"), int):
        detail["time_since_prop_overhaul"] = times["prop_spoh"]
        detail["spoh"] = times["prop_spoh"]
    if isinstance(times.get("engine_stop"), int):
        detail["stoh"] = times["engine_stop"]
    snew_match = re.search(r"\bSNEW\b[:\s-]*([\d,]{1,7})", merged_text, flags=re.I)
    if snew_match:
        detail["snew"] = int(snew_match.group(1).replace(",", ""))

    n_match = re.search(r"\bN\d{1,5}[A-Z]{0,2}\b", merged_text, flags=re.I)
    if n_match:
        detail["n_number"] = n_match.group(0).upper()
    serial_match = re.search(r"\b(?:serial(?: number)?|s/n|sn)\b[:#\s-]*([A-Z0-9-]{3,40})", merged_text, flags=re.I)
    if serial_match:
        detail["serial_number"] = serial_match.group(1)

    engines, props = _extract_tap_engine_prop_rows(soup)
    if not engines and not props:
        fallback_engines, fallback_props = _extract_general_specs_engine_prop_rows(soup)
        engines = fallback_engines
        props = fallback_props
    if engines:
        detail["engines_raw"] = engines
        engine_positions: list[str] = []
        engine_hours: list[int] = []
        for row in engines:
            pos = str(row.get("position") or "").strip()
            if pos and pos not in engine_positions:
                engine_positions.append(pos)
            if isinstance(row.get("metric_hours"), int):
                engine_hours.append(int(row["metric_hours"]))
        if engine_positions:
            detail["engine_count"] = len(engine_positions)
        elif engine_hours:
            detail["engine_count"] = max(1, len(engine_hours))
        if engine_hours:
            detail["engine_time_since_overhaul"] = engine_hours[0]
            detail["time_since_overhaul"] = engine_hours[0]
        if len(engine_hours) >= 2:
            detail["second_engine_time_since_overhaul"] = engine_hours[1]
    if props:
        detail["props_raw"] = props
        prop_hours = [int(row["metric_hours"]) for row in props if isinstance(row.get("metric_hours"), int)]
        if prop_hours:
            detail["time_since_prop_overhaul"] = prop_hours[0]
        if len(prop_hours) >= 2:
            detail["second_time_since_prop_overhaul"] = prop_hours[1]

    image_urls: list[str] = []
    seen: set[str] = set()
    for img in soup.select("img[src], img[data-src]"):
        normalized = _normalize_image_url(str(img.get("data-src") or img.get("src") or ""))
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        image_urls.append(normalized)
        if len(image_urls) >= MAX_GALLERY_IMAGES:
            break
    if image_urls:
        detail["primary_image_url"] = image_urls[0]
        detail["gallery_image_urls"] = image_urls[1:]
        detail["image_urls"] = image_urls

    return detail


def _fingerprint_seed(listing: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": str(listing.get("title") or ""),
        "price_asking": listing.get("price_asking"),
        "description_head": str(listing.get("description_raw") or listing.get("description") or "")[:200],
    }


async def scrape_category(
    *,
    page: Any,
    category_name: str,
    supabase: Optional["Client"],
    limiter: Optional[AdaptiveRateLimiter],
    limit: Optional[int],
    dry_run: bool,
    resume: bool,
    fetch_detail: bool,
    block_retry_seconds: int,
    max_block_streak: int,
    start_page: int,
    max_pages: Optional[int],
    page_delay_min: float,
    page_delay_max: float,
    force_detail_refresh: bool,
) -> list[dict[str, Any]]:
    listings: list[dict[str, Any]] = []
    seen_source_ids: set[str] = set()
    consecutive_blocks = 0
    page_num = max(1, int(start_page))
    pages_scraped = 0
    did_warmup = False

    while True:
        if max_pages is not None and pages_scraped >= max_pages:
            log.info("[%s] Reached max-pages=%s; stopping", category_name, max_pages)
            break
        if not did_warmup and category_name in {"Jet", "All Aircraft"}:
            warmup_url = "https://www.trade-a-plane.com/search?category_level1=Single+Engine+Piston&s-type=aircraft"
            _warm_soup, _ = await fetch_page_soup(page, warmup_url)
            did_warmup = True
        page_url = build_category_url(category_name, page=page_num)
        log.info("[%s] Fetching page %s: %s", category_name, page_num, page_url)
        soup, blocked = await fetch_page_soup(page, page_url)
        if blocked or not soup:
            consecutive_blocks += 1
            if limiter:
                limiter.on_challenge_or_429()
            if consecutive_blocks >= max_block_streak:
                log.error(_block_message())
                raise AntiBotThresholdReached(_block_message())
            log.warning("[%s] Results blocked, sleeping %ss", category_name, block_retry_seconds)
            await asyncio.sleep(block_retry_seconds)
            continue

        cards = _get_cards(soup)
        if not cards:
            log.info("[%s] No cards on page %s; stopping", category_name, page_num)
            break
        pages_scraped += 1
        consecutive_blocks = 0

        parsed = [row for row in (parse_listing_card(card, category_name) for card in cards) if row]
        source_ids = [str(row["source_id"]) for row in parsed if row.get("source_id")]
        existing_by_id = (
            fetch_existing_state(
                supabase,
                source_site="trade_a_plane",
                source_ids=source_ids,
                select_columns="source_id,listing_fingerprint,last_seen_date,is_active",
            )
            if supabase and source_ids
            else {}
        )

        unchanged_ids: list[str] = []
        for listing in parsed:
            source_id = str(listing["source_id"])
            if source_id in seen_source_ids:
                continue
            seen_source_ids.add(source_id)
            existing_row = existing_by_id.get(source_id)

            listing["listing_fingerprint"] = compute_listing_fingerprint(_fingerprint_seed(listing))
            previous = str((existing_row or {}).get("listing_fingerprint") or "")

            force_refresh = bool(force_detail_refresh)
            if resume and should_skip_detail(existing_row, DETAIL_STALE_DAYS) and not force_refresh:
                unchanged_ids.append(source_id)
                continue
            if not dry_run and previous and previous == listing["listing_fingerprint"] and not force_refresh:
                unchanged_ids.append(source_id)
                continue

            detail_url = str(listing.get("url") or "")
            if fetch_detail and detail_url:
                detail, detail_blocked = await fetch_listing_detail(page, detail_url)
                if detail_blocked:
                    if limiter:
                        limiter.on_challenge_or_429()
                    log.warning("[%s] Detail blocked for %s. Sleeping %ss and retrying once", category_name, source_id, block_retry_seconds)
                    await asyncio.sleep(block_retry_seconds)
                    detail, detail_blocked = await fetch_listing_detail(page, detail_url)
                    if detail_blocked:
                        consecutive_blocks += 1
                        if consecutive_blocks >= max_block_streak:
                            log.error(_block_message())
                            raise AntiBotThresholdReached(_block_message())
                        continue
                consecutive_blocks = 0
                listing.update(detail)

            listing["description_intelligence"] = parse_description(str(listing.get("description_raw") or ""))
            listings.append(listing)

            if fetch_detail:
                if limiter:
                    _ = await asyncio.to_thread(limiter.wait)
                await asyncio.sleep(random.uniform(2.5, 5.0))
            if limit is not None and len(listings) >= limit:
                break

        if unchanged_ids and supabase and not dry_run:
            refresh_seen_for_unchanged(supabase, source_site="trade_a_plane", source_ids=unchanged_ids, logger=log)

        if limit is not None and len(listings) >= limit:
            break
        # Human-like pacing between result pages helps reduce anti-bot pressure.
        if page_delay_max > 0:
            delay = random.uniform(max(0.0, page_delay_min), max(page_delay_min, page_delay_max))
            await asyncio.sleep(delay)
        page_num += 1

    return listings


def upsert_listings(supabase: "Client", listings: list[dict[str, Any]]) -> int:
    if not listings:
        return 0
    today_iso = date.today().isoformat()
    rows: list[dict[str, Any]] = []

    for listing in listings:
        source_id = str(listing.get("source_id") or "")
        if not source_id.startswith("tap_"):
            continue
        listing.pop("description_raw", None)
        listing["description_intelligence"] = parse_description(
            str(listing.get("description_raw") or listing.get("description") or "")
        )
        row, warnings = validate_listing(listing)
        if warnings:
            log.warning("Skipping invalid TAP row %s: %s", source_id, "; ".join(warnings))
            continue
        row["source"] = "trade_a_plane"
        row["source_site"] = "trade_a_plane"
        row["listing_source"] = "trade_a_plane"
        row["source_id"] = source_id
        row["last_seen_date"] = today_iso
        row["is_active"] = True
        row["inactive_date"] = None
        normalized_make = normalize_manufacturer(row.get("make"))
        if normalized_make:
            row["make"] = normalized_make
            tier = get_manufacturer_tier(normalized_make)
            if tier is not None:
                row["manufacturer_tier"] = tier
        rows.append(row)

    if not rows:
        return 0

    existing = fetch_existing_state(
        supabase,
        source_site="trade_a_plane",
        source_ids=[str(row.get("source_id")) for row in rows if row.get("source_id")],
        select_columns="source_id",
    )
    saved = 0
    for row in rows:
        sid = str(row.get("source_id") or "")
        if not sid:
            continue
        try:
            if sid in existing:
                (
                    supabase.table("aircraft_listings")
                    .update(row)
                    .eq("source_site", "trade_a_plane")
                    .eq("source_id", sid)
                    .execute()
                )
            else:
                supabase.table("aircraft_listings").insert(row).execute()
            saved += 1
        except Exception as exc:
            log.warning("Manual upsert failed for %s: %s", sid, exc)
    return saved


def _print_listings(rows: list[dict[str, Any]]) -> None:
    for row in rows:
        print(json.dumps(row, indent=2, ensure_ascii=True))


def _probe_payload(detail: dict[str, Any]) -> dict[str, Any]:
    keys = [
        "engine_count",
        "engines_raw",
        "props_raw",
        "time_since_overhaul",
        "time_since_prop_overhaul",
        "second_engine_time_since_overhaul",
        "second_time_since_prop_overhaul",
    ]
    return {k: detail.get(k) for k in keys if k in detail}


async def run_probe(
    *,
    page: Any,
    probe_url: str,
    probe_html: Optional[str],
    dry_run: bool,
    probe_write: bool,
    probe_source_id: Optional[str],
    supabase: Optional["Client"],
) -> bool:
    detail: dict[str, Any] = {}
    inferred_source_id = probe_source_id
    if probe_html:
        html_path = Path(probe_html)
        if not html_path.exists():
            log.error("Probe HTML file does not exist: %s", html_path)
            return False
        html = html_path.read_text(encoding="utf-8", errors="ignore")
        soup = BeautifulSoup(html, "html.parser")
        detail = extract_listing_detail_from_soup(soup)
        if not inferred_source_id:
            listing_id_match = re.search(r"\blisting_id=(\d{4,12})\b", html, flags=re.I)
            if listing_id_match:
                inferred_source_id = f"tap_{listing_id_match.group(1)}"
        if not detail:
            log.warning("Probe HTML parsed but no detail payload fields were extracted: %s", html_path)
            return False
    else:
        detail, blocked = await fetch_listing_detail(page, probe_url)
        if blocked:
            log.error("Probe blocked for URL: %s", probe_url)
            return False
        if not detail:
            log.warning("Probe returned no detail payload for URL: %s", probe_url)
            return False

    payload = _probe_payload(detail)
    print(json.dumps(payload, indent=2, ensure_ascii=True))

    if dry_run or not probe_write:
        return bool(payload)
    if not supabase:
        log.warning("Probe write skipped: supabase client unavailable")
        return bool(payload)

    source_id = inferred_source_id or _source_id(probe_url)
    if not source_id:
        log.warning("Probe write skipped: could not infer source_id from URL")
        return bool(payload)
    existing = (
        supabase.table("aircraft_listings")
        .select("id,source_id")
        .eq("source_site", "trade_a_plane")
        .eq("source_id", source_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not existing:
        log.warning("Probe write skipped: listing not found for %s", source_id)
        return bool(payload)

    if not payload:
        log.warning("Probe write skipped: no multi-engine/prop fields extracted")
        return False

    (
        supabase.table("aircraft_listings")
        .update(payload)
        .eq("source_site", "trade_a_plane")
        .eq("source_id", source_id)
        .execute()
    )
    log.info("Probe write updated %s fields for %s", len(payload), source_id)
    return True


async def run_probe_batch(
    *,
    page: Any,
    probe_html_dir: str,
    probe_html_glob: str,
    probe_batch_limit: Optional[int],
    dry_run: bool,
    probe_write: bool,
    supabase: Optional["Client"],
) -> None:
    base = Path(probe_html_dir)
    if not base.exists():
        log.error("Probe HTML dir does not exist: %s", base)
        return
    files = [p for p in sorted(base.glob(probe_html_glob)) if p.is_file()]
    if probe_batch_limit is not None:
        files = files[: max(0, int(probe_batch_limit))]
    if not files:
        log.warning("No probe HTML files found in %s matching %s", base, probe_html_glob)
        return

    extracted = 0
    seen_source_ids: set[str] = set()
    for path in files:
        html_text = path.read_text(encoding="utf-8", errors="ignore")
        listing_id_match = re.search(r"\blisting_id=(\d{4,12})\b", html_text, flags=re.I)
        source_id = f"tap_{listing_id_match.group(1)}" if listing_id_match else None
        if source_id and source_id in seen_source_ids:
            log.info("Probe batch skipping duplicate listing: %s (%s)", source_id, path)
            continue
        log.info("Probe batch parsing: %s", path)
        ok = await run_probe(
            page=page,
            probe_url="",
            probe_html=str(path),
            dry_run=dry_run,
            probe_write=probe_write,
            probe_source_id=source_id,
            supabase=supabase,
        )
        if ok:
            extracted += 1
            if source_id:
                seen_source_ids.add(source_id)
    log.info("Probe batch complete: %s/%s files extracted payloads", extracted, len(files))


async def main() -> None:
    parser = argparse.ArgumentParser(description="Trade-A-Plane scraper")
    parser.add_argument("--category", choices=sorted(TRADAPLANE_CATEGORIES.keys()), default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--no-detail", action="store_true", help="Skip detail pages for high-throughput inventory sweeps")
    parser.add_argument("--no-cookies", action="store_true", help="Skip loading scraper/tap_cookies.json")
    parser.add_argument("--block-retry-seconds", type=int, default=BLOCK_RETRY_SECONDS, help="Seconds to wait after block/challenge")
    parser.add_argument("--max-block-streak", type=int, default=MAX_BLOCK_STREAK, help="Consecutive blocks before abort")
    parser.add_argument("--start-page", type=int, default=1, help="Start scraping from this result page")
    parser.add_argument("--max-pages", type=int, default=None, help="Maximum number of result pages to scrape")
    parser.add_argument("--page-delay-min", type=float, default=2.0, help="Minimum seconds to wait between result pages")
    parser.add_argument("--page-delay-max", type=float, default=5.0, help="Maximum seconds to wait between result pages")
    parser.add_argument("--force-detail-refresh", action="store_true", help="Fetch and update detail fields even when listing fingerprint is unchanged")
    parser.add_argument("--tap-login", action="store_true", help="Attempt TAP login before scraping (credentials via args or env)")
    parser.add_argument("--tap-username", type=str, default=None, help="TAP username/email (or use TAP_USERNAME env var)")
    parser.add_argument("--tap-password", type=str, default=None, help="TAP password (or use TAP_PASSWORD env var)")
    parser.add_argument("--skip-human-warmup", action="store_true", help="Skip pre-scrape human-like browse warmup")
    parser.add_argument("--probe-url", type=str, default=None, help="Run one-off detail probe for a single TAP listing URL")
    parser.add_argument("--probe-html", type=str, default=None, help="Parse saved TAP detail HTML file for one-off probe")
    parser.add_argument("--probe-html-dir", type=str, default=None, help="Directory with saved TAP detail HTML files for batch probe")
    parser.add_argument("--probe-html-glob", type=str, default="*.html", help="Glob for batch probe files inside --probe-html-dir")
    parser.add_argument("--probe-batch-limit", type=int, default=None, help="Max files to process in --probe-html-dir batch mode")
    parser.add_argument("--probe-source-id", type=str, default=None, help="Optional source_id (e.g. tap_12345) to use for probe writes")
    parser.add_argument("--probe-write", action="store_true", help="With --probe-url and non-dry-run, update only extracted multi-engine fields")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    global log
    log = setup_logging(args.verbose)
    env_check(required=[] if args.dry_run else None)

    if args.category:
        categories = [args.category]
    else:
        categories = [name for name in TRADAPLANE_CATEGORIES.keys() if name != "All Aircraft"]
    supabase = None if args.dry_run else get_supabase()
    limiter = None if supabase is None else AdaptiveRateLimiter(supabase, "trade_a_plane", logger=log)

    from playwright.async_api import async_playwright

    all_rows: list[dict[str, Any]] = []
    async with async_playwright() as playwright:
        browser, context = await _create_browser_context(playwright, load_cookies=not args.no_cookies)
        try:
            page = await context.new_page()
            if not args.skip_human_warmup:
                await _human_warmup(page)

            tap_username = args.tap_username or os.getenv("TAP_USERNAME")
            tap_password = args.tap_password or os.getenv("TAP_PASSWORD")
            if args.tap_login:
                await maybe_login_tap(page, username=tap_username, password=tap_password)
                if not args.skip_human_warmup:
                    await _human_warmup(page)

            if args.probe_html_dir:
                await run_probe_batch(
                    page=page,
                    probe_html_dir=str(args.probe_html_dir).strip(),
                    probe_html_glob=str(args.probe_html_glob).strip() or "*.html",
                    probe_batch_limit=args.probe_batch_limit,
                    dry_run=args.dry_run,
                    probe_write=bool(args.probe_write),
                    supabase=supabase,
                )
                return
            if args.probe_url or args.probe_html:
                await run_probe(
                    page=page,
                    probe_url=str(args.probe_url or "").strip(),
                    probe_html=(str(args.probe_html).strip() if args.probe_html else None),
                    dry_run=args.dry_run,
                    probe_write=bool(args.probe_write),
                    probe_source_id=(str(args.probe_source_id).strip() if args.probe_source_id else None),
                    supabase=supabase,
                )
                return
            for category_name in categories:
                remaining = None
                if args.limit is not None:
                    remaining = max(0, args.limit - len(all_rows))
                    if remaining <= 0:
                        break
                try:
                    rows = await scrape_category(
                        page=page,
                        category_name=category_name,
                        supabase=supabase,
                        limiter=limiter,
                        limit=remaining,
                        dry_run=args.dry_run,
                        resume=args.resume,
                        fetch_detail=not args.no_detail,
                        block_retry_seconds=max(1, args.block_retry_seconds),
                        max_block_streak=max(1, args.max_block_streak),
                        start_page=max(1, int(args.start_page)),
                        max_pages=args.max_pages,
                        page_delay_min=max(0.0, args.page_delay_min),
                        page_delay_max=max(0.0, args.page_delay_max),
                        force_detail_refresh=args.force_detail_refresh,
                    )
                    all_rows.extend(rows)
                    log.info("[%s] Scraped %s listings", category_name, len(rows))
                except AntiBotThresholdReached:
                    log.error("[%s] %s", category_name, _block_message())
                    continue
        finally:
            await context.close()
            await browser.close()

    if args.dry_run:
        _print_listings(all_rows)
    else:
        saved = upsert_listings(supabase, all_rows)
        log.info("Upserted %s/%s TAP listings", saved, len(all_rows))
        mark_inactive_listings(supabase, source_site="trade_a_plane", logger=log)


if __name__ == "__main__":
    asyncio.run(main())
