from __future__ import annotations

# 2026-03-05: Align GlobalAir scraper to shared Full Hangar scraper conventions.

import argparse
import json
import random
import re
import threading
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

try:
    from config import get_makes_for_tiers, get_manufacturer_tier, normalize_manufacturer
    from description_parser import parse_description
    from env_check import env_check
    from registration_parser import apply_registration_fields, extract_registration_from_text
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
    from scraper_health import looks_like_challenge_html as _shared_challenge_html
except ImportError:  # pragma: no cover
    from .config import get_makes_for_tiers, get_manufacturer_tier, normalize_manufacturer
    from .description_parser import parse_description
    from .env_check import env_check
    from .registration_parser import apply_registration_fields, extract_registration_from_text
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
    from .scraper_health import looks_like_challenge_html as _shared_challenge_html

load_dotenv()

SOURCE_SITE = "globalair"
BASE_URL = "https://www.globalair.com"
API_MODELS = f"{BASE_URL}/aircraft-for-sale/GetAllDistictAircraft"

CATEGORY_MAP = {
    "singles": "single-engine-piston",
    "single engine piston": "single-engine-piston",
    "twin pistons": "twin-engine-piston",
    "twin engine piston": "twin-engine-piston",
    "jets": "jets",
    "jet": "jets",
    "helicopter": "helicopters",
    "helicopters": "helicopters",
    "single engine turbine": "single-engine-turbine",
    "turbine": "single-engine-turbine",
    "twin turbines": "twin-engine-turbine",
    "twin engine turbine": "twin-engine-turbine",
    "amphibian": "amphibian",
    "light sport": "light-sport",
    "warbirds": "vintage",
    "vintage": "vintage",
    "warbird": "vintage",
    "experimental/kits": "experimental-kits",
    "commercial": "commercial",
}

TARGET_CATEGORIES = {
    "single-engine-piston",
    "twin-engine-piston",
    "jets",
    "helicopters",
    "single-engine-turbine",
    "twin-engine-turbine",
}

AIRCRAFT_TYPE_MAP = {
    "single-engine-piston": "single_engine_piston",
    "twin-engine-piston": "multi_engine_piston",
    "jets": "jet",
    "helicopters": "helicopter",
    "single-engine-turbine": "turboprop",
    "twin-engine-turbine": "turboprop",
}

US_STATE_NAME_TO_ABBR = {
    "alabama": "AL",
    "alaska": "AK",
    "arizona": "AZ",
    "arkansas": "AR",
    "california": "CA",
    "colorado": "CO",
    "connecticut": "CT",
    "delaware": "DE",
    "florida": "FL",
    "georgia": "GA",
    "idaho": "ID",
    "illinois": "IL",
    "indiana": "IN",
    "iowa": "IA",
    "kansas": "KS",
    "kentucky": "KY",
    "louisiana": "LA",
    "maine": "ME",
    "maryland": "MD",
    "massachusetts": "MA",
    "michigan": "MI",
    "minnesota": "MN",
    "mississippi": "MS",
    "missouri": "MO",
    "montana": "MT",
    "nebraska": "NE",
    "nevada": "NV",
    "new hampshire": "NH",
    "new jersey": "NJ",
    "new mexico": "NM",
    "new york": "NY",
    "north carolina": "NC",
    "north dakota": "ND",
    "ohio": "OH",
    "oklahoma": "OK",
    "oregon": "OR",
    "pennsylvania": "PA",
    "rhode island": "RI",
    "south carolina": "SC",
    "south dakota": "SD",
    "tennessee": "TN",
    "texas": "TX",
    "utah": "UT",
    "vermont": "VT",
    "virginia": "VA",
    "washington": "WA",
    "west virginia": "WV",
    "wisconsin": "WI",
    "wyoming": "WY",
}

MAX_RETRIES = 5
BASE_DELAY = 6.0
MAX_DELAY = 90.0
MIN_DELAY = 4.0
RUNTIME_MAX_RETRIES = MAX_RETRIES
CDP_CONNECT_TIMEOUT_MS = 20000

REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/145.0.0.0 Safari/537.36"
    ),
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": BASE_URL,
    "Referer": f"{BASE_URL}/aircraft-for-sale",
    "X-Requested-With": "XMLHttpRequest",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
}

PAGE_HEADERS = {
    "Accept-Language": "en-US,en;q=0.9",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
}

log = setup_logging(False)
STATE_DIR = Path(__file__).resolve().parent / "state"


class RateLimiter:
    def __init__(self, *, min_delay_seconds: float = MIN_DELAY, jitter_seconds: float = 0.6) -> None:
        self._last = 0.0
        self._lock = threading.Lock()
        self._min_delay_seconds = max(0.5, float(min_delay_seconds))
        self._jitter_seconds = max(0.0, float(jitter_seconds))

    def wait(self, extra: float = 0.0) -> None:
        with self._lock:
            elapsed = time.monotonic() - self._last
            jitter = random.uniform(0.0, self._jitter_seconds)
            needed = max(0, self._min_delay_seconds + jitter + extra - elapsed)
            if needed > 0:
                log.debug("Rate limit: sleeping %.1fs", needed)
                time.sleep(needed)
            self._last = time.monotonic()


def _backoff(attempt: int) -> float:
    return min(BASE_DELAY * (2**attempt) + random.uniform(0, 2), MAX_DELAY)


def _looks_like_challenge(page_url: str, html: str) -> bool:
    try:
        if _shared_challenge_html(html):
            return True
    except Exception:
        pass
    text = (html or "").lower()
    url = (page_url or "").lower()
    url_markers = (
        "__cf_chl",
        "/cdn-cgi/challenge-platform",
        "cf_chl_",
        "cf-challenge",
    )
    if any(marker in url for marker in url_markers):
        return True

    # Keep this strict: generic "cloudflare" can appear on healthy pages.
    text_markers = (
        "performing security verification",
        "verify you are not a bot",
        "incompatible browser extension or network configuration",
        "checking your browser before accessing",
        "please stand by, while we are checking your browser",
        "challenges.cloudflare.com",
    )
    return any(marker in text for marker in text_markers)


def _persist_block_artifacts(pw_page: Any, label: str) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    safe_label = re.sub(r"[^a-zA-Z0-9_\-]+", "_", label or "globalair")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    html_path = STATE_DIR / f"globalair_block_{safe_label}_{stamp}.html"
    png_path = STATE_DIR / f"globalair_block_{safe_label}_{stamp}.png"
    try:
        html_path.write_text(pw_page.content(), encoding="utf-8")
        pw_page.screenshot(path=str(png_path), full_page=True)
        log.warning("Saved block artifacts: %s and %s", html_path, png_path)
    except Exception as exc:
        log.debug("Failed to persist block artifacts: %s", exc)


def _create_browser(playwright: Any, headless: bool = True) -> tuple[Any, Any]:
    browser = playwright.chromium.launch(
        headless=headless,
        args=["--no-sandbox", "--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage"],
    )
    context = browser.new_context(
        user_agent=REQUEST_HEADERS["User-Agent"],
        viewport={"width": 1280, "height": 900},
        locale="en-US",
        timezone_id="America/New_York",
    )
    context.set_extra_http_headers(PAGE_HEADERS)
    context.add_init_script(
        """
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins',   { get: () => [1, 2, 3] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        """
    )
    return browser, context


def _create_cdp_session(playwright: Any, cdp_url: str) -> tuple[Any, Any, Any, bool]:
    log.debug("CDP step 1/4: connecting (timeout=%sms)", CDP_CONNECT_TIMEOUT_MS)
    browser = playwright.chromium.connect_over_cdp(cdp_url, timeout=CDP_CONNECT_TIMEOUT_MS)
    log.debug("CDP step 2/4: connected; inspecting contexts")
    if browser.contexts:
        context = browser.contexts[0]
        log.debug("CDP step 3/4: using existing context (pages=%s)", len(context.pages))
    else:
        context = browser.new_context()
        log.debug("CDP step 3/4: created new context")

    try:
        context.set_extra_http_headers(PAGE_HEADERS)
    except Exception:
        pass

    page = context.pages[0] if context.pages else context.new_page()
    log.debug("CDP step 4/4: page ready")
    # attached sessions should not auto-close the user's browser
    return browser, context, page, False


def _create_launch_session(playwright: Any, headless: bool) -> tuple[Any, Any, Any, bool]:
    browser, context = _create_browser(playwright, headless=headless)
    page = context.new_page()
    # launched sessions can be fully closed by scraper
    return browser, context, page, True


def warm_browser_session(pw_page: Any, rounds: int = 1) -> None:
    """
    Build a realistic navigation chain before API and listing requests.
    """
    warm_urls = [
        BASE_URL,
        f"{BASE_URL}/aircraft-for-sale",
    ]
    for _ in range(max(1, rounds)):
        for target_url in warm_urls:
            try:
                pw_page.goto(target_url, wait_until="domcontentloaded", timeout=35000)
                if random.random() < 0.45:
                    pw_page.mouse.wheel(0, random.randint(150, 550))
                time.sleep(1.2 + random.uniform(0.3, 0.9))
            except Exception as exc:
                log.debug("Warm-up navigation failed for %s: %s", target_url, exc)


def manual_checkpoint_if_requested(pw_page: Any, args: argparse.Namespace) -> bool:
    if not args.manual_checkpoint:
        return True
    if args.headless.lower() not in ("false", "0", "no"):
        log.warning("--manual-checkpoint requested but browser is headless; forcing interactive steps may fail.")
    checkpoint_url = str(args.checkpoint_url or f"{BASE_URL}/aircraft-for-sale").strip()
    pw_page.goto(checkpoint_url, wait_until="domcontentloaded", timeout=35000)
    print("")
    print("=== Manual checkpoint enabled ===")
    print(f"1) Browser opened to: {checkpoint_url}")
    print("2) If prompted, complete any CAPTCHA/challenge manually in that browser.")
    print("3) After page appears normal, return here and press Enter.")
    input("Press Enter to continue scraping...")
    time.sleep(1.5)
    try:
        current_url = str(pw_page.url or "")
        html = pw_page.content()
        if _looks_like_challenge(current_url, html):
            log.warning("Manual checkpoint completed but challenge still appears active at %s", current_url)
            _persist_block_artifacts(pw_page, "manual_checkpoint_still_blocked")
            return False
        else:
            log.info("Manual checkpoint appears successful; continuing scrape.")
            return True
    except Exception as exc:
        log.debug("Manual checkpoint verification failed: %s", exc)
    return False


def fetch_page(pw_page: Any, url: str, rl: RateLimiter, label: str = "") -> Optional[BeautifulSoup]:
    for attempt in range(max(1, RUNTIME_MAX_RETRIES)):
        rl.wait()
        try:
            resp = pw_page.goto(url, wait_until="domcontentloaded", timeout=35000)
            current_url = str(pw_page.url or "")
            html = pw_page.content()
            if _looks_like_challenge(current_url, html):
                log.warning("Challenge page detected for [%s] at %s", label, current_url)
                _persist_block_artifacts(pw_page, label or "listing")
                return None
            if resp and resp.status == 200:
                if random.random() < 0.35:
                    time.sleep(random.uniform(0.25, 1.0))
                return BeautifulSoup(html, "html.parser")
            if resp and resp.status in (429, 403, 503):
                wait = _backoff(attempt)
                log.warning("HTTP %s [%s]. Waiting %.1fs", resp.status, label, wait)
                if resp.status == 403 and attempt == 0:
                    _persist_block_artifacts(pw_page, label or "listing")
                time.sleep(wait)
                continue
            log.warning("HTTP %s [%s] attempt %s", (resp.status if resp else "?"), label, attempt + 1)
        except Exception as exc:
            wait = _backoff(attempt)
            log.warning("Fetch error: %s. Retry in %.1fs [%s]", exc, wait, label)
            time.sleep(wait)
    log.error("All retries failed: %s", url)
    return None


def build_http_session_from_browser_context(context: Any) -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": REQUEST_HEADERS["User-Agent"],
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": REQUEST_HEADERS["Accept-Language"],
            "Referer": f"{BASE_URL}/aircraft-for-sale",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        }
    )
    try:
        for cookie in context.cookies(BASE_URL):
            name = str(cookie.get("name") or "")
            value = str(cookie.get("value") or "")
            domain = str(cookie.get("domain") or ".globalair.com")
            path = str(cookie.get("path") or "/")
            if name and value:
                session.cookies.set(name, value, domain=domain, path=path)
    except Exception as exc:
        log.debug("Unable to load cookies from browser context for HTTP mode: %s", exc)
    return session


def fetch_page_http(session: requests.Session, url: str, rl: RateLimiter, label: str = "") -> Optional[BeautifulSoup]:
    for attempt in range(max(1, RUNTIME_MAX_RETRIES)):
        rl.wait()
        try:
            response = session.get(url, timeout=35, allow_redirects=True)
            final_url = str(response.url or url)
            html = response.text or ""
            if _looks_like_challenge(final_url, html):
                log.warning("HTTP mode challenge detected for [%s] at %s", label, final_url)
                return None
            if response.status_code == 200:
                return BeautifulSoup(html, "html.parser")
            if response.status_code in (403, 429, 503):
                wait = _backoff(attempt)
                log.warning("HTTP mode status %s [%s]. Waiting %.1fs", response.status_code, label, wait)
                time.sleep(wait)
                continue
            log.warning("HTTP mode status %s [%s]", response.status_code, label)
            return None
        except requests.RequestException as exc:
            wait = _backoff(attempt)
            log.warning("HTTP mode fetch error: %s. Retry in %.1fs [%s]", exc, wait, label)
            time.sleep(wait)
    return None


def fetch_all_models(cookie_header: str | None = None) -> list[str]:
    try:
        headers = {**REQUEST_HEADERS, "Content-Length": "0"}
        if cookie_header:
            headers["Cookie"] = cookie_header
        resp = requests.post(API_MODELS, headers=headers, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list):
                log.info("API returned %s model names", len(data))
                return data
        log.error("Model API returned HTTP %s", resp.status_code)
    except Exception as exc:
        log.error("Model API error: %s", exc)
    return []


def fetch_all_models_in_browser(pw_page: Any) -> list[str]:
    script = """
        async (apiUrl) => {
            try {
                const res = await fetch(apiUrl, {
                    method: "POST",
                    headers: {
                        "X-Requested-With": "XMLHttpRequest",
                        "Content-Length": "0"
                    },
                    credentials: "include"
                });
                const status = res.status;
                if (!res.ok) {
                    return { status, data: null };
                }
                const data = await res.json();
                return { status, data };
            } catch (error) {
                return { status: 0, data: null, error: String(error) };
            }
        }
    """
    try:
        result = pw_page.evaluate(script, API_MODELS)
        if isinstance(result, dict):
            status = result.get("status")
            data = result.get("data")
            if status == 200 and isinstance(data, list):
                log.info("Browser-session API returned %s model names", len(data))
                return data
            log.warning("Browser-session model API returned status %s", status)
    except Exception as exc:
        log.warning("Browser-session model API failed: %s", exc)
    return []


def _slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9\s\-]", "", slug)
    slug = re.sub(r"\s+", "-", slug)
    slug = re.sub(r"-{2,}", "-", slug)
    return slug.strip("-")


def _extract_category(model_name: str) -> tuple[str, str]:
    match = re.match(r"^(.+?)\s*\(([^)]+)\)\s*$", model_name.strip())
    if match:
        clean_name = match.group(1).strip()
        cat_raw = match.group(2).strip().lower()
        return clean_name, CATEGORY_MAP.get(cat_raw, "")
    return model_name.strip(), "single-engine-piston"


def models_to_url_targets(model_names: list[str]) -> list[dict[str, str]]:
    targets: list[dict[str, str]] = []
    seen_urls: set[str] = set()

    for raw in model_names:
        clean_name, cat_path = _extract_category(raw)
        if cat_path not in TARGET_CATEGORIES:
            continue

        slug = _slugify(clean_name)
        url = f"{BASE_URL}/aircraft-for-sale/{cat_path}/{slug}"
        if url in seen_urls:
            continue

        targets.append(
            {
                "model_name": clean_name,
                "category_path": cat_path,
                "aircraft_type": AIRCRAFT_TYPE_MAP.get(cat_path, "single_engine_piston"),
                "slug": slug,
                "url": url,
            }
        )
        seen_urls.add(url)

    log.info("Converted %s model names -> %s target URLs", len(model_names), len(targets))
    return targets


def build_manual_model_target(model_name: str, category: str | None = None) -> dict[str, str]:
    category_path = (category or "single-engine-piston").replace("_", "-").strip().lower()
    if not category_path:
        category_path = "single-engine-piston"
    return {
        "model_name": model_name.strip(),
        "category_path": category_path,
        "aircraft_type": AIRCRAFT_TYPE_MAP.get(category_path, "single_engine_piston"),
        "slug": _slugify(model_name),
        "url": f"{BASE_URL}/aircraft-for-sale/{category_path}/{_slugify(model_name)}",
    }


def build_fallback_targets_for_category(
    category: str,
    *,
    tier_args: list[str] | None = None,
    max_makes: int = 10,
) -> list[dict[str, str]]:
    category_path = (category or "single-engine-piston").replace("_", "-").strip().lower()
    makes = get_makes_for_tiers(tier_args or ["1"])
    if max_makes > 0:
        makes = makes[:max_makes]

    targets: list[dict[str, str]] = []
    seen_urls: set[str] = set()
    for make in makes:
        target = build_manual_model_target(make, category_path)
        if target["url"] in seen_urls:
            continue
        targets.append(target)
        seen_urls.add(target["url"])
    return targets


def _extract_icon_field(card: Any, icon_name: str) -> Optional[str]:
    img = card.find("img", src=re.compile(icon_name, re.I))
    if not img:
        return None
    parent = img.parent
    if not parent:
        return None
    text = parent.get_text(strip=True)
    return re.sub(r"^\s*\S+\s*", "", text).strip() or text.strip()


def _get_listing_id(card: Any) -> Optional[str]:
    updated = str(card.get("data-updated", "")).strip()
    if updated.isdigit():
        return updated

    link = card.find("a", class_="result-title") or card.find("a", href=re.compile(r"/listing-detail/"))
    if not link:
        return None
    href = str(link.get("href", ""))
    match = re.search(r"/(\d+)$", href)
    return match.group(1) if match else None


def _get_detail_url(card: Any) -> Optional[str]:
    link = card.find("a", class_="result-title") or card.find("a", href=re.compile(r"/listing-detail/"))
    if not link:
        return None
    href = str(link.get("href", "")).strip()
    if not href:
        return None
    return urljoin(BASE_URL, href)


def _parse_title(title: str) -> tuple[Optional[int], Optional[str], Optional[str]]:
    match = re.match(r"^(\d{4})\s+(\S+)\s+(.+)$", title.strip())
    if match:
        return int(match.group(1)), match.group(2), match.group(3).strip()
    fallback = re.match(r"^(\d{4})\s+(.+)$", title.strip())
    if fallback:
        return int(fallback.group(1)), None, fallback.group(2).strip()
    return None, None, None


def _classify_seller(text: str) -> str:
    if not text or text.upper() == "PRIVATE SELLER":
        return "private"
    dealer_terms = ["LLC", "INC", "CORP", "AVIATION", "SALES", "AIR", "AIRCRAFT", "JETS"]
    return "dealer" if any(term in text.upper() for term in dealer_terms) else "private"


def _split_location(location: str | None) -> tuple[Optional[str], Optional[str]]:
    if not location:
        return None, None
    text = re.sub(r"\s+", " ", location).strip()
    if not text:
        return None, None
    lower = text.lower()

    # Filter frequent card-noise miscaptures (avionics lines, etc.).
    noise_markers = ("autopilot", "garmin", "g1000", "avionics", "transponder", "ads-b")
    if any(marker in lower for marker in noise_markers):
        return None, None

    state_name_match = US_STATE_NAME_TO_ABBR.get(lower)
    if state_name_match:
        return None, state_name_match

    paren_match = re.match(r"^(.+?)\s*\(([^)]+)\)\s*$", text)
    if paren_match:
        base = paren_match.group(1).strip()
        country_hint = paren_match.group(2).strip().lower()
        base_state = US_STATE_NAME_TO_ABBR.get(base.lower())
        if country_hint in {"usa", "us", "united states", "united states of america"} and base_state:
            return None, base_state
        return base, None

    if re.match(r"^.+,\s*[A-Z]{2}$", text):
        city, state = [part.strip() for part in text.rsplit(",", 1)]
        return city, state.upper()
    match = re.search(r"\b([A-Z]{2})\b", text)
    return text, (match.group(1) if match else None)


def _is_marketing_noise_text(text: str) -> bool:
    lower = (text or "").lower()
    markers = (
        "subscribe to airmail",
        "avblast",
        "choose your avblast classifications",
        "please choose at least one",
        "we do not support such email formats",
        "receive communications fromglobalair.com",
    )
    return any(marker in lower for marker in markers)


def _clean_text_block(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()


def parse_card(card: Any, aircraft_type: str, model_name: str) -> Optional[dict[str, Any]]:
    listing_id = _get_listing_id(card)
    if not listing_id:
        return None

    detail_url = _get_detail_url(card)
    price_raw = str(card.get("data-price", "")).strip()
    year_raw = str(card.get("data-year", "")).strip()
    tt_raw = str(card.get("data-totaltime", "")).strip()

    asking_price = int(price_raw) if price_raw.isdigit() else None
    year = int(year_raw) if re.match(r"^\d{4}$", year_raw) else None
    ttaf = int(re.sub(r"[^\d]", "", tt_raw)) if tt_raw else None

    title_el = card.find("a", class_="result-title") or card.find("h3")
    title = title_el.get_text(strip=True) if title_el else ""
    card_year, make, model = _parse_title(title)
    year = year or card_year

    serial_number = _extract_icon_field(card, "serialnumber")
    n_number = _extract_icon_field(card, "registrationnumber")
    card_text = card.get_text(" ", strip=True)
    inferred_registration = extract_registration_from_text(card_text)
    registration_candidate = n_number or inferred_registration
    tt_from_icon = _extract_icon_field(card, "totaltime")
    if ttaf is None and tt_from_icon:
        match = re.search(r"(\d[\d,]+)", tt_from_icon)
        if match:
            ttaf = int(match.group(1).replace(",", ""))

    seller_el = card.find("a", href=re.compile(r"/listings-by-seller/"))
    seller_name = seller_el.get_text(strip=True) if seller_el else None
    seller_type = _classify_seller(seller_name or "")

    loc_el = card.find("div", class_=re.compile(r"result-broker-notes|broker", re.I))
    location_raw = loc_el.get_text(strip=True)[:200] if loc_el else None
    location_city, location_state = _split_location(location_raw)

    image_url: Optional[str] = None
    img = card.find("img", class_=re.compile(r"img-fluid|aircraft-img", re.I)) or card.find("img")
    if img:
        src = str(img.get("src") or img.get("data-src") or "").strip()
        if src and not src.endswith(".png") and "coming-soon" not in src.lower():
            image_url = src if src.startswith("http") else urljoin(BASE_URL, src)

    sid = f"ga_{listing_id}"
    listing = {
        "source_site": SOURCE_SITE,
        "listing_source": SOURCE_SITE,
        "source_id": sid,
        "source_listing_id": sid,
        "url": detail_url,
        "title": title,
        "year": year,
        "make": make,
        "model": model or model_name,
        "aircraft_type": aircraft_type,
        "price_asking": asking_price,
        "asking_price": asking_price,
        "n_number": n_number,
        "serial_number": serial_number,
        "total_time_airframe": ttaf,
        "seller_name": seller_name,
        "seller_type": seller_type,
        "location_raw": location_raw,
        "location_city": location_city,
        "location_state": location_state,
        "primary_image_url": image_url,
        "image_urls": [image_url] if image_url else None,
        "condition": "used",
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "description": None,
        "description_full": None,
        "avionics_notes": None,
        "airframe_notes": None,
        "engine_notes": None,
        "maintenance_notes": None,
        "interior_notes": None,
        "engine_time_since_overhaul": None,
        "time_since_overhaul": None,
    }
    apply_registration_fields(
        listing,
        raw_value=registration_candidate,
        fallback_text=card_text,
        keep_existing_n_number=True,
    )
    return listing


def scrape_model_page(pw_page: Any, url: str, rl: RateLimiter, aircraft_type: str, model_name: str) -> list[dict[str, Any]]:
    soup = fetch_page(pw_page, url, rl, label=model_name)
    if not soup:
        return []

    load_count = 1
    while True:
        try:
            if not pw_page.query_selector("button#loadPageX") or not pw_page.is_visible("button#loadPageX"):
                break
            log.debug("  Clicking Load More (page %s) [%s]", load_count + 1, model_name)
            rl.wait(extra=1.0)
            pw_page.click("button#loadPageX")
            pw_page.wait_for_load_state("networkidle", timeout=15000)
            load_count += 1
        except Exception as exc:
            log.debug("  Load More ended: %s", exc)
            break

    soup = BeautifulSoup(pw_page.content(), "html.parser")
    cards = soup.find_all("div", class_=lambda cls: bool(cls) and "list-item" in cls and "result-container" in cls)
    log.info("  [%s] %s cards (%s load(s))", model_name, len(cards), load_count)
    return [parsed for parsed in (parse_card(card, aircraft_type, model_name) for card in cards) if parsed]


def scrape_model_page_http(
    session: requests.Session,
    url: str,
    rl: RateLimiter,
    aircraft_type: str,
    model_name: str,
) -> list[dict[str, Any]]:
    soup = fetch_page_http(session, url, rl, label=f"http:{model_name}")
    if not soup:
        return []
    cards = soup.find_all("div", class_=lambda cls: bool(cls) and "list-item" in cls and "result-container" in cls)
    log.info("  [%s] HTTP mode parsed %s cards (first page only)", model_name, len(cards))
    return [parsed for parsed in (parse_card(card, aircraft_type, model_name) for card in cards) if parsed]


def scrape_detail(pw_page: Any, url: str, rl: RateLimiter) -> dict[str, Any]:
    soup = fetch_page(pw_page, url, rl, label="detail")
    if not soup:
        return {}

    extra: dict[str, Any] = {}

    price_el = soup.find("span", id="convertedPrice")
    if price_el:
        digits = re.sub(r"[^\d]", "", price_el.get_text())
        if digits:
            extra["asking_price"] = int(digits)
            extra["price_asking"] = int(digits)

    for row in soup.find_all("div", class_="row"):
        cols = row.find_all("div", class_="col", recursive=False)
        if len(cols) != 2:
            continue
        label = cols[0].get_text(strip=True).lower().rstrip(":")
        value = cols[1].get_text(strip=True)
        if not label or not value:
            continue

        if label == "year":
            try:
                extra["year"] = int(value)
            except ValueError:
                pass
        elif "location" in label:
            extra["location_raw"] = value
            city, state = _split_location(value)
            extra["location_city"] = city
            extra["location_state"] = state
        elif "serial" in label:
            extra["serial_number"] = value
        elif "registration" in label or "tail number" in label:
            apply_registration_fields(extra, raw_value=value, fallback_text=value, keep_existing_n_number=True)
        elif "total time" in label or label == "tt":
            digits = re.sub(r"[^\d]", "", value)
            if digits:
                extra["total_time_airframe"] = int(digits)
        elif "manufacturer" in label:
            extra["make"] = value

    summary_candidates: list[str] = []
    for div in soup.find_all("div", class_=re.compile(r"^(col|row|mb|mt|pt|pb)[-\d]", re.I)):
        text = _clean_text_block(div.get_text(strip=True))
        if 50 < len(text) < 2500 and not div.find("h4") and not _is_marketing_noise_text(text):
            summary_candidates.append(text)

    section_map = {
        "aircraft summary": "description_full",
        "summary": "description_full",
        "avionics": "avionics_notes",
        "airframe": "airframe_notes",
        "engine": "engine_notes",
        "maintenance": "maintenance_notes",
        "exterior": "interior_notes",
        "interior": "interior_notes",
    }
    for section_div in soup.find_all("div", class_=lambda cls: bool(cls) and "mobileLHDtl" in cls):
        heading = section_div.find("h4", class_=re.compile(r"text-darkblue", re.I))
        if not heading:
            continue
        header = heading.get_text(strip=True).lower()
        content = section_div.get_text(separator="\n", strip=True).replace(heading.get_text(strip=True), "", 1).strip()[:3000]
        if _is_marketing_noise_text(content):
            continue
        for key, field in section_map.items():
            if key in header:
                if field == "description_full":
                    cleaned = _clean_text_block(content)
                    if cleaned:
                        extra["description_full"] = cleaned[:3500]
                        extra["description"] = cleaned[:3500]
                else:
                    extra[field] = content
                break

    if not extra.get("description_full") and summary_candidates:
        summary = max(summary_candidates, key=len)[:3500]
        extra["description"] = summary
        extra["description_full"] = summary

    full_text = soup.get_text(" ").upper()
    if not extra.get("registration_normalized") and not extra.get("n_number"):
        inferred_registration = extract_registration_from_text(full_text)
        if inferred_registration:
            apply_registration_fields(
                extra,
                raw_value=inferred_registration,
                fallback_text=full_text,
                keep_existing_n_number=True,
            )
    smoh = re.search(r"(?:SMOH|TSMOH|TSO|SOH|SINCE\s+(?:MAJOR\s+)?O/?H)\s*[:\-]?\s*([\d,]+)", full_text)
    if smoh:
        try:
            tso_value = int(smoh.group(1).replace(",", ""))
            extra["time_since_overhaul"] = tso_value
            extra["engine_time_since_overhaul"] = tso_value
        except ValueError:
            pass

    if not extra.get("avionics_notes"):
        avionics_terms = [
            "G1000",
            "G500",
            "G700",
            "GTN750",
            "GTN650",
            "WAAS",
            "ADS-B",
            "GARMIN",
            "ASPEN",
            "DYNON",
            "AVIDYNE",
            "AUTOPILOT",
            "GLASS PANEL",
            "G3X",
        ]
        found = [kw for kw in avionics_terms if kw in full_text]
        if found:
            extra["avionics_notes"] = ", ".join(found[:12])

    gallery_urls = _extract_gallery_urls(soup)
    if gallery_urls:
        extra["image_urls"] = gallery_urls
        extra["primary_image_url"] = gallery_urls[0]

    return extra


def scrape_detail_http(session: requests.Session, url: str, rl: RateLimiter) -> dict[str, Any]:
    soup = fetch_page_http(session, url, rl, label="http:detail")
    if not soup:
        return {}
    extra: dict[str, Any] = {}

    price_el = soup.find("span", id="convertedPrice")
    if price_el:
        digits = re.sub(r"[^\d]", "", price_el.get_text())
        if digits:
            extra["asking_price"] = int(digits)
            extra["price_asking"] = int(digits)

    for row in soup.find_all("div", class_="row"):
        cols = row.find_all("div", class_="col", recursive=False)
        if len(cols) != 2:
            continue
        label = cols[0].get_text(strip=True).lower().rstrip(":")
        value = cols[1].get_text(strip=True)
        if not label or not value:
            continue
        if label == "year":
            try:
                extra["year"] = int(value)
            except ValueError:
                pass
        elif "location" in label:
            extra["location_raw"] = value
            city, state = _split_location(value)
            extra["location_city"] = city
            extra["location_state"] = state
        elif "serial" in label:
            extra["serial_number"] = value
        elif "registration" in label or "tail number" in label:
            apply_registration_fields(extra, raw_value=value, fallback_text=value, keep_existing_n_number=True)
        elif "total time" in label or label == "tt":
            digits = re.sub(r"[^\d]", "", value)
            if digits:
                extra["total_time_airframe"] = int(digits)
        elif "manufacturer" in label:
            extra["make"] = value

    full_text = soup.get_text(" ").upper()
    if not extra.get("registration_normalized") and not extra.get("n_number"):
        inferred_registration = extract_registration_from_text(full_text)
        if inferred_registration:
            apply_registration_fields(
                extra,
                raw_value=inferred_registration,
                fallback_text=full_text,
                keep_existing_n_number=True,
            )

    summary_candidates: list[str] = []
    for div in soup.find_all("div", class_=re.compile(r"^(col|row|mb|mt|pt|pb)[-\d]", re.I)):
        text = _clean_text_block(div.get_text(strip=True))
        if 50 < len(text) < 2500 and not div.find("h4") and not _is_marketing_noise_text(text):
            summary_candidates.append(text)

    section_map = {
        "aircraft summary": "description_full",
        "summary": "description_full",
        "avionics": "avionics_notes",
        "airframe": "airframe_notes",
        "engine": "engine_notes",
        "maintenance": "maintenance_notes",
        "exterior": "interior_notes",
        "interior": "interior_notes",
    }
    for section_div in soup.find_all("div", class_=lambda cls: bool(cls) and "mobileLHDtl" in cls):
        heading = section_div.find("h4", class_=re.compile(r"text-darkblue", re.I))
        if not heading:
            continue
        header = heading.get_text(strip=True).lower()
        content = section_div.get_text(separator="\n", strip=True).replace(heading.get_text(strip=True), "", 1).strip()[:3000]
        if _is_marketing_noise_text(content):
            continue
        for key, field in section_map.items():
            if key in header:
                if field == "description_full":
                    cleaned = _clean_text_block(content)
                    if cleaned:
                        extra["description_full"] = cleaned[:3500]
                        extra["description"] = cleaned[:3500]
                else:
                    extra[field] = content
                break

    if not extra.get("description_full") and summary_candidates:
        summary = max(summary_candidates, key=len)[:3500]
        extra["description"] = summary
        extra["description_full"] = summary

    gallery_urls = _extract_gallery_urls(soup)
    if gallery_urls:
        extra["image_urls"] = gallery_urls
        extra["primary_image_url"] = gallery_urls[0]

    return extra


def _extract_gallery_urls(soup: BeautifulSoup) -> list[str]:
    gallery_urls: list[str] = []
    seen: set[str] = set()
    for img in soup.select("img[src], img[data-src]"):
        src = str(img.get("data-src") or img.get("src") or "").strip()
        if not src:
            continue
        full = src if src.startswith("http") else urljoin(BASE_URL, src)
        low = full.lower()
        if low.endswith(".svg"):
            continue
        if any(token in low for token in ("logo", "icon", "sprite", "banner", "coming-soon", "placeholder")):
            continue
        if full in seen:
            continue
        seen.add(full)
        gallery_urls.append(full)
    return gallery_urls[:25]


def _fetch_existing_state(supabase: Any, source_ids: list[str]) -> dict[str, dict[str, Any]]:
    return fetch_existing_state(
        supabase,
        source_site=SOURCE_SITE,
        source_ids=source_ids,
        select_columns="source_id,first_seen_date,last_seen_date,listing_fingerprint,is_active",
    )


def _should_skip_detail(existing_row: dict[str, Any] | None, stale_days: int) -> bool:
    return should_skip_detail(existing_row, stale_days)


def _upsert_listings(supabase: Any, rows: list[dict[str, Any]], *, skip_unchanged_writes: bool = True) -> int:
    if not rows:
        return 0

    today_iso = date.today().isoformat()
    existing_map = _fetch_existing_state(supabase, [str(row.get("source_id")) for row in rows if row.get("source_id")])
    out_rows: list[dict[str, Any]] = []
    obs_rows: list[dict[str, Any]] = []
    unchanged_source_ids: list[str] = []

    for raw in rows:
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
        if cleaned.get("source_listing_id") is None and cleaned.get("source_id"):
            cleaned["source_listing_id"] = cleaned["source_id"]

        sid = str(cleaned.get("source_id") or "")
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

        existing_fingerprint = str(existing.get("listing_fingerprint") or "") if existing else ""
        current_fingerprint = str(cleaned.get("listing_fingerprint") or "")
        existing_is_active = bool(existing.get("is_active")) if existing else False
        if (
            skip_unchanged_writes
            and existing
            and existing_fingerprint
            and existing_fingerprint == current_fingerprint
            and existing_is_active
        ):
            unchanged_source_ids.append(sid)
            continue

        out_rows.append(cleaned)
        obs_rows.append(
            {
                "source_site": SOURCE_SITE,
                "source_id": sid,
                "observed_on": today_iso,
                "observed_at": f"{today_iso}T00:00:00Z",
                "asking_price": cleaned.get("price_asking"),
                "url": cleaned.get("url"),
                "title": cleaned.get("title"),
                "listing_fingerprint": cleaned.get("listing_fingerprint"),
                "is_active": True,
            }
        )

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
    if not out_rows:
        return refreshed_unchanged

    all_keys: set[str] = set()
    for row in out_rows:
        all_keys.update(row.keys())
    for row in out_rows:
        for key in all_keys:
            row.setdefault(key, None)

    saved = safe_upsert_with_fallback(
        supabase=supabase,
        table="aircraft_listings",
        rows=out_rows,
        on_conflict="source_site,source_id",
        fallback_match_keys=["source_site", "source_id"],
        logger=log,
    )

    if obs_rows:
        try:
            supabase.table("listing_observations").upsert(
                obs_rows,
                on_conflict="source_site,source_id,observed_on",
            ).execute()
        except Exception as exc:
            log.warning("Observation upsert failed: %s", exc)

    return saved + refreshed_unchanged


def _mark_inactive_listings(supabase: Any, inactive_after_missed_runs: int) -> int:
    return mark_inactive_listings(
        supabase,
        source_site=SOURCE_SITE,
        inactive_after_missed_runs=inactive_after_missed_runs,
        logger=log,
    )


def _get_existing_ids(supabase: Any) -> set[str]:
    result = supabase.table("aircraft_listings").select("source_id").eq("source_site", SOURCE_SITE).execute()
    return {str(row.get("source_id")) for row in (result.data or []) if row.get("source_id")}


def run(args: argparse.Namespace) -> None:
    from playwright.sync_api import sync_playwright

    log.info("=== GlobalAir scraper starting ===")
    env_check(required=[] if args.dry_run else None)
    headless = args.headless.lower() not in ("false", "0", "no")
    global RUNTIME_MAX_RETRIES
    RUNTIME_MAX_RETRIES = max(1, int(args.max_retries))
    rl = RateLimiter(min_delay_seconds=args.min_delay, jitter_seconds=args.delay_jitter)

    supabase = None if args.dry_run else get_supabase()
    existing_ids: set[str] = set()
    if supabase and args.resume:
        existing_ids = _get_existing_ids(supabase)
        log.info("Resume mode: %s existing GlobalAir IDs in DB", len(existing_ids))

    all_listings: list[dict[str, Any]] = []
    total_saved = 0

    with sync_playwright() as playwright:
        if args.cdp_url:
            log.info("Connecting to existing browser over CDP: %s", args.cdp_url)
            browser, context, pw_page, managed_session = _create_cdp_session(playwright, args.cdp_url)
        else:
            browser, context, pw_page, managed_session = _create_launch_session(playwright, headless=headless)

        try:
            warm_browser_session(pw_page, rounds=args.warmup_rounds)
            checkpoint_ok = manual_checkpoint_if_requested(pw_page, args)
            if not checkpoint_ok:
                log.error(
                    "Stopping run: manual checkpoint did not clear Cloudflare challenge. "
                    "Disable blocking extensions/network filters and retry."
                )
                return
            log.info("Fetching model list from GlobalAir API...")
            raw_models: list[str] = []
            if args.skip_model_api:
                log.warning("--skip-model-api enabled: bypassing model discovery API.")
            else:
                raw_models = fetch_all_models()
            if not raw_models:
                log.warning("Direct model API blocked; warming session via Playwright and retrying with cookies.")
                if not args.skip_model_api:
                    try:
                        warm_browser_session(pw_page, rounds=1)
                        cookie_items = context.cookies(BASE_URL)
                        cookie_header = "; ".join(
                            f"{item.get('name', '')}={item.get('value', '')}"
                            for item in cookie_items
                            if item.get("name") and item.get("value")
                        )
                        raw_models = fetch_all_models(cookie_header=cookie_header or None)
                    except Exception as exc:
                        log.warning("Session warm-up failed: %s", exc)
            if not raw_models:
                if not args.skip_model_api:
                    log.warning("Cookie retry blocked; attempting model API call inside browser session.")
                    raw_models = fetch_all_models_in_browser(pw_page)

            if not raw_models:
                if args.model:
                    raw_model_parts = [part.strip() for part in args.model.split(",") if part.strip()]
                    if not raw_model_parts:
                        raw_model_parts = [args.model.strip()]
                    targets = [build_manual_model_target(model_name, args.category) for model_name in raw_model_parts if model_name]
                    log.warning(
                        "Model API unavailable; using direct model URL fallback for '%s'",
                        args.model,
                    )
                elif args.category:
                    targets = build_fallback_targets_for_category(
                        args.category,
                        tier_args=args.fallback_tiers,
                        max_makes=args.fallback_max_makes,
                    )
                    log.warning(
                        "Model API unavailable; category fallback generated %s targets for '%s' using tiers %s",
                        len(targets),
                        args.category,
                        args.fallback_tiers,
                    )
                else:
                    targets = build_fallback_targets_for_category(
                        "single-engine-piston",
                        tier_args=args.fallback_tiers,
                        max_makes=args.fallback_max_makes,
                    )
                    log.warning(
                        "Model API unavailable with no model/category supplied; using default fallback (%s targets).",
                        len(targets),
                    )
            else:
                targets = models_to_url_targets(raw_models)
                if args.model:
                    targets = [target for target in targets if args.model.lower() in target["model_name"].lower()]
                    log.info("Filtered to %s target(s) matching '%s'", len(targets), args.model)
                elif args.category:
                    category_path = args.category.replace("_", "-")
                    targets = [target for target in targets if target["category_path"] == category_path]
                    log.info("Filtered to %s target(s) for category '%s'", len(targets), category_path)

            if args.limit and args.limit > 0:
                targets = targets[: args.limit]
                log.info("Applying target limit: %s model pages", len(targets))

            if not targets:
                log.error("No targets after filtering. Check --model/--category values.")
                return

            http_session: Optional[requests.Session] = None
            if args.http_only:
                http_session = build_http_session_from_browser_context(context)
                log.info("HTTP-only mode enabled: using browser cookies + requests for listing/detail fetches.")

            for idx, target in enumerate(targets, 1):
                log.info("\n[%s/%s] %s -> %s", idx, len(targets), target["model_name"], target["url"])
                if args.http_only and http_session is not None:
                    listings = scrape_model_page_http(http_session, target["url"], rl, target["aircraft_type"], target["model_name"])
                else:
                    listings = scrape_model_page(pw_page, target["url"], rl, target["aircraft_type"], target["model_name"])
                if not listings:
                    log.info("  0 listings (empty or 404)")
                    continue

                existing_map: dict[str, dict[str, Any]] = {}
                if supabase:
                    source_ids = [str(row.get("source_id")) for row in listings if row.get("source_id")]
                    existing_map = _fetch_existing_state(supabase, source_ids)

                if not args.no_detail:
                    for item_idx, listing in enumerate(listings):
                        source_id = str(listing.get("source_id") or "")
                        detail_url = str(listing.get("url") or "")
                        if not detail_url:
                            continue
                        if args.resume and source_id in existing_ids:
                            continue
                        if _should_skip_detail(existing_map.get(source_id), args.detail_stale_days):
                            continue
                        log.debug("  Detail %s/%s: %s", item_idx + 1, len(listings), source_id)
                        if args.http_only and http_session is not None:
                            details = scrape_detail_http(http_session, detail_url, rl)
                        else:
                            details = scrape_detail(pw_page, detail_url, rl)
                        if details:
                            listing.update(details)

                if args.dry_run:
                    all_listings.extend(listings)
                    for preview in listings[:2]:
                        print(json.dumps(preview, indent=2, default=str))
                else:
                    to_save = [listing for listing in listings if str(listing.get("source_id") or "") not in existing_ids]
                    saved = _upsert_listings(supabase, to_save) if to_save else 0
                    total_saved += saved
                    log.info("  Saved %s/%s", saved, len(to_save))

        finally:
            if managed_session:
                pw_page.close()
                context.close()
                browser.close()

    if args.dry_run:
        output_path = Path(args.output or "globalair_dry_run.json")
        output_path.write_text(json.dumps(all_listings, indent=2, default=str), encoding="utf-8")
        log.info("Dry run complete: %s listings written to %s", len(all_listings), output_path)
        return

    marked_inactive = _mark_inactive_listings(supabase, args.inactive_after_missed_runs)
    log.info("GlobalAir scrape complete. saved=%s marked_inactive=%s", total_saved, marked_inactive)


def main() -> None:
    parser = argparse.ArgumentParser(description="GlobalAir scraper aligned to Full Hangar conventions")
    parser.add_argument("--model", help="Filter to model names matching text (e.g. Cessna 172)")
    parser.add_argument("--category", help="Filter category path (single_engine, jets, helicopters, etc.)")
    parser.add_argument("--dry-run", action="store_true", help="Parse listings without database writes")
    parser.add_argument("--no-detail", action="store_true", help="Skip detail pages")
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
        help="Mark inactive only after missing for N runs/days (default: 3).",
    )
    parser.add_argument("--resume", action="store_true", help="Skip listings that already exist in database")
    parser.add_argument("--headless", default="true", help="Set to false to see browser")
    parser.add_argument("--cdp-url", default="", help="Attach to existing browser via CDP (e.g. http://localhost:9222)")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging")
    parser.add_argument("--output", default="", help="Output JSON path for dry-run mode")
    parser.add_argument("--limit", type=int, default=0, help="Max model pages to process")
    parser.add_argument("--max-retries", type=int, default=MAX_RETRIES, help="HTTP retry attempts per page")
    parser.add_argument("--min-delay", type=float, default=MIN_DELAY, help="Base seconds between requests")
    parser.add_argument("--delay-jitter", type=float, default=0.6, help="Extra random delay seconds")
    parser.add_argument("--warmup-rounds", type=int, default=1, help="Warm-up navigation rounds before scraping")
    parser.add_argument("--skip-model-api", action="store_true", help="Skip model discovery API and use fallback targeting")
    parser.add_argument(
        "--http-only",
        action="store_true",
        help="Use browser-cookie-backed HTTP requests for listing/detail pages (first-page cards only, no Load More clicks)",
    )
    parser.add_argument(
        "--fallback-tiers",
        nargs="+",
        default=["1"],
        help="Manufacturer tiers for category fallback when model API is blocked (e.g. 1 2 or all)",
    )
    parser.add_argument(
        "--fallback-max-makes",
        type=int,
        default=8,
        help="Max number of fallback make targets when using category/default fallback",
    )
    parser.add_argument(
        "--manual-checkpoint",
        action="store_true",
        help="Pause for manual CAPTCHA/challenge completion before API/listing requests (use with --headless false)",
    )
    parser.add_argument(
        "--checkpoint-url",
        default=f"{BASE_URL}/aircraft-for-sale",
        help="URL used during manual checkpoint validation (can be a listing detail URL)",
    )
    args = parser.parse_args()

    global log
    log = setup_logging(args.verbose)
    run(args)


if __name__ == "__main__":
    main()
