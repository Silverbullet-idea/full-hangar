"""
ASO.com (Aircraft Shopper Online) deep scraper.

Goals:
- Crawl listing index pages with resilient pagination and hidden-feed discovery.
- Go beyond listing cards: parse rich detail sections (airframe, engines, props, APU,
  avionics, maintenance, comments/remarks, contact/location).
- Capture unknown details in raw payload fields for future schema promotion.
- Run slowly with human-like randomized waits (default pacing favors stability).
"""

from __future__ import annotations

import argparse
import html as ihtml
import json
import logging
import random
import re
import time
from datetime import date, datetime, timezone
from typing import Any, Optional
from urllib.parse import parse_qs, urljoin, urlparse

import requests
from bs4 import BeautifulSoup, Tag

from adaptive_rate import AdaptiveRateLimiter
from scraper_base import get_supabase
from schema import validate_listing


BASE_URL = "https://www.aso.com"
LISTINGS_URL = "https://www.aso.com/listings/AircraftListings.aspx"
DETAIL_URL_TEMPLATE = "https://www.aso.com/listings/spec/ViewAd.aspx?id={listing_id}&listingType=true"

# Newer endpoint families observed on ASO.
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


def setup_logging(verbose: bool = False) -> logging.Logger:
    level = logging.DEBUG if verbose else logging.INFO
    fmt = "%(asctime)s [%(levelname)s] %(message)s"
    root = logging.getLogger()
    root.setLevel(level)
    for handler in root.handlers[:]:
        root.removeHandler(handler)
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
MISSING_COLUMN_CACHE: set[str] = set()
DEFAULT_UNSUPPORTED_COLUMNS = {
    # Known absent in current Supabase schema snapshot.
    "aso_adv_id",
    "aso_sections_raw",
    "contact_raw",
    "maintenance_condition",
    "price_text",
    "seller_phone",
    "seller_website",
    "ttaf_raw",
}


def _sleep_between(min_s: float, max_s: float) -> None:
    high = max(min_s, max_s)
    low = max(0.0, min(min_s, max_s))
    time.sleep(random.uniform(low, high))


def _request_with_retry(
    session: requests.Session,
    method: str,
    url: str,
    *,
    data: Optional[dict[str, Any]] = None,
    min_delay: float,
    max_delay: float,
    retries: int = 4,
) -> Optional[requests.Response]:
    backoff_base = 4.0
    for attempt in range(retries):
        _sleep_between(min_delay, max_delay)
        try:
            if method == "POST":
                response = session.post(
                    url,
                    data=data,
                    headers={**REQUEST_HEADERS, "Content-Type": "application/x-www-form-urlencoded"},
                    timeout=35,
                )
            else:
                response = session.get(url, headers=REQUEST_HEADERS, timeout=35)
        except requests.RequestException as exc:
            wait_s = min(60.0, backoff_base * (2 ** attempt) + random.uniform(0.0, 1.5))
            log.warning("Request error on %s %s (attempt %s/%s): %s", method, url, attempt + 1, retries, exc)
            time.sleep(wait_s)
            continue
        if response.status_code == 200:
            return response
        if response.status_code in (403, 429, 503):
            wait_s = min(90.0, backoff_base * (2 ** attempt) + random.uniform(0.0, 2.0))
            log.warning("HTTP %s on %s %s, retry in %.1fs", response.status_code, method, url, wait_s)
            time.sleep(wait_s)
            continue
        log.warning("HTTP %s on %s %s", response.status_code, method, url)
    return None


def fetch_soup(
    session: requests.Session,
    url: str,
    *,
    min_delay: float,
    max_delay: float,
) -> Optional[BeautifulSoup]:
    response = _request_with_retry(session, "GET", url, min_delay=min_delay, max_delay=max_delay)
    if not response:
        return None
    return BeautifulSoup(response.text, "html.parser")


def post_soup(
    session: requests.Session,
    url: str,
    data: dict[str, Any],
    *,
    min_delay: float,
    max_delay: float,
) -> Optional[BeautifulSoup]:
    response = _request_with_retry(
        session,
        "POST",
        url,
        data=data,
        min_delay=min_delay,
        max_delay=max_delay,
    )
    if not response:
        return None
    return BeautifulSoup(response.text, "html.parser")


def get_results_count(soup: BeautifulSoup) -> Optional[int]:
    heading = soup.find("span", class_="asoAcSearchHeading")
    if not heading:
        return None
    text = heading.get_text(" ", strip=True)
    m = re.search(r"(\d[\d,]*)\s+Aircraft", text, re.I)
    if not m:
        return None
    return int(m.group(1).replace(",", ""))


def extract_viewstate(soup: BeautifulSoup) -> dict[str, str]:
    fields: dict[str, str] = {}
    for field_id in (
        "__VIEWSTATE",
        "__VIEWSTATEGENERATOR",
        "__EVENTVALIDATION",
        "__VIEWSTATEENCRYPTED",
        "__SCROLLPOSITIONX",
        "__SCROLLPOSITIONY",
    ):
        tag = soup.find("input", {"id": field_id})
        if tag:
            fields[field_id] = str(tag.get("value") or "")
    return fields


def _resolve_pager_targets(soup: BeautifulSoup) -> tuple[str, str]:
    txt_target = ""
    next_target = ""
    names = []
    for inp in soup.find_all("input"):
        name = str(inp.get("name") or "").strip()
        if "DataPager" in name:
            names.append(name)
    top = [x for x in names if "DataPagerTop" in x]
    search = top if top else names
    for name in search:
        if name.endswith("$txtPageNo"):
            txt_target = name
            break
    for name in search:
        if name.endswith("$btnNext"):
            next_target = name
            break
    return txt_target, next_target


def _extract_pager_position(soup: BeautifulSoup) -> tuple[Optional[int], Optional[int]]:
    pager_text = ""
    pager_div = soup.find("div", class_=re.compile(r"manageMyAdsGridPager", re.I))
    if pager_div:
        pager_text = pager_div.get_text(" ", strip=True)
    page_input = soup.find("input", {"id": re.compile(r"DataPager(?:Top|Bottom).*txtPageNo", re.I)})
    current_page = None
    if page_input:
        try:
            current_page = int(str(page_input.get("value") or "").strip())
        except ValueError:
            current_page = None
    m = re.search(r"Page\s+(\d+)\s+of\s+(\d+)", pager_text, re.I)
    if m:
        return int(m.group(1)), int(m.group(2))
    m2 = re.search(r"Page\s*of\s*[^0-9]*(\d+)", pager_text, re.I)
    if m2:
        return current_page, int(m2.group(1))
    return current_page, None


def _extract_state(location: str) -> Optional[str]:
    if not location:
        return None
    raw = re.sub(r"\s+", " ", location).strip()
    up = raw.upper()
    m = re.search(r"(?:,\s*|\b)([A-Z]{2})(?:\b|[,/])", up)
    if m and m.group(1) in set(US_STATE_NAME_TO_CODE.values()):
        return m.group(1)
    low = raw.lower()
    for name, code in US_STATE_NAME_TO_CODE.items():
        if name in low:
            return code
    return None


def _parse_price(text: str) -> Optional[int]:
    if not text:
        return None
    if re.search(r"inquire|call|tbd|n/?a", text, re.I):
        return None
    digits = re.sub(r"[^\d]", "", text)
    return int(digits) if digits else None


def _parse_int(text: str | None) -> Optional[int]:
    if text is None:
        return None
    digits = re.sub(r"[^\d]", "", str(text))
    if not digits:
        return None
    try:
        return int(digits)
    except ValueError:
        return None


def _parse_title(title: str) -> tuple[Optional[int], Optional[str], Optional[str]]:
    m = re.match(r"^(\d{4})\s+(.+)$", title.strip())
    if not m:
        return None, None, None
    year = int(m.group(1))
    rest = m.group(2).strip()
    parts = rest.split(None, 1)
    make = parts[0] if parts else None
    model = parts[1] if len(parts) > 1 else None
    return year, make, model


def _classify_seller_type(text: str) -> Optional[str]:
    low = (text or "").lower()
    if not low:
        return None
    if any(token in low for token in ("dealer", "broker", "aviation", "aircraft sales", "llc", "inc", "corp", "ltd", "pty")):
        return "dealer"
    if any(token in low for token in ("private", "owner", "individual")):
        return "private"
    return None


def _infer_aircraft_type_from_listing(listing: dict[str, Any], default_type: Optional[str]) -> str:
    text = " ".join(str(listing.get(k) or "") for k in ("title", "make", "model", "description", "remarks")).lower()
    if any(k in text for k in ("citation", "learjet", "gulfstream", "falcon", "challenger", "embraer", "bombardier", "jet ")):
        return "jet"
    if any(k in text for k in ("helicopter", "robinson", "bell ", "eurocopter", "sikorsky", "agusta")):
        return "helicopter"
    if any(k in text for k in ("turboprop", "pt6", "tpe331", "king air", "caravan", "tbm", "pc-12", "pc12", "kodiak")):
        return "turboprop"
    engine_count = _parse_int(str(listing.get("engine_count") or ""))
    if engine_count and engine_count >= 2:
        return "multi_engine_piston"
    if re.search(r"\b(twin|multi-engine|multi engine|seneca|baron|aztec|seminole|twin comanche|310|337|340|402|414|421)\b", text):
        return "multi_engine_piston"
    if engine_count == 1 or re.search(r"\b(single-engine|single engine)\b", text):
        return "single_engine_piston"
    return default_type or "single_engine_piston"


def _discover_special_listing_urls_from_soup(soup: BeautifulSoup) -> list[str]:
    discovered: list[str] = []
    seen: set[str] = set()
    for anchor in soup.find_all("a", href=True):
        href = str(anchor.get("href") or "").strip()
        if not href:
            continue
        full_url = urljoin(BASE_URL, href) if not href.startswith("http") else href
        parsed = urlparse(full_url)
        if "AircraftListings.aspx" not in (parsed.path or ""):
            continue
        query = parse_qs(parsed.query or "", keep_blank_values=True)
        if not query or "ac_id" in query:
            continue
        if not any(str(values[0]).lower() == "true" for values in query.values() if values):
            continue
        if full_url in seen:
            continue
        seen.add(full_url)
        discovered.append(full_url)
    return discovered


def scrape_model_groups(
    session: requests.Session,
    category_url: str,
    *,
    min_delay: float,
    max_delay: float,
) -> list[dict[str, Any]]:
    soup = fetch_soup(session, category_url, min_delay=min_delay, max_delay=max_delay)
    if not soup:
        return []
    groups: list[dict[str, Any]] = []
    seen: set[str] = set()
    for anchor in soup.find_all("a", href=True):
        href = str(anchor.get("href") or "")
        if "mg_id=" not in href and "m_id=" not in href:
            continue
        if "AircraftListings.aspx" not in href:
            continue
        full = urljoin(BASE_URL, href) if not href.startswith("http") else href
        if full in seen:
            continue
        seen.add(full)
        text = re.sub(r"\s+", " ", anchor.get_text(" ", strip=True)).strip()
        count_match = re.search(r"\((\d+)\)", text)
        count = int(count_match.group(1)) if count_match else 0
        name = re.sub(r"\s*\(\d+\)\s*$", "", text).strip() or "model_group"
        groups.append({"name": name, "url": full, "count": count})
    if groups:
        return groups

    count = get_results_count(soup) or 0
    fallback = [{"name": "category_page", "url": category_url, "count": count}]
    for extra in _discover_special_listing_urls_from_soup(soup):
        extra_soup = fetch_soup(session, extra, min_delay=min_delay, max_delay=max_delay)
        extra_count = get_results_count(extra_soup) if extra_soup else 0
        fallback.append({"name": f"special_feed:{urlparse(extra).query}", "url": extra, "count": extra_count or 0})
    return fallback


def parse_listing_card(card_td: Tag, default_aircraft_type: str) -> Optional[dict[str, Any]]:
    title_links = card_td.find_all("a", class_="photoListingsDescription")
    if not title_links:
        return None
    title_link = next((a for a in title_links if a.get_text(strip=True)), title_links[0])
    adv_id = str(title_link.get("adv_id") or "").strip()
    if not adv_id:
        href = str(title_link.get("href") or "")
        m = re.search(r"[?&]id=(\d+)", href, re.I)
        adv_id = m.group(1) if m else ""
    if not adv_id:
        return None
    title = re.sub(r"\s+", " ", title_link.get_text(" ", strip=True)).strip()
    year, make, model = _parse_title(title)

    price_span = card_td.find("span", class_="photoListingsPrice")
    price_text = price_span.get_text(" ", strip=True) if price_span else ""
    asking_price = _parse_price(price_text)

    info_spans = card_td.find_all("span", class_="photoListingsOtherInfo")
    reg_number = None
    serial_number = None
    ttaf_raw = None
    total_time_airframe = None
    location_raw = ""
    seller_name = None
    for span in info_spans:
        raw = re.sub(r"\s+", " ", span.get_text(" ", strip=True)).strip()
        if raw.lower().startswith("reg#"):
            reg_number = raw.split(":", 1)[-1].strip() if ":" in raw else raw[4:].strip()
        elif raw.lower().startswith("s/n:"):
            serial_number = raw[4:].strip()
        elif raw.lower().startswith("ttaf:"):
            ttaf_raw = raw[5:].strip()
            total_time_airframe = _parse_int(ttaf_raw)
        elif raw.lower().startswith("loc:"):
            location_raw = raw[4:].strip()
        elif raw and not seller_name:
            seller_name = raw

    img_tag = card_td.find("img")
    primary_image_url = None
    if img_tag:
        src = str(img_tag.get("src") or img_tag.get("data-src") or "").strip()
        if src:
            primary_image_url = urljoin(BASE_URL, src) if not src.startswith("http") else src
    state = _extract_state(location_raw)
    seller_type = _classify_seller_type(seller_name or "")

    listing: dict[str, Any] = {
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
        "aircraft_type": default_aircraft_type,
        "asking_price": asking_price,
        "price_asking": asking_price,
        "price_text": price_text,
        "n_number": reg_number,
        "serial_number": serial_number,
        "total_time_airframe": total_time_airframe,
        "ttaf_raw": ttaf_raw,
        "location_raw": location_raw,
        "state": state,
        "seller_name": seller_name,
        "seller_type": seller_type,
        "primary_image_url": primary_image_url,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "condition": "used",
    }
    return listing


def _parse_engine_table(table: Tag) -> list[dict[str, Any]]:
    rows = table.find_all("tr")
    if len(rows) < 2:
        return []
    headers = [re.sub(r"\s+", " ", td.get_text(" ", strip=True)).strip().lower() for td in rows[0].find_all("td")]
    if not headers:
        return []
    parsed: list[dict[str, Any]] = []
    carry: dict[int, str] = {}
    for tr in rows[1:]:
        cells = [re.sub(r"\s+", " ", td.get_text(" ", strip=True)).strip() for td in tr.find_all("td")]
        if not cells:
            continue
        if len(cells) < len(headers):
            # Lightweight rowspan carry-forward for make/model style columns.
            restored: list[str] = []
            ci = 0
            for hi in range(len(headers)):
                if hi in carry and (len(cells) - ci) < (len(headers) - hi):
                    restored.append(carry[hi])
                elif ci < len(cells):
                    restored.append(cells[ci])
                    ci += 1
                else:
                    restored.append(carry.get(hi, ""))
            cells = restored
        row_dict: dict[str, Any] = {}
        for idx, header in enumerate(headers):
            val = cells[idx] if idx < len(cells) else ""
            row_dict[header] = val
            if val:
                carry[idx] = val
        # Numeric conveniences
        for key, value in list(row_dict.items()):
            if key in {"tsn", "tso", "spoh", "csn", "hours", "hour", "landings"}:
                row_dict[f"{key}_hours"] = _parse_int(str(value))
        parsed.append(row_dict)
    return parsed


def _extract_gallery_urls(html: str) -> list[str]:
    decoded = ihtml.unescape(html or "")
    candidates = re.findall(
        r"(?:https?:)?//[^\"' )]+/uploads/acImages/[^\"' )]+\.(?:jpg|jpeg|png|gif|webp)",
        decoded,
        flags=re.I,
    )
    candidates += re.findall(
        r"/uploads/acImages/[^\"' )]+\.(?:jpg|jpeg|png|gif|webp)",
        decoded,
        flags=re.I,
    )
    out: list[str] = []
    seen: set[str] = set()
    for item in candidates:
        u = item if item.startswith("http") else urljoin(BASE_URL, item)
        u = u.replace("&amp;", "&")
        if u in seen:
            continue
        seen.add(u)
        out.append(u)
    return out


def _table_context_label(table: Tag) -> str:
    parent = table.parent
    if not parent:
        return ""
    label_div = parent.find_previous("div", class_=re.compile(r"adSpecView-engine-prop-maintenance-label", re.I))
    if not label_div:
        return ""
    return re.sub(r"\s+", " ", label_div.get_text(" ", strip=True)).strip().lower()


def _extract_section_blocks(soup: BeautifulSoup) -> dict[str, dict[str, Any]]:
    sections: dict[str, dict[str, Any]] = {}
    headers = soup.select("div.adSpecView-section-header-text")
    for hdr in headers:
        title = re.sub(r"\s+", " ", hdr.get_text(" ", strip=True)).strip()
        if not title:
            continue
        wrapper = hdr.find_parent("div")
        if not wrapper:
            continue
        body = wrapper.find_next_sibling("div")
        if not body:
            continue
        items = [re.sub(r"\s+", " ", li.get_text(" ", strip=True)).strip() for li in body.select("li")]
        items = [x for x in items if x]
        text = re.sub(r"\s+", " ", body.get_text(" ", strip=True)).strip()
        sections[title] = {
            "items": items,
            "text": text[:12000],
        }
    return sections


def scrape_detail_page(
    session: requests.Session,
    adv_id: str,
    *,
    min_delay: float,
    max_delay: float,
) -> dict[str, Any]:
    url = DETAIL_URL_TEMPLATE.format(listing_id=adv_id)
    response = _request_with_retry(session, "GET", url, min_delay=min_delay, max_delay=max_delay)
    if not response:
        return {}
    html = response.text
    soup = BeautifulSoup(html, "html.parser")
    extra: dict[str, Any] = {}

    sections = _extract_section_blocks(soup)
    if sections:
        extra["aso_sections_raw"] = sections

    # Summary/description blocks.
    summary_td = soup.select_one("td.diy-section-content-table-td")
    if summary_td:
        summary = summary_td.get_text("\n", strip=True)
        if summary:
            extra["description"] = summary[:4000]
            extra["description_full"] = summary[:12000]

    # Merge in explicit comments/remarks section when present.
    comments_text = sections.get("Comments", {}).get("text") or sections.get("Remarks", {}).get("text")
    if comments_text:
        extra["remarks"] = str(comments_text)[:12000]
        if not extra.get("description_full"):
            extra["description_full"] = str(comments_text)[:12000]

    # Airframe landings and maintenance program signals.
    page_text = soup.get_text(" | ", strip=True)
    landings = re.search(r"Landings:\s*([\d,]+)", page_text, re.I)
    if landings:
        extra["airframe_landings"] = _parse_int(landings.group(1))
    tbo = re.search(r"\bTBO:\s*([\d,]+)", page_text, re.I)
    if tbo:
        extra["engine_tbo_hours"] = _parse_int(tbo.group(1))

    # Detail-location fallback.
    loc_match = re.search(r"Location:\s*([^|]{2,120})", page_text, re.I)
    if loc_match:
        location_raw = re.sub(r"\s+", " ", loc_match.group(1)).strip(" -|,")
        if location_raw:
            extra["location_raw"] = location_raw
            state = _extract_state(location_raw)
            if state:
                extra["state"] = state

    # Contacts.
    contact_table = soup.find("table", class_="adSpecView-contacts-section-outerTable")
    if contact_table:
        contact_text = re.sub(r"\s+", " ", contact_table.get_text(" ", strip=True)).strip()
        extra["contact_raw"] = contact_text[:6000]
        phone = re.search(r"(?:Phone|Tel)\s*:\s*([+()0-9.\-\s]{7,})", contact_text, re.I)
        if phone:
            extra["seller_phone"] = phone.group(1).strip()[:120]
        contact_name = re.search(r"Contact:\s*([A-Za-z0-9&.,' \-]{2,120})", contact_text, re.I)
        if contact_name:
            extra["seller_name"] = contact_name.group(1).strip()
            if not extra.get("seller_type"):
                extra["seller_type"] = _classify_seller_type(extra["seller_name"])

    dealer_link = soup.find("a", class_=re.compile(r"asoViewAdDealerPageLink-marker", re.I))
    if dealer_link and dealer_link.get("href"):
        extra["seller_website"] = str(dealer_link.get("href"))

    # Engine/prop structured tables.
    engines: list[dict[str, Any]] = []
    props: list[dict[str, Any]] = []
    for table in soup.select("table.enginePropView"):
        parsed_rows = _parse_engine_table(table)
        if not parsed_rows:
            continue
        table_text = table.get_text(" ", strip=True).lower()
        context_label = _table_context_label(table)
        if "prop" in context_label or "spoh" in table_text:
            props.extend(parsed_rows)
        elif "engine" in context_label:
            engines.extend(parsed_rows)
        elif "make" in table_text and ("tsn" in table_text or "csn" in table_text):
            engines.extend(parsed_rows)
        else:
            props.extend(parsed_rows)
    if engines:
        extra["engines_raw"] = engines
        extra["engine_count"] = len(engines)
        first = next((_parse_int(str(r.get("tsn") or r.get("tso") or r.get("tsn_hours"))) for r in engines), None)
        second = None
        if len(engines) >= 2:
            second = next((_parse_int(str(r.get("tsn") or r.get("tso") or r.get("tsn_hours"))) for r in engines[1:]), None)
        if first is not None:
            extra["time_since_overhaul"] = first
            extra["engine_time_since_overhaul"] = first
        if second is not None:
            extra["second_engine_time_since_overhaul"] = second
    if props:
        extra["props_raw"] = props
        first_prop = next((_parse_int(str(r.get("spoh") or r.get("spoh_hours") or r.get("tsn"))) for r in props), None)
        second_prop = None
        if len(props) >= 2:
            second_prop = next((_parse_int(str(r.get("spoh") or r.get("spoh_hours") or r.get("tsn"))) for r in props[1:]), None)
        if first_prop is not None:
            extra["time_since_prop_overhaul"] = first_prop
        if second_prop is not None:
            extra["second_time_since_prop_overhaul"] = second_prop

    # Parse prose fallback for TSO/TSN/SPOH.
    if extra.get("time_since_overhaul") is None:
        tso = re.search(r"(?:SMOH|TSMOH|TSO|TSN|SOH|since\s+OH)\s*[:\-]?\s*([\d,]+)", page_text, re.I)
        if tso:
            extra["time_since_overhaul"] = _parse_int(tso.group(1))
            extra["engine_time_since_overhaul"] = extra.get("time_since_overhaul")
    if extra.get("time_since_prop_overhaul") is None:
        spoh = re.search(r"(?:SPOH|prop(?:eller)?\s+since\s+overhaul)\s*[:\-]?\s*([\d,]+)", page_text, re.I)
        if spoh:
            extra["time_since_prop_overhaul"] = _parse_int(spoh.group(1))

    # Avionics and other section flattening.
    avionics_items = sections.get("Avionics", {}).get("items") or []
    if avionics_items:
        extra["avionics_notes"] = ", ".join(avionics_items[:80])[:8000]
    for section_name, target_field in (
        ("Maintenance Condition", "maintenance_condition"),
        ("Additional Equipment", "additional_equipment"),
        ("Equipment", "additional_equipment"),
        ("Interior", "interior_details"),
        ("Exterior", "exterior_details"),
        ("Connectivity", "connectivity_details"),
        ("Entertainment", "entertainment_details"),
        ("Features/Options", "feature_options"),
        ("Enhanced Navigation", "enhanced_navigation"),
    ):
        section = sections.get(section_name)
        if not section:
            continue
        items = section.get("items") or []
        txt = " | ".join(items) if items else str(section.get("text") or "")
        extra[target_field] = txt[:8000]

    # Gallery/media extraction.
    gallery_urls = _extract_gallery_urls(html)
    if gallery_urls:
        extra["image_urls"] = gallery_urls[:40]
        if not extra.get("primary_image_url"):
            extra["primary_image_url"] = gallery_urls[0]

    # Keep unknown-rich payload for future schema promotion.
    raw_payload = {
        "detail_url": url,
        "sections": sections,
        "gallery_count": len(gallery_urls),
        "captured_at": datetime.now(timezone.utc).isoformat(),
    }
    extra["raw_data"] = {"aso_detail": raw_payload}
    return extra


def _parse_cards_from_soup(soup: BeautifulSoup, default_aircraft_type: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    table = soup.find("table", class_="searchResultsGrid")
    if not table:
        return out
    for td in table.find_all("td", class_="searchResultsGrid"):
        listing = parse_listing_card(td, default_aircraft_type)
        if listing:
            out.append(listing)
    return out


def scrape_model_group_listings(
    session: requests.Session,
    group_url: str,
    default_aircraft_type: str,
    *,
    min_delay: float,
    max_delay: float,
    page_delay_min: float,
    page_delay_max: float,
    max_pages: int,
) -> list[dict[str, Any]]:
    soup = fetch_soup(session, group_url, min_delay=min_delay, max_delay=max_delay)
    if not soup:
        return []
    all_rows: list[dict[str, Any]] = []
    page_num = 1
    while soup and page_num <= max_pages:
        page_rows = _parse_cards_from_soup(soup, default_aircraft_type)
        all_rows.extend(page_rows)
        current, total = _extract_pager_position(soup)
        if not total or (current and current >= total):
            break
        viewstate = extract_viewstate(soup)
        txt_target, next_target = _resolve_pager_targets(soup)
        if not viewstate.get("__VIEWSTATE") or not txt_target:
            break
        next_num = (current or page_num) + 1
        post_data = {
            **viewstate,
            "__EVENTTARGET": txt_target,
            "__EVENTARGUMENT": "",
            txt_target: str(next_num),
        }
        _sleep_between(page_delay_min, page_delay_max)
        next_soup = post_soup(session, group_url, post_data, min_delay=min_delay, max_delay=max_delay)
        if not next_soup and next_target:
            fallback_data = {**viewstate, "__EVENTTARGET": next_target, "__EVENTARGUMENT": ""}
            next_soup = post_soup(session, group_url, fallback_data, min_delay=min_delay, max_delay=max_delay)
        if not next_soup:
            break
        soup = next_soup
        page_num += 1
    return all_rows


def upsert_listing(supabase: Any, listing: dict[str, Any]) -> bool:
    row, warnings = validate_listing(listing)
    if warnings and "missing_identity:source_id_or_url" in warnings:
        log.warning("Skip invalid listing: %s", listing.get("source_id"))
        return False

    row.setdefault("source", "aso")
    row.setdefault("source_site", "aso")
    row.setdefault("listing_source", "aso")
    row["is_active"] = True
    row["inactive_date"] = None
    row["last_seen_date"] = date.today().isoformat()
    for col in DEFAULT_UNSUPPORTED_COLUMNS:
        row.pop(col, None)
    if MISSING_COLUMN_CACHE:
        for col in list(MISSING_COLUMN_CACHE):
            row.pop(col, None)

    conflict_keys = ["source_site,source_listing_id", "source_site,source_id", "source_id"]
    conflict_idx = 0
    while True:
        try:
            supabase.table("aircraft_listings").upsert(row, on_conflict=conflict_keys[conflict_idx]).execute()
            return True
        except Exception as exc:
            msg = str(exc)
            missing_col = re.search(r"Could not find the '([^']+)' column", msg)
            if missing_col:
                col = missing_col.group(1)
                if col in row:
                    row.pop(col, None)
                    MISSING_COLUMN_CACHE.add(col)
                    log.debug("Dropped unknown column '%s' for %s", col, listing.get("source_id"))
                    if not row:
                        return False
                    continue
            if "no unique or exclusion constraint matching the ON CONFLICT specification" in msg:
                if conflict_idx < len(conflict_keys) - 1:
                    conflict_idx += 1
                    continue
            log.error("Upsert failed for %s: %s", listing.get("source_id"), exc)
            return False


def _load_existing_index(supabase: Any) -> dict[str, dict[str, Any]]:
    existing: dict[str, dict[str, Any]] = {}
    offset = 0
    page_size = 1000
    while True:
        resp = (
            supabase.table("aircraft_listings")
            .select("source_id,last_seen_date,is_active")
            .eq("source_site", "aso")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            break
        for row in rows:
            sid = str(row.get("source_id") or "").strip()
            if sid:
                existing[sid] = row
        if len(rows) < page_size:
            break
        offset += page_size
    return existing


def _is_recent_seen(last_seen_value: Any, within_days: int) -> bool:
    if within_days <= 0:
        return False
    if not last_seen_value:
        return False
    raw = str(last_seen_value).strip()
    if not raw:
        return False
    dt: Optional[datetime] = None
    try:
        if "T" in raw:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        else:
            dt = datetime.fromisoformat(raw)
    except Exception:
        return False
    if dt is None:
        return False
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    age_days = (datetime.now(timezone.utc) - dt).total_seconds() / 86400.0
    return age_days <= float(within_days)


def run(args: argparse.Namespace) -> None:
    log.info("=== ASO deep scraper starting ===")
    session = requests.Session()
    try:
        session.get(BASE_URL, headers=REQUEST_HEADERS, timeout=15)
    except Exception as exc:
        log.warning("Session warmup failed: %s", exc)

    supabase = None if args.dry_run else get_supabase()
    limiter = AdaptiveRateLimiter(supabase, "aso", logger=log) if supabase else None

    cats = {args.category: CATEGORIES[args.category]} if args.category else CATEGORIES
    seen_run_ids: set[str] = set()
    existing_index: dict[str, dict[str, Any]] = {}
    if supabase and (args.only_new or args.skip_recent_detail_days > 0):
        existing_index = _load_existing_index(supabase)
        log.info("Loaded %s existing ASO rows for restart-aware filtering", len(existing_index))
    total_saved = 0
    total_skipped = 0
    total_existing_skipped = 0
    total_detail_skipped_recent = 0
    dry_rows: list[dict[str, Any]] = []

    for cat_name, cat in cats.items():
        log.info("\n── Category: %s ──", cat_name)
        groups = scrape_model_groups(
            session,
            cat["url"],
            min_delay=args.delay_min,
            max_delay=args.delay_max,
        )
        if args.limit_groups:
            groups = groups[: args.limit_groups]
        log.info("Discovered %s groups/feeds", len(groups))

        for idx, group in enumerate(groups, start=1):
            log.info("  [%s/%s] %s (%s listed) — %s", idx, len(groups), group["name"], group["count"], group["url"])
            listings = scrape_model_group_listings(
                session,
                group["url"],
                cat["aircraft_type"],
                min_delay=args.delay_min,
                max_delay=args.delay_max,
                page_delay_min=args.page_delay_min,
                page_delay_max=args.page_delay_max,
                max_pages=args.max_pages,
            )
            log.info("    -> %s listings scraped from feed", len(listings))

            unique_rows: list[dict[str, Any]] = []
            dup_count = 0
            for item in listings:
                sid = str(item.get("source_id") or "")
                if not sid:
                    continue
                if sid in seen_run_ids:
                    dup_count += 1
                    continue
                seen_run_ids.add(sid)
                unique_rows.append(item)
            if dup_count:
                log.info("    ↺ Skipped %s duplicate source_ids", dup_count)
            if not unique_rows:
                continue

            if args.limit_listings:
                unique_rows = unique_rows[: args.limit_listings]

            for i, listing in enumerate(unique_rows, start=1):
                sid = str(listing.get("source_id") or "").strip()
                existing_row = existing_index.get(sid) if sid else None
                if args.only_new and existing_row:
                    total_existing_skipped += 1
                    continue

                adv_id = str(listing.get("aso_adv_id") or "").strip()
                should_fetch_detail = bool(args.detail and adv_id)
                if should_fetch_detail and args.skip_recent_detail_days > 0:
                    if _is_recent_seen((existing_row or {}).get("last_seen_date"), args.skip_recent_detail_days):
                        should_fetch_detail = False
                        total_detail_skipped_recent += 1
                if should_fetch_detail:
                    _sleep_between(args.detail_delay_min, args.detail_delay_max)
                    detail = scrape_detail_page(
                        session,
                        adv_id,
                        min_delay=args.delay_min,
                        max_delay=args.delay_max,
                    )
                    listing.update(detail)

                listing["aircraft_type"] = _infer_aircraft_type_from_listing(
                    listing,
                    default_type=cat["aircraft_type"],
                )

                if args.dry_run:
                    dry_rows.append(listing)
                    if i <= args.print_samples:
                        print(json.dumps(listing, indent=2, default=str))
                else:
                    if upsert_listing(supabase, listing):
                        total_saved += 1
                    else:
                        total_skipped += 1
                if limiter:
                    limiter.wait()

    if args.dry_run:
        out_file = args.output_json or "aso_dry_run.json"
        with open(out_file, "w", encoding="utf-8") as fh:
            json.dump(dry_rows, fh, indent=2, default=str)
        log.info("Dry run complete. %s unique listings. Output=%s", len(dry_rows), out_file)
    else:
        log.info("✓ Done. Saved: %s | Skipped: %s", total_saved, total_skipped)
    if total_existing_skipped:
        log.info("↺ Existing rows skipped by --only-new: %s", total_existing_skipped)
    if total_detail_skipped_recent:
        log.info("↺ Detail fetch skipped by recency window: %s", total_detail_skipped_recent)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="ASO deep listing scraper")
    parser.add_argument("--category", choices=list(CATEGORIES.keys()), help="Scrape one category only.")
    parser.add_argument("--dry-run", action="store_true", help="Do not write DB rows.")
    parser.add_argument("--detail", action="store_true", help="Fetch detail pages for deep extraction.")
    parser.add_argument("--limit-groups", type=int, default=None, help="Limit model groups/feeds per category.")
    parser.add_argument("--limit-listings", type=int, default=None, help="Limit listings per feed (smoke testing).")
    parser.add_argument("--max-pages", type=int, default=80, help="Maximum pages per feed.")
    parser.add_argument("--delay-min", type=float, default=2.5, help="Per-request minimum delay (seconds).")
    parser.add_argument("--delay-max", type=float, default=5.0, help="Per-request maximum delay (seconds).")
    parser.add_argument("--page-delay-min", type=float, default=4.0, help="Extra delay before paging POST.")
    parser.add_argument("--page-delay-max", type=float, default=8.0, help="Extra delay before paging POST.")
    parser.add_argument("--detail-delay-min", type=float, default=3.0, help="Delay before detail fetch.")
    parser.add_argument("--detail-delay-max", type=float, default=7.0, help="Delay before detail fetch.")
    parser.add_argument("--print-samples", type=int, default=3, help="How many dry-run samples to print per feed.")
    parser.add_argument("--output-json", default=None, help="Dry-run output JSON path.")
    parser.add_argument(
        "--only-new",
        action="store_true",
        help="Skip rows that already exist in DB (restart mode without re-upserting).",
    )
    parser.add_argument(
        "--skip-recent-detail-days",
        type=int,
        default=0,
        help="If >0, skip detail-page fetch for rows seen within N days.",
    )
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging.")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    global log
    log = setup_logging(args.verbose)
    run(args)


if __name__ == "__main__":
    main()

