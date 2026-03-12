from __future__ import annotations

import json
import random
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent
OUT_PATH = ROOT / "data" / "avionics" / "inventory_extracts" / "global_aircraft.json"
PROGRESS_PATH = ROOT / "avionics_expansion_progress.json"
ROBOTS_URL = "https://www.globalparts.com/robots.txt"
BASE = "https://www.globalparts.com"
SEARCH_PAGE_URL = "https://www.globalparts.com/pages/search-results-page?collection=avionics"
SEARCHANISE_ENDPOINT = "https://searchserverapi1.com/getresults"
DEFAULT_PAGE_SIZE = 100
UA = "Mozilla/5.0 (compatible; FullHangarAvionicsBot/1.0)"


def utcnow() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_progress() -> dict:
    if not PROGRESS_PATH.exists():
        return {}
    return json.loads(PROGRESS_PATH.read_text(encoding="utf-8"))


def write_progress(progress: dict) -> None:
    progress["last_updated"] = utcnow()
    PROGRESS_PATH.write_text(json.dumps(progress, indent=2), encoding="utf-8")


def fetch(url: str) -> requests.Response | None:
    for delay in (2, 8, 30):
        try:
            resp = requests.get(url, headers={"User-Agent": UA}, timeout=35)
            if resp.status_code == 200:
                return resp
        except Exception:
            pass
        time.sleep(delay)
    return None


def parse_price(text: str) -> float | None:
    if text is None:
        return None
    if isinstance(text, (int, float)):
        return float(text)
    m = re.search(r"\$?\s*([\d,]+(?:\.\d{2,4})?)", str(text) or "")
    return float(m.group(1).replace(",", "")) if m else None


def looks_avionics(text: str) -> bool:
    t = text.lower()
    return any(k in t for k in ("avionic", "garmin", "transponder", "autopilot", "nav", "com", "display", "ifd", "gtn"))


def infer_model(title: str) -> str | None:
    m = re.search(
        r"\b(GTN|GNS|GNC|GPS|GNX|GTX|GFC|GMA|GDL|GI|GMC|IFD|KX|KY|KT|KMA|KI|KFC|KAP|KLN|KC|KA|KNS|NGT|PMA|STEC|S-TEC|CTL)\s*[- ]?\s*([0-9]{2,4}[A-Z]{0,2})\b",
        title,
        flags=re.I,
    )
    if not m:
        return None
    return f"{m.group(1).upper()} {m.group(2).upper()}".replace("S-TEC", "S-TEC")


def infer_manufacturer(title: str) -> str | None:
    prefixes = [
        "Garmin",
        "Avidyne",
        "King",
        "BendixKing",
        "Bendix/King",
        "Bendix-King",
        "L3",
        "L3Harris",
        "PS Engineering",
        "Honeywell",
        "Collins",
        "Aspen",
        "uAvionix",
        "Artex",
        "S-TEC",
    ]
    for p in prefixes:
        if title.lower().startswith(p.lower()):
            return p
    for p in prefixes:
        if f" {p.lower()} " in f" {title.lower()} ":
            return p
    return None


def discover_searchanise_api_key() -> str | None:
    page = fetch(SEARCH_PAGE_URL)
    if not page:
        return None
    m = re.search(r"widgets/shopify/init\.js\?a=([A-Za-z0-9]{10})", page.text)
    if not m:
        return None
    return m.group(1)


def parse_tags(raw_tags: str | None) -> list[str]:
    if not raw_tags:
        return []
    return [t.strip() for t in str(raw_tags).split("[:ATTR:]") if t.strip()]


def fetch_searchanise_items(api_key: str, page_size: int = DEFAULT_PAGE_SIZE) -> list[dict]:
    out: list[dict] = []
    start = 0
    total = None
    while True:
        params = {
            "api_key": api_key,
            "q": "",
            "collection": "avionics",
            "maxResults": page_size,
            "startIndex": start,
        }
        resp = requests.get(SEARCHANISE_ENDPOINT, params=params, headers={"User-Agent": UA}, timeout=35)
        if resp.status_code != 200:
            break
        payload = resp.json()
        if total is None:
            total = int(payload.get("totalItems") or 0)
        items = payload.get("items") or []
        if not items:
            break
        out.extend(items)
        start += len(items)
        if total is not None and start >= total:
            break
        time.sleep(random.uniform(0.8, 1.8))
    return out


def extract_part_number(title: str, product_code: str | None, tags: list[str]) -> str | None:
    if product_code:
        return str(product_code).strip().upper()
    m = re.search(r"\b([A-Z0-9]{2,6}-[A-Z0-9-]{2,}|0\d{2}-\d{5}-\d{2})\b", title or "", flags=re.I)
    if m:
        return m.group(1).upper()
    for tag in tags:
        m_tag = re.search(r"\b([A-Z0-9]{2,6}-[A-Z0-9-]{2,}|0\d{2}-\d{5}-\d{2})\b", tag, flags=re.I)
        if m_tag:
            return m_tag.group(1).upper()
    return None


def enrich_detail_page(record: dict, max_description_chars: int = 1200) -> None:
    listing_url = record.get("listing_url")
    if not listing_url:
        return
    resp = fetch(str(listing_url))
    if not resp:
        return
    soup = BeautifulSoup(resp.text, "lxml")

    title_node = soup.select_one(".product__title")
    if title_node:
        title_text = re.sub(r"\s+", " ", title_node.get_text(" ", strip=True)).strip()
        if title_text:
            record["title"] = title_text

    vendor_node = soup.select_one(".product__vendor a, .product__vendor")
    if vendor_node:
        vendor = re.sub(r"\s+", " ", vendor_node.get_text(" ", strip=True)).strip()
        if vendor:
            record["manufacturer"] = record.get("manufacturer") or vendor

    price_node = soup.select_one(".price-item--regular, .price-item")
    if price_node:
        p = parse_price(price_node.get_text(" ", strip=True))
        if p is not None:
            record["price"] = p

    desc_node = soup.select_one(".product__description")
    if desc_node:
        record["description"] = re.sub(r"\s+", " ", desc_node.get_text(" ", strip=True))[:max_description_chars]

    detail_lines = []
    for li in soup.select(".product__description li, .product__text li, ul li"):
        txt = re.sub(r"\s+", " ", li.get_text(" ", strip=True)).strip()
        if txt and len(txt) <= 220:
            detail_lines.append(txt)

    # Prefer explicit P/N and alt-part fields if present on detail page.
    for line in detail_lines:
        low = line.lower()
        if "p/n" in low and not record.get("part_number"):
            m = re.search(r"\b([A-Z0-9]{2,6}-[A-Z0-9-]{2,}|0\d{2}-\d{5}-\d{2})\b", line, flags=re.I)
            if m:
                record["part_number"] = m.group(1).upper()
        if "alt part" in low and not record.get("model"):
            record["model"] = infer_model(line) or record.get("model")

    text_blob = " ".join(detail_lines).lower()
    if "core" in text_blob:
        record["condition"] = "core"


def build_records(raw_items: list[dict]) -> list[dict]:
    records: list[dict] = []
    for item in raw_items:
        title = re.sub(r"\s+", " ", str(item.get("title") or "")).strip()
        if not title:
            continue
        link = str(item.get("link") or "").strip()
        if not link:
            continue
        tags = parse_tags(item.get("tags"))
        if "Avionics" not in tags and not looks_avionics(title):
            continue

        listing_url = urljoin(BASE, link)
        price = parse_price(item.get("price"))
        part_number = extract_part_number(title, item.get("product_code"), tags)
        condition = "used"
        if any("core" in t.lower() for t in tags) or "core" in title.lower():
            condition = "core"

        records.append(
            {
                "manufacturer": infer_manufacturer(title) or str(item.get("vendor") or "") or None,
                "model": infer_model(title),
                "part_number": part_number,
                "condition": condition,
                "price": price,
                "currency": "USD",
                "title": title,
                "description": None,
                "listing_url": listing_url,
                "source_category": "avionics",
                "source": "global_aircraft",
                "scraped_at": utcnow(),
            }
        )
    dedup = {f"{x['title']}|{x['listing_url']}": x for x in records}
    return list(dedup.values())


def main() -> int:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    progress = load_progress()
    progress["phases"]["phase_3_used_inventory"]["global_aircraft"] = "in_progress"
    write_progress(progress)

    robots = fetch(ROBOTS_URL)
    if robots and "disallow: /pages/search-results-page" in robots.text.lower():
        progress["phases"]["phase_3_used_inventory"]["global_aircraft"] = "skipped"
        progress["notes"].append("Phase 3 global_aircraft skipped: robots disallows search-results-page.")
        write_progress(progress)
        return 0

    api_key = discover_searchanise_api_key()
    if not api_key:
        progress["phases"]["phase_3_used_inventory"]["global_aircraft"] = "skipped"
        progress["notes"].append("Phase 3 global_aircraft skipped: could not discover Searchanise API key.")
        write_progress(progress)
        return 0

    raw_items = fetch_searchanise_items(api_key, page_size=DEFAULT_PAGE_SIZE)
    records = build_records(raw_items)
    if not records:
        progress["phases"]["phase_3_used_inventory"]["global_aircraft"] = "skipped"
        progress["notes"].append("Phase 3 global_aircraft skipped: no parseable avionics items from collection=avionics.")
        write_progress(progress)
        return 0

    # Enrich a bounded sample with detail-page fields (P/N, alt-part, dates, etc.).
    enrich_n = min(160, len(records))
    for idx, rec in enumerate(records[:enrich_n], start=1):
        enrich_detail_page(rec)
        if idx % 20 == 0:
            time.sleep(random.uniform(1.0, 2.0))

    OUT_PATH.write_text(json.dumps(records, indent=2), encoding="utf-8")
    progress["stats"]["inventory_units_extracted"] = int(progress["stats"].get("inventory_units_extracted", 0)) + len(records)
    progress["phases"]["phase_3_used_inventory"]["global_aircraft"] = "done"
    progress["notes"].append(
        f"Phase 3 global_aircraft: extracted {len(records)} records from search-results-page?collection=avionics via Searchanise."
    )
    write_progress(progress)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
