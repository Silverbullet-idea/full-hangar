from __future__ import annotations

import json
import random
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent
OUT_PATH = ROOT / "data" / "avionics" / "inventory_extracts" / "pacific_coast_avionics.json"
PROGRESS_PATH = ROOT / "avionics_expansion_progress.json"
ROBOTS_URL = "https://www.pacificcoastavionics.com/robots.txt"
COLLECTION_PRODUCTS_JSON = "https://www.pacificcoastavionics.com/collections/avionics/products.json"
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


def fetch(url: str, params: dict | None = None) -> requests.Response | None:
    for delay in (2, 8, 20):
        try:
            resp = requests.get(url, params=params, headers={"User-Agent": UA}, timeout=35)
            if resp.status_code == 200:
                return resp
        except Exception:
            pass
        time.sleep(delay)
    return None


def parse_price(value: object) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value) / 100.0 if value > 1000 else float(value)
    s = str(value)
    m = re.search(r"([\d,]+(?:\.\d{2,4})?)", s)
    return float(m.group(1).replace(",", "")) if m else None


def clean_spaces(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip()


def infer_model(title: str) -> str | None:
    m = re.search(
        r"\b(GTN|GNS|GNC|GPS|GNX|GTX|GFC|GMA|GDL|GI|GMC|IFD|KX|KY|KT|KMA|KI|KFC|KAP|KLN|KC|KA|KNS|NGT|PMA|STEC|S-TEC|EFD)\s*[- ]?\s*([0-9]{2,4}[A-Z]{0,2})\b",
        title,
        flags=re.I,
    )
    if not m:
        return None
    return f"{m.group(1).upper()} {m.group(2).upper()}".replace("S-TEC", "S-TEC")


def fetch_collection_products() -> list[dict]:
    products: list[dict] = []
    page = 1
    while page <= 30:
        resp = fetch(COLLECTION_PRODUCTS_JSON, params={"limit": 250, "page": page})
        if not resp:
            break
        payload = resp.json()
        chunk = payload.get("products") or []
        if not chunk:
            break
        products.extend(chunk)
        if len(chunk) < 250:
            break
        page += 1
        time.sleep(random.uniform(0.6, 1.4))
    return products


def build_rows(products: list[dict]) -> list[dict]:
    rows: list[dict] = []
    seen: set[str] = set()
    for p in products:
        title = clean_spaces(str(p.get("title") or ""))
        if not title:
            continue
        handle = clean_spaces(str(p.get("handle") or ""))
        if not handle:
            continue
        listing_url = f"https://www.pacificcoastavionics.com/products/{handle}"
        vendor = clean_spaces(str(p.get("vendor") or "")) or None
        body_html = clean_spaces(str(p.get("body_html") or ""))[:1500] or None
        variants = p.get("variants") or []
        if not variants:
            continue
        for v in variants:
            variant_title = clean_spaces(str(v.get("title") or ""))
            price = parse_price(v.get("price"))
            if price is None:
                continue
            sku = clean_spaces(str(v.get("sku") or "")) or None
            variant_name = variant_title if variant_title and variant_title.lower() != "default title" else None
            record_title = f"{title} - {variant_name}" if variant_name else title
            key = f"{listing_url}|{sku or variant_name or price}"
            if key in seen:
                continue
            seen.add(key)
            rows.append(
                {
                    "manufacturer": vendor,
                    "model": infer_model(title),
                    "part_number": sku,
                    "condition": "new",
                    "price": price,
                    "currency": "USD",
                    "title": record_title,
                    "description": body_html,
                    "listing_url": listing_url,
                    "source_category": "avionics",
                    "source": "pacific_coast_avionics",
                    "scraped_at": utcnow(),
                }
            )
    return rows


def main() -> int:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    progress = load_progress()
    progress.setdefault("phases", {}).setdefault("phase_3_used_inventory", {})
    progress.setdefault("notes", [])
    progress.setdefault("stats", {})
    progress["phases"]["phase_3_used_inventory"]["pacific_coast_avionics"] = "in_progress"
    write_progress(progress)

    robots = fetch(ROBOTS_URL)
    if robots and "disallow: /collections/avionics" in robots.text.lower():
        progress["phases"]["phase_3_used_inventory"]["pacific_coast_avionics"] = "skipped"
        progress["notes"].append("Phase 3 pacific_coast_avionics skipped: robots disallows /collections/avionics.")
        write_progress(progress)
        return 0

    products = fetch_collection_products()
    rows = build_rows(products)
    if not rows:
        progress["phases"]["phase_3_used_inventory"]["pacific_coast_avionics"] = "skipped"
        progress["notes"].append("Phase 3 pacific_coast_avionics skipped: no priced records from collection JSON.")
        write_progress(progress)
        return 0

    OUT_PATH.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    progress["stats"]["inventory_units_extracted"] = int(progress["stats"].get("inventory_units_extracted", 0)) + len(rows)
    progress["phases"]["phase_3_used_inventory"]["pacific_coast_avionics"] = "done"
    progress["notes"].append(
        f"Phase 3 pacific_coast_avionics: extracted {len(rows)} priced variant records from /collections/avionics products.json."
    )
    write_progress(progress)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
