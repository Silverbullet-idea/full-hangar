from __future__ import annotations

# 2026-03-04: Integrate AircraftForSale scraper as primary compatibility entrypoint.

import argparse
import json
import random
import re
import time
from datetime import date
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

try:
    from description_parser import parse_description
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
    from scraper_health import (
        ErrorType,
        ScraperResult,
        SelectorConfig,
        detect_challenge_type,
        log_scraper_error,
        looks_like_challenge_html,
        retry_with_backoff,
    )
except ImportError:  # pragma: no cover
    from .description_parser import parse_description
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
    from .scraper_health import (
        ErrorType,
        ScraperResult,
        SelectorConfig,
        detect_challenge_type,
        log_scraper_error,
        looks_like_challenge_html,
        retry_with_backoff,
    )

load_dotenv()

BASE_URL = "https://aircraftforsale.com"
SOURCE_SITE = "aircraftforsale"
PER_PAGE = 120
TIMEOUT_SECONDS = 30
CHECKPOINT_FILE = Path(__file__).resolve().parent / "state" / "afs_checkpoint.json"

AFS_DETAIL_MAIN_PRICE = SelectorConfig(
    name="afs_detail_main_price",
    primary="span.main-price",
    fallbacks=[".main-price", "[data-item-price]", ".listing-price .amount", ".asking-price"],
)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
)

REQUEST_HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": BASE_URL,
}

AFS_CATEGORIES: dict[str, dict[str, str]] = {
    "single_engine": {"path": "/aircraft/single-engine-piston", "aircraft_type": "single_engine_piston"},
    "multi_engine": {"path": "/aircraft/multi-engine-piston", "aircraft_type": "multi_engine_piston"},
    "turboprop": {"path": "/aircraft/turboprop", "aircraft_type": "turboprop"},
    "jet": {"path": "/aircraft/jet", "aircraft_type": "jet"},
    "helicopter": {"path": "/aircraft/helicopter", "aircraft_type": "helicopter"},
}

US_STATE_LOOKUP = {
    "alabama": "AL",
    "alaska": "AK",
    "arizona": "AZ",
    "arkansas": "AR",
    "california": "CA",
    "colorado": "CO",
    "connecticut": "CT",
    "delaware": "DE",
    "district of columbia": "DC",
    "florida": "FL",
    "georgia": "GA",
    "hawaii": "HI",
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

log = setup_logging()


def _normalize_space(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip()


def _parse_price(value: str | None) -> Optional[int]:
    if not value:
        return None
    text = _normalize_space(value)
    if re.search(r"inquire|call|contact|tbd|not priced|n/?a", text, flags=re.I):
        return None
    digits = re.sub(r"[^\d]", "", text)
    if not digits:
        return None
    try:
        return int(digits)
    except ValueError:
        return None


def _split_location(location_raw: str | None) -> tuple[Optional[str], Optional[str]]:
    text = _normalize_space(location_raw)
    if not text:
        return None, None

    if re.match(r".+,\s*[A-Z]{2}$", text):
        parts = [part.strip() for part in text.rsplit(",", 1)]
        return parts[0], parts[1].upper()

    parts = [part.strip() for part in text.split(",") if part.strip()]
    if not parts:
        return None, None
    if len(parts) == 1:
        return parts[0], US_STATE_LOOKUP.get(parts[0].lower())

    state_candidate = parts[0].lower()
    state_code = US_STATE_LOOKUP.get(state_candidate)
    if state_code:
        return None, state_code
    return parts[0], None


@retry_with_backoff(max_attempts=3, base_delay=5.0, exceptions=(requests.RequestException, requests.HTTPError))
def _afs_http_get_body(session: requests.Session, url: str, params: dict[str, Any] | None) -> str:
    time.sleep(random.uniform(1.5, 3.0))
    response = session.get(url, params=params, timeout=TIMEOUT_SECONDS)
    if response.status_code != 200:
        if response.status_code in (403, 429, 500, 502, 503, 504):
            response.raise_for_status()
        raise ValueError(f"HTTP {response.status_code} for {url}")
    html = response.text
    if looks_like_challenge_html(html):
        ctype = detect_challenge_type(html) or "unknown"
        raise RuntimeError(f"challenge:{ctype} at {url}")
    return html


class HtmlFetcher:
    def __init__(self, supabase: Any | None = None, health_result: ScraperResult | None = None) -> None:
        self._session = requests.Session()
        self._session.headers.update(REQUEST_HEADERS)
        self._supabase = supabase
        self._health = health_result

    def fetch_soup(self, url: str, params: dict[str, Any] | None = None, label: str = "") -> Optional[BeautifulSoup]:
        try:
            html = _afs_http_get_body(self._session, url, params)
            return BeautifulSoup(html, "html.parser")
        except RuntimeError as exc:
            if "challenge:" in str(exc):
                if self._supabase:
                    log_scraper_error(
                        self._supabase,
                        source_site=SOURCE_SITE,
                        error_type=ErrorType.CHALLENGE,
                        url=url,
                        raw_error=str(exc),
                    )
                if self._health:
                    self._health.challenge_hits += 1
                log.warning("[%s] %s", label or "fetch", exc)
                return None
            raise
        except (requests.RequestException, requests.HTTPError, ValueError) as exc:
            log.warning("[%s] fetch failed: %s", label or "fetch", exc)
            return None


def _extract_listing_id(card: Any) -> Optional[str]:
    card_id = str(card.get("id") or "")
    match = re.search(r"item_card_(\d+)", card_id)
    return match.group(1) if match else None


def _extract_source_url(card: Any) -> Optional[str]:
    link = card.find("a", class_="tricky-link")
    if not link:
        return None
    href = str(link.get("href") or "").strip()
    if not href:
        return None
    return href if href.startswith("http") else urljoin(BASE_URL, href)


def _extract_title_year_make_model(title: str, source_url: str | None) -> tuple[Optional[int], Optional[str], Optional[str]]:
    cleaned_title = _normalize_space(title)
    match = re.match(r"^(19\d{2}|20\d{2})\s+([A-Za-z0-9][A-Za-z0-9\-&/]+)\s+(.+)$", cleaned_title)
    if match:
        return int(match.group(1)), match.group(2).title(), match.group(3).strip().upper()

    if cleaned_title:
        parts = cleaned_title.split()
        if len(parts) >= 2:
            return None, parts[0].title(), " ".join(parts[1:]).strip().upper()

    if source_url:
        path_parts = [part for part in urlparse(source_url).path.rstrip("/").split("/") if part]
        if len(path_parts) >= 4 and path_parts[0] == "aircraft":
            make = path_parts[2].replace("-", " ").title()
            model = path_parts[3].replace("-", " ").upper()
            slug = path_parts[-1]
            year_match = re.search(r"(19\d{2}|20\d{2})", slug)
            year = int(year_match.group(1)) if year_match else None
            return year, make, model

    return None, None, None


def _parse_card_table(card: Any) -> dict[str, Any]:
    out: dict[str, Any] = {}
    table = card.find("table")
    if not table:
        return out

    headers = [th.get_text(strip=True).upper() for th in table.find_all("th")]
    rows = table.find_all("tr")
    if len(rows) < 2:
        return out
    values = [td.get_text(strip=True) for td in rows[-1].find_all("td")]
    for idx, header in enumerate(headers):
        if idx >= len(values):
            break
        value = _normalize_space(values[idx])
        if header in ("S/N", "SERIAL", "SERIAL NUMBER", "SN"):
            out["serial_number"] = value
        elif header in ("REG", "REGISTRATION", "REG#", "N#"):
            out["n_number"] = value.upper() if value.upper().startswith("N") else value
        elif header in ("TT", "TOTAL TIME", "TTSN", "TTAF"):
            out["ttaf_raw"] = value
            parsed = _parse_price(value)
            if parsed is not None:
                out["total_time_airframe"] = parsed
    return out


def _parse_card(card: Any, aircraft_type: str) -> Optional[dict[str, Any]]:
    listing_id = _extract_listing_id(card)
    if not listing_id:
        return None
    source_id = f"afs_{listing_id}"
    source_url = _extract_source_url(card)

    title_link = card.find("a", class_="tricky-link")
    title = _normalize_space(title_link.get_text(" ", strip=True) if title_link else "")
    year, make, model = _extract_title_year_make_model(title, source_url)

    card_table = _parse_card_table(card)
    card_text = card.get_text(" ", strip=True)

    price_el = card.find(class_=re.compile(r"price", flags=re.I))
    price_text = _normalize_space(price_el.get_text(" ", strip=True) if price_el else "")
    price_asking = _parse_price(price_text) if price_text else _parse_price(card_text)

    location_el = card.find(class_=re.compile(r"location|address", flags=re.I))
    location_raw = _normalize_space(location_el.get_text(" ", strip=True) if location_el else "")
    if not location_raw:
        location_match = re.search(r"([A-Za-z .'-]+,\s*(?:[A-Z]{2}|United States))", card_text)
        if location_match:
            location_raw = _normalize_space(location_match.group(1))
    city, state = _split_location(location_raw)

    image_url = None
    image_el = card.find("img")
    if image_el:
        src = str(image_el.get("data-src") or image_el.get("src") or "").strip()
        if src and not src.endswith(".svg"):
            image_url = src if src.startswith("http") else urljoin(BASE_URL, src)

    return {
        "source_site": SOURCE_SITE,
        "listing_source": SOURCE_SITE,
        "source_id": source_id,
        "source_listing_id": source_id,
        "url": source_url,
        "title": title or None,
        "year": year,
        "make": make,
        "model": model,
        "aircraft_type": aircraft_type,
        "price_asking": price_asking,
        "asking_price": price_asking,
        "n_number": card_table.get("n_number"),
        "serial_number": card_table.get("serial_number"),
        "total_time_airframe": card_table.get("total_time_airframe"),
        "location_city": city,
        "location_state": state,
        "primary_image_url": image_url,
        "image_urls": [image_url] if image_url else None,
        "description": None,
        "description_full": None,
    }


def _parse_listing_cards(soup: BeautifulSoup, aircraft_type: str) -> list[dict[str, Any]]:
    cards = soup.find_all("div", id=re.compile(r"item_card_\d+"))
    if not cards:
        cards = soup.find_all("div", class_=lambda c: bool(c) and "gallery-item" in c and "listing-item" in c)
    listings: list[dict[str, Any]] = []
    for card in cards:
        parsed = _parse_card(card, aircraft_type)
        if parsed:
            listings.append(parsed)
    return listings


def _parse_detail(fetcher: HtmlFetcher, listing: dict[str, Any]) -> dict[str, Any]:
    source_url = str(listing.get("url") or "").strip()
    if not source_url:
        return {}
    soup = fetcher.fetch_soup(source_url, label="detail")
    if not soup:
        return {}

    detail: dict[str, Any] = {}
    price_span = AFS_DETAIL_MAIN_PRICE.find(soup)
    if price_span:
        price_text = _normalize_space(price_span.get_text(" ", strip=True))
        detail["asking_price"] = _parse_price(price_text)
        detail["price_asking"] = detail["asking_price"]
        data_item_price = str(price_span.get("data-item-price") or "").strip()
        if data_item_price.isdigit():
            detail["asking_price"] = int(data_item_price)
            detail["price_asking"] = int(data_item_price)

    for row in soup.find_all("div", class_="aircraft-details-row"):
        label_el = row.find("div", class_="aircraft-details-label")
        value_el = row.find("div", class_="aircraft-details-value")
        if not label_el or not value_el:
            continue
        label = _normalize_space(label_el.get_text(" ", strip=True)).lower()
        value = _normalize_space(value_el.get_text(" ", strip=True))
        if "location" in label and value:
            city, state = _split_location(value)
            detail["location_city"] = city
            detail["location_state"] = state
        elif "highlight" in label and value:
            detail["highlights"] = value

    info_bar = soup.find("span", class_="aircraft-info-bar") or soup.find("div", class_="aircraft-info-bar")
    if info_bar:
        labels = info_bar.find_all("span", class_="info-label")
        for label in labels:
            label_text = _normalize_space(label.get_text(" ", strip=True)).lower()
            value_el = label.find_next_sibling("span", class_="info-value")
            if not value_el:
                continue
            value = _normalize_space(value_el.get_text(" ", strip=True))
            if "total time" in label_text or "ttsn" in label_text or "ttaf" in label_text:
                parsed = _parse_price(value)
                if parsed is not None:
                    detail["total_time_airframe"] = parsed
            elif "registration" in label_text:
                detail["n_number"] = value.upper() if value.upper().startswith("N") else value
            elif "serial" in label_text:
                detail["serial_number"] = value

    section_texts: list[str] = []
    for section_id in ("airframe", "avionics", "interior"):
        section = soup.find("li", id=section_id)
        content = section.find("div", class_="accordion-content") if section else None
        if content:
            section_texts.append(_normalize_space(content.get_text(" ", strip=True)))

    highlights = detail.get("highlights")
    description_parts = [str(highlights)] if highlights else []
    description_parts.extend([part for part in section_texts if part])
    if description_parts:
        detail["description"] = "\n\n".join(description_parts)[:4000]
    if description_parts:
        detail["description_full"] = "\n\n".join(description_parts)[:7000]

    gallery_urls = _extract_gallery_urls(soup)
    if gallery_urls:
        detail["image_urls"] = gallery_urls
        detail["primary_image_url"] = gallery_urls[0]

    return detail


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
        select_columns="source_id,listing_fingerprint,first_seen_date,last_seen_date,is_active",
    )


def _upsert_listings(supabase: Any, listings: list[dict[str, Any]], *, skip_unchanged_writes: bool = True) -> int:
    if not listings:
        return 0

    today_iso = date.today().isoformat()
    source_ids = [str(item.get("source_id")) for item in listings if item.get("source_id")]
    existing_by_id = _fetch_existing_state(supabase, source_ids)

    rows: list[dict[str, Any]] = []
    unchanged_source_ids: list[str] = []
    for raw in listings:
        parser_text = f"{raw.get('description') or ''}\n{raw.get('description_full') or ''}".strip()
        if parser_text:
            parsed = parse_description(parser_text)
            raw["description_intelligence"] = parsed
            parsed_times = parsed.get("times", {}) if isinstance(parsed, dict) else {}
            smoh = parsed_times.get("engine_smoh")
            if raw.get("engine_time_since_overhaul") in (None, "", 0) and isinstance(smoh, int):
                raw["engine_time_since_overhaul"] = smoh
            tt = parsed_times.get("total_time")
            if raw.get("total_time_airframe") in (None, "", 0) and isinstance(tt, int):
                raw["total_time_airframe"] = tt

        row, warnings = validate_listing(raw)
        if warnings:
            log.warning("Skipping invalid listing %s: %s", raw.get("source_id"), "; ".join(warnings))
            continue

        row["source_site"] = SOURCE_SITE
        row["listing_source"] = SOURCE_SITE
        row["source_id"] = str(row.get("source_id"))
        if row.get("price_asking") is None and row.get("asking_price") is not None:
            row["price_asking"] = row["asking_price"]
        if row.get("asking_price") is None and row.get("price_asking") is not None:
            row["asking_price"] = row["price_asking"]

        existing = existing_by_id.get(str(row.get("source_id")))
        row["first_seen_date"] = today_iso if not existing else existing.get("first_seen_date")
        row["last_seen_date"] = today_iso
        row["is_active"] = True
        row["inactive_date"] = None

        row["listing_fingerprint"] = compute_listing_fingerprint(
            {
                "source_site": SOURCE_SITE,
                "source_id": row.get("source_id"),
                "url": row.get("url"),
                "price_asking": row.get("price_asking"),
                "year": row.get("year"),
                "make": row.get("make"),
                "model": row.get("model"),
                "n_number": row.get("n_number"),
                "location_city": row.get("location_city"),
                "location_state": row.get("location_state"),
                "description": row.get("description_full") or row.get("description"),
            }
        )

        existing_fingerprint = str(existing.get("listing_fingerprint") or "") if existing else ""
        current_fingerprint = str(row.get("listing_fingerprint") or "")
        existing_is_active = bool(existing.get("is_active")) if existing else False
        if (
            skip_unchanged_writes
            and existing
            and existing_fingerprint
            and existing_fingerprint == current_fingerprint
            and existing_is_active
        ):
            unchanged_source_ids.append(str(row.get("source_id") or ""))
            continue

        rows.append(row)

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
    if not rows:
        return refreshed_unchanged

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
    return saved + refreshed_unchanged


def _mark_inactive_listings(supabase: Any, inactive_after_missed_runs: int) -> int:
    return mark_inactive_listings(
        supabase,
        source_site=SOURCE_SITE,
        inactive_after_missed_runs=inactive_after_missed_runs,
        logger=log,
    )


def _save_checkpoint(category: str, page: int) -> None:
    CHECKPOINT_FILE.parent.mkdir(parents=True, exist_ok=True)
    CHECKPOINT_FILE.write_text(json.dumps({"category": category, "page": page}, indent=2), encoding="utf-8")


def _load_checkpoint() -> dict[str, Any] | None:
    if not CHECKPOINT_FILE.exists():
        return None
    try:
        data = json.loads(CHECKPOINT_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _clear_checkpoint() -> None:
    if CHECKPOINT_FILE.exists():
        CHECKPOINT_FILE.unlink(missing_ok=True)


def _scrape_category(
    fetcher: HtmlFetcher,
    category_key: str,
    category_info: dict[str, str],
    *,
    limit_pages: Optional[int],
    include_detail: bool,
    supabase: Any | None = None,
    detail_stale_days: int = 2,
    resume_page: int = 1,
) -> list[dict[str, Any]]:
    listings: list[dict[str, Any]] = []
    page = max(1, resume_page)
    base_url = f"{BASE_URL}{category_info['path']}"
    aircraft_type = category_info["aircraft_type"]

    while True:
        if limit_pages is not None and page > limit_pages:
            break
        soup = fetcher.fetch_soup(
            base_url,
            params={"show_per_page": PER_PAGE, "page": page},
            label=f"{category_key}-p{page}",
        )
        if not soup:
            break

        page_rows = _parse_listing_cards(soup, aircraft_type)
        log.info("[%s] page=%s parsed=%s", category_key, page, len(page_rows))
        if not page_rows:
            break

        existing_map: dict[str, dict[str, Any]] = {}
        if supabase:
            source_ids = [str(row.get("source_id")) for row in page_rows if row.get("source_id")]
            existing_map = _fetch_existing_state(supabase, source_ids)

        if include_detail:
            for row in page_rows:
                sid = str(row.get("source_id") or "")
                if should_skip_detail(existing_map.get(sid), detail_stale_days):
                    continue
                detail = _parse_detail(fetcher, row)
                if detail:
                    row.update(detail)

        listings.extend(page_rows)
        _save_checkpoint(category_key, page + 1)

        if len(page_rows) < PER_PAGE:
            break
        page += 1

    return listings


def main() -> None:
    parser = argparse.ArgumentParser(description="AircraftForSale scraper aligned to Full Hangar conventions")
    parser.add_argument("--category", choices=list(AFS_CATEGORIES.keys()), help="Single category to scrape")
    parser.add_argument("--limit", type=int, default=None, help="Max pages per category")
    parser.add_argument("--dry-run", action="store_true", help="Parse and print results without DB writes")
    parser.add_argument("--no-detail", action="store_true", help="Skip detail page fetches")
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
    parser.add_argument("--resume", action="store_true", help="Resume from last category/page checkpoint")
    parser.add_argument("--output", default="", help="Optional output JSON path")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    args = parser.parse_args()

    global log
    log = setup_logging(verbose=args.verbose)
    env_check(required=[] if args.dry_run else None)

    supabase = None if args.dry_run else get_supabase()
    health = ScraperResult(source_site=SOURCE_SITE)
    fetcher = HtmlFetcher(supabase=supabase, health_result=health)
    resume_state = _load_checkpoint() if args.resume else None
    selected = {args.category: AFS_CATEGORIES[args.category]} if args.category else AFS_CATEGORIES

    all_rows: list[dict[str, Any]] = []
    started = False if resume_state and not args.category else True
    for category_key, category_info in selected.items():
        if resume_state and not started:
            if category_key != str(resume_state.get("category")):
                continue
            started = True
        resume_page = int(resume_state.get("page") or 1) if resume_state and category_key == resume_state.get("category") else 1
        rows = _scrape_category(
            fetcher=fetcher,
            category_key=category_key,
            category_info=category_info,
            limit_pages=args.limit,
            include_detail=not args.no_detail,
            supabase=supabase,
            detail_stale_days=args.detail_stale_days,
            resume_page=resume_page,
        )
        all_rows.extend(rows)

    if args.output:
        Path(args.output).write_text(json.dumps(all_rows, indent=2, ensure_ascii=True), encoding="utf-8")
        log.info("Wrote %s listings to %s", len(all_rows), args.output)

    if args.dry_run:
        for row in all_rows[: min(5, len(all_rows))]:
            print(json.dumps(row, indent=2, ensure_ascii=True))
        log.info("Dry run complete. Parsed %s listings.", len(all_rows))
        return

    saved = _upsert_listings(supabase, all_rows, skip_unchanged_writes=True)
    marked = _mark_inactive_listings(supabase, args.inactive_after_missed_runs)
    _clear_checkpoint()
    log.info(
        "AFS scrape complete. parsed=%s saved=%s marked_inactive=%s %s",
        len(all_rows),
        saved,
        marked,
        health.finish().summary(),
    )


if __name__ == "__main__":
    main()
