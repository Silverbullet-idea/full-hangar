from __future__ import annotations

import argparse
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
OUT_PATH = ROOT / "data" / "avionics" / "inventory_extracts" / "bas_part_sales.json"
PROGRESS_PATH = ROOT / "avionics_expansion_progress.json"
ROBOTS_URL = "https://baspartsales.com/robots.txt"
START_URL = "https://baspartsales.com/avionics/"
UA = "Mozilla/5.0 (compatible; FullHangarAvionicsBot/1.0)"
DEFAULT_MAX_PAGES = 12
DEFAULT_MAX_DETAILS = 220
DEFAULT_SLEEP_MIN = 2.0
DEFAULT_SLEEP_MAX = 4.0

MFR_PREFIXES = [
    "Garmin",
    "Avidyne",
    "Bendix/King",
    "BendixKing",
    "King",
    "Collins",
    "Honeywell",
    "Aspen",
    "uAvionix",
    "Narco",
    "Gables",
    "Safe Flight",
    "Shadin",
    "L3",
    "L3Harris",
]

CATEGORY_URLS = {
    "antennas": "https://baspartsales.com/avionics/antennas/",
    "audio-systems": "https://baspartsales.com/avionics/audio-systems/",
    "elts": "https://baspartsales.com/avionics/elts/",
    "flight-displays": "https://baspartsales.com/avionics/flight-displays/",
    "gps-navigation": "https://baspartsales.com/avionics/gps-navigation/",
    "gyros": "https://baspartsales.com/avionics/gyros/",
    "headsets-microphones": "https://baspartsales.com/avionics/headsets-microphones/",
    "indicators": "https://baspartsales.com/indicators/",
    "instrument-panels": "https://baspartsales.com/avionics/instrument-panels/",
    "misc-radio-equipment": "https://baspartsales.com/avionics/misc-radio-equipment/",
    "nav-comm": "https://baspartsales.com/avionics/nav-comm/",
    "transponders": "https://baspartsales.com/avionics/transponders/",
    "weather-terrain": "https://baspartsales.com/avionics/weather-terrain/",
}


def clean_spaces(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip()


def utcnow() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_progress() -> dict:
    if not PROGRESS_PATH.exists():
        return {}
    return json.loads(PROGRESS_PATH.read_text(encoding="utf-8"))


def write_progress(progress: dict) -> None:
    progress["last_updated"] = utcnow()
    PROGRESS_PATH.write_text(json.dumps(progress, indent=2), encoding="utf-8")


def parse_price(text: str) -> float | None:
    if not text:
        return None
    if "call" in text.lower() or "poa" in text.lower():
        return None
    matches = re.findall(r"([\d]{1,3}(?:,[\d]{3})*(?:\.\d{2})?)", text)
    if not matches:
        return None
    try:
        # Product cards can include MSRP/Was/Now; last numeric token is usually the sale price.
        return float(matches[-1].replace(",", ""))
    except Exception:
        return None


def infer_mfr(title: str) -> tuple[str | None, str]:
    t = clean_spaces(title)
    for prefix in MFR_PREFIXES:
        if t.lower().startswith(prefix.lower()):
            return prefix, "high"
    for prefix in MFR_PREFIXES:
        if f" {prefix.lower()} " in f" {t.lower()} ":
            return prefix, "medium"
    return None, "low"


def infer_model(title: str) -> str | None:
    m = re.search(
        r"\b(GTN|GNS|GNC|GPS|GNX|GTX|GFC|GMA|GDL|GI|GMC|IFD|KX|KY|KT|KMA|KI|KFC|KAP|KLN|KC|KA|KNS|NGT|PMA|STEC|S-TEC|CTL)\s*[- ]?\s*([0-9]{2,4}[A-Z]{0,2})\b",
        title,
        flags=re.I,
    )
    if not m:
        return None
    return f"{m.group(1).upper()} {m.group(2).upper()}".replace("S-TEC", "S-TEC")


def extract_part_number(text: str | None) -> str | None:
    t = clean_spaces(text)
    if not t:
        return None
    # BAS detail titles commonly start with BAS part number, e.g. 011-00550-10 ...
    lead = re.match(r"^([0-9]{2,4}(?:-[0-9A-Z]{2,6}){1,4}[A-Z]?)\b", t, flags=re.I)
    if lead:
        return lead.group(1).upper()
    m = re.search(r"\b([A-Z0-9]{2,6}-[A-Z0-9-]{2,}|0\d{2}-\d{5}-\d{2})\b", t, flags=re.I)
    if m:
        return m.group(1).upper()
    return None


def parse_detail_specs(soup: BeautifulSoup) -> dict[str, str]:
    out: dict[str, str] = {}
    labels = ("Part Number", "Model Number", "Manufacturer", "Condition", "Voltage", "Modifications")
    # Structured dt/dd rows
    for dl in soup.select(".productView-info-dl"):
        dt = dl.select_one("dt.productView-info-name")
        dd = dl.select_one("dd.productView-info-value")
        key = clean_spaces(dt.get_text(" ", strip=True) if dt else "").rstrip(":").lower()
        val = clean_spaces(dd.get_text(" ", strip=True) if dd else "")
        if key and val:
            out[key] = val

    # BAS description tab often has authoritative Part/Model/Manufacturer labels.
    for li in soup.select("#tab-description li"):
        txt = clean_spaces(li.get_text(" ", strip=True))
        if ":" not in txt:
            continue
        left, right = txt.split(":", 1)
        key = clean_spaces(left).lower()
        val = clean_spaces(right)
        if key and val:
            out[key] = val

    # Fallback for malformed/combined list items where multiple labels collapse into one line.
    desc_tab = soup.select_one("#tab-description")
    desc_text = desc_tab.get_text("\n", strip=True) if desc_tab else ""
    desc_text = re.sub(r"[ \t]+", " ", desc_text)
    for label in labels:
        pat = rf"{label}\s*:\s*(.+?)(?=\s*(?:Part Number|Model Number|Manufacturer|Condition|Voltage|Modifications)\s*:|$)"
        m = re.search(pat, desc_text, flags=re.I | re.S)
        if not m:
            continue
        val = clean_spaces(m.group(1))
        if val:
            existing = out.get(label.lower())
            out[label.lower()] = existing or val

    # Trim accidental concatenation, e.g. "011-00550-10 Model Number: GNS-530".
    label_boundary = r"\s+(?:Part Number|Model Number|Manufacturer|Condition|Voltage|Modifications)\s*:"
    for k, v in list(out.items()):
        out[k] = re.split(label_boundary, clean_spaces(v), maxsplit=1, flags=re.I)[0]
    return out


def fetch(url: str) -> requests.Response | None:
    backoff = [2, 8, 30]
    for idx, delay in enumerate(backoff, start=1):
        try:
            resp = requests.get(url, headers={"User-Agent": UA}, timeout=30)
            if resp.status_code == 200:
                return resp
        except Exception:
            pass
        if idx < len(backoff):
            time.sleep(delay)
    return None


def robots_disallow() -> bool:
    resp = fetch(ROBOTS_URL)
    if not resp:
        return False
    txt = resp.text.lower()
    return "disallow: /avionics" in txt


def extract_cards(soup: BeautifulSoup, page_url: str) -> list[dict]:
    items: list[dict] = []
    candidates = soup.select("li.product, .productGrid .product")
    for node in candidates:
        node_text = clean_spaces(node.get_text(" ", strip=True))
        title_node = node.select_one("h2, h3, h4, .card-title, .product-title, .woocommerce-loop-product__title")
        title = clean_spaces(title_node.get_text(" ", strip=True) if title_node else "")
        if not title:
            for a in node.select("a[href]"):
                href = a.get("href") or ""
                txt = clean_spaces(a.get_text(" ", strip=True))
                if txt and "cart.php" not in href:
                    title = txt
                    break
        if not title:
            title = node_text.split(" MSRP:")[0].strip()
        if len(title) < 4:
            continue
        # BAS often places "MSRP / Was / Now" text in one block. Parse from full node text.
        price_raw = node_text
        href = None
        for a in node.select("a[href]"):
            candidate = a.get("href") or ""
            if "cart.php" in candidate:
                continue
            href = candidate
            break
        if href is None:
            href = page_url
        listing_url = urljoin(page_url, href)
        pn = extract_part_number(title)
        mfr, confidence = infer_mfr(title)
        model = infer_model(title)
        items.append(
            {
                "manufacturer": mfr,
                "manufacturer_confidence": confidence,
                "model": model,
                "part_number": pn,
                "sku": None,
                "condition": "serviceable" if "serviceable" in title.lower() else None,
                "price": parse_price(price_raw),
                "currency": "USD",
                "title": title,
                "description": None,
                "listing_url": listing_url,
                "source_category": None,
                "source": "bas_part_sales",
                "scraped_at": utcnow(),
            }
        )
    dedup = {f"{x['title']}|{x['listing_url']}": x for x in items}
    return list(dedup.values())


def enrich_details(records: list[dict], max_details: int = 200) -> None:
    if max_details <= 0:
        return
    for idx, rec in enumerate(records[:max_details], start=1):
        url = rec.get("listing_url")
        if not url:
            continue
        resp = fetch(url)
        if not resp:
            continue
        soup = BeautifulSoup(resp.text, "lxml")
        specs = parse_detail_specs(soup)
        detail_title_node = soup.select_one("h1.productView-title")
        detail_title = clean_spaces(detail_title_node.get_text(" ", strip=True) if detail_title_node else "")
        if detail_title:
            rec["title"] = detail_title

        # Prefer explicit detail page price selector over generic full-text fallback.
        detail_price_node = soup.select_one("[data-product-price-without-tax]")
        if detail_price_node:
            price_val = parse_price(clean_spaces(detail_price_node.get_text(" ", strip=True)))
            if price_val is not None:
                rec["price"] = price_val

        desc = soup.select_one(".productView-description, .product-desc, .tab-description, [itemprop='description']")
        if desc:
            rec["description"] = clean_spaces(desc.get_text(" ", strip=True))[:1000]

        brand = (
            soup.select_one("[data-product-brand]") or soup.select_one(".productView-brand span") or soup.select_one(".productView-brand a")
        )
        brand_text = clean_spaces((brand.get("data-product-brand") if hasattr(brand, "get") else "") or (brand.get_text(" ", strip=True) if brand else ""))
        if brand_text:
            rec["manufacturer"] = brand_text
            rec["manufacturer_confidence"] = "high"

        sku_node = soup.select_one("[data-product-sku], .sku")
        sku_text = clean_spaces(sku_node.get_text(" ", strip=True) if sku_node else "") or specs.get("sku", "")
        if sku_text:
            rec["sku"] = sku_text

        # Use BAS Part Number (title/description) as canonical part_number, not internal SKU.
        part_from_specs = specs.get("part number")
        part_from_title = extract_part_number(detail_title or rec.get("title") or "")
        rec["part_number"] = extract_part_number(part_from_specs or part_from_title or rec.get("part_number"))

        model_from_specs = clean_spaces(specs.get("model number"))
        if model_from_specs:
            inferred_from_specs = infer_model(model_from_specs)
            rec["model"] = inferred_from_specs or model_from_specs
        elif not rec.get("model"):
            rec["model"] = infer_model(detail_title or rec.get("title") or "")

        if specs.get("manufacturer"):
            rec["manufacturer"] = clean_spaces(specs["manufacturer"])
            rec["manufacturer_confidence"] = "high"
        elif not rec.get("manufacturer"):
            mfr, confidence = infer_mfr(detail_title or rec.get("title") or "")
            rec["manufacturer"] = mfr
            rec["manufacturer_confidence"] = confidence

        core_marked = "core" in clean_spaces(detail_title + " " + (rec.get("description") or "")).lower()
        condition = clean_spaces(specs.get("condition"))
        if core_marked:
            rec["condition"] = "core"
        elif condition:
            rec["condition"] = condition.lower()

        if rec.get("price") is None:
            full = soup.get_text(" ", strip=True)
            rec["price"] = parse_price(full)
        if idx % 20 == 0:
            time.sleep(random.uniform(2.0, 4.0))


def _normalize_category_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def _resolve_category_urls(categories: list[str]) -> list[tuple[str, str]]:
    if not categories or categories == ["all"]:
        return list(CATEGORY_URLS.items())
    resolved: list[tuple[str, str]] = []
    for c in categories:
        key = _normalize_category_key(c)
        if key in CATEGORY_URLS:
            resolved.append((key, CATEGORY_URLS[key]))
            continue
        raise ValueError(f"Unknown BAS category '{c}'. Valid: {', '.join(sorted(CATEGORY_URLS))}, all")
    return resolved


def _category_page_url(base: str, page: int) -> str:
    return base if page == 1 else f"{base}?page={page}"


def run_scrape(
    category_urls: list[tuple[str, str]],
    max_pages: int,
    max_details: int,
    sleep_min: float,
    sleep_max: float,
) -> list[dict]:
    all_items: list[dict] = []
    for category, base_url in category_urls:
        for page in range(1, max_pages + 1):
            url = _category_page_url(base_url, page)
            resp = fetch(url)
            if not resp:
                break
            soup = BeautifulSoup(resp.text, "lxml")
            page_items = extract_cards(soup, url)
            if not page_items:
                break
            for item in page_items:
                item["source_category"] = category
            all_items.extend(page_items)
            time.sleep(random.uniform(sleep_min, sleep_max))

    # Also include the avionics root category pass for anything not filed under a subcategory.
    for page in range(1, max_pages + 1):
        url = _category_page_url(START_URL, page)
        resp = fetch(url)
        if not resp:
            break
        soup = BeautifulSoup(resp.text, "lxml")
        page_items = extract_cards(soup, url)
        if not page_items:
            break
        for item in page_items:
            item["source_category"] = item.get("source_category") or "avionics-root"
        all_items.extend(page_items)
        time.sleep(random.uniform(sleep_min, sleep_max))

    dedup = {f"{x['title']}|{x['listing_url']}": x for x in all_items}
    records = list(dedup.values())
    # Detail pages provide BAS part number/model/manufacturer/condition and cleaner prices.
    enrich_details(records, max_details=max_details)
    return records


def build_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scrape BAS avionics inventory.")
    parser.add_argument(
        "--categories",
        default="all",
        help="Comma-separated BAS categories or 'all'. "
        "Example: nav-comm,transponders,audio-systems",
    )
    parser.add_argument("--max-pages", type=int, default=DEFAULT_MAX_PAGES)
    parser.add_argument("--max-details", type=int, default=DEFAULT_MAX_DETAILS)
    parser.add_argument("--sleep-min", type=float, default=DEFAULT_SLEEP_MIN)
    parser.add_argument("--sleep-max", type=float, default=DEFAULT_SLEEP_MAX)
    parser.add_argument(
        "--out",
        default=str(OUT_PATH),
        help="Output JSON path (default inventory_extracts/bas_part_sales.json).",
    )
    parser.add_argument(
        "--skip-progress",
        action="store_true",
        help="Do not mutate avionics_expansion_progress.json (useful for smoke runs).",
    )
    return parser.parse_args()


def main() -> int:
    args = build_args()
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    category_input = [c.strip() for c in args.categories.split(",") if c.strip()]
    category_urls = _resolve_category_urls(category_input or ["all"])

    progress = load_progress()
    if not args.skip_progress:
        progress["phases"]["phase_3_used_inventory"]["bas_part_sales"] = "in_progress"
        write_progress(progress)

    if robots_disallow():
        if not args.skip_progress:
            progress["phases"]["phase_3_used_inventory"]["bas_part_sales"] = "skipped"
            progress["notes"].append("Phase 3 bas_part_sales skipped: robots disallows /avionics.")
            write_progress(progress)
        return 0

    records = run_scrape(
        category_urls=category_urls,
        max_pages=max(1, int(args.max_pages)),
        max_details=max(0, int(args.max_details)),
        sleep_min=max(0.0, float(args.sleep_min)),
        sleep_max=max(float(args.sleep_min), float(args.sleep_max)),
    )
    out_path.write_text(json.dumps(records, indent=2), encoding="utf-8")

    if not args.skip_progress:
        progress["stats"]["inventory_units_extracted"] = int(progress["stats"].get("inventory_units_extracted", 0)) + len(records)
        progress["phases"]["phase_3_used_inventory"]["bas_part_sales"] = "done"
        cat_names = ", ".join(c for c, _ in category_urls)
        progress["notes"].append(f"Phase 3 bas_part_sales: extracted {len(records)} records (categories: {cat_names}).")
        write_progress(progress)

    print(
        json.dumps(
            {
                "records": len(records),
                "categories": [c for c, _ in category_urls],
                "max_pages": int(args.max_pages),
                "max_details": int(args.max_details),
                "out": str(out_path),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
