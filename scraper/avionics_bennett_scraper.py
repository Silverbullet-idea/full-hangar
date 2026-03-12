from __future__ import annotations

import json
import random
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent
OUT_PATH = ROOT / "data" / "avionics" / "inventory_extracts" / "bennett_avionics.json"
PROGRESS_PATH = ROOT / "avionics_expansion_progress.json"
ROBOTS_URL = "https://www.bennettavionics.com/robots.txt"
UA = "Mozilla/5.0 (compatible; FullHangarAvionicsBot/1.0)"

CATEGORY_URLS = [
    "https://www.bennettavionics.com/nav/",
    "https://www.bennettavionics.com/nav-comm/",
]

MFR_HINTS = (
    "GARMIN",
    "AVIDYNE",
    "BENDIX/KING",
    "BENDIX-KING",
    "BENDIXKING",
    "KING",
    "COLLINS",
    "NARCO",
    "PS ENGINEERING",
    "L3",
    "L-3",
    "L3HARRIS",
    "TKM",
    "ARC",
    "CESSNA",
    "HONEYWELL",
    "S-TEC",
    "STEC",
)


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
    for delay in (2, 8, 20):
        try:
            resp = requests.get(url, headers={"User-Agent": UA}, timeout=35)
            if resp.status_code == 200:
                return resp
        except Exception:
            pass
        time.sleep(delay)
    return None


def parse_price(text: str | None) -> float | None:
    if not text:
        return None
    m = re.search(r"\$?\s*([\d,]+(?:\.\d{2,4})?)", str(text))
    return float(m.group(1).replace(",", "")) if m else None


def clean_spaces(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip()


def infer_model(title: str) -> str | None:
    m = re.search(
        r"\b(GTN|GNS|GNC|GPS|GNX|GTX|GFC|GMA|GDL|GI|GMC|IFD|KX|KY|KT|KMA|KI|KFC|KAP|KLN|KC|KA|KNS|NGT|PMA|STEC|S-TEC|MK)\s*[- ]?\s*([0-9]{2,4}[A-Z]{0,2})\b",
        title,
        flags=re.I,
    )
    if not m:
        return None
    return f"{m.group(1).upper()} {m.group(2).upper()}".replace("S-TEC", "S-TEC")


def infer_manufacturer(title: str) -> str | None:
    t = f" {title.upper()} "
    for hint in MFR_HINTS:
        if f" {hint} " in t:
            if hint in ("BENDIX-KING", "BENDIXKING"):
                return "Bendix/King"
            if hint == "L-3":
                return "L3"
            if hint == "STEC":
                return "S-TEC"
            return hint.title() if hint.isupper() else hint
    return None


def extract_part_number(text: str) -> str | None:
    t = clean_spaces(text).upper()
    if not t:
        return None
    lead = re.match(r"^([0-9]{2,4}(?:-[0-9A-Z]{2,6}){1,4}[A-Z]?)\b", t)
    if lead:
        return lead.group(1)
    m = re.search(r"\b([A-Z0-9]{2,6}-[A-Z0-9-]{2,}|0\d{2}-\d{5}-\d{2})\b", t)
    if m:
        return m.group(1)
    return None


def parse_detail_fields(url: str) -> tuple[str | None, str | None]:
    resp = fetch(url)
    if not resp:
        return None, None
    soup = BeautifulSoup(resp.text, "lxml")
    page_text = clean_spaces(soup.get_text(" ", strip=True))

    mfr = None
    for label in ("Brand:", "Manufacturer:"):
        m = re.search(rf"{re.escape(label)}\s*([A-Za-z0-9/\- &]+)", page_text, flags=re.I)
        if m:
            mfr = clean_spaces(m.group(1))
            break

    part_number = None
    for label in ("Part Number:", "P/N:", "PN:"):
        m = re.search(rf"{re.escape(label)}\s*([A-Z0-9\-]+)", page_text, flags=re.I)
        if m:
            part_number = clean_spaces(m.group(1)).upper()
            break
    return mfr, part_number


def robots_disallows_all(robots_text: str) -> bool:
    for raw in robots_text.splitlines():
        line = raw.strip().lower()
        if not line.startswith("disallow:"):
            continue
        value = line.split(":", 1)[1].strip()
        if value == "/":
            return True
    return False


def scrape_category(category_url: str, max_pages: int = 80) -> list[dict]:
    rows: list[dict] = []
    seen_links: set[str] = set()
    for page in range(1, max_pages + 1):
        url = category_url if page == 1 else f"{category_url}?page={page}"
        resp = fetch(url)
        if not resp:
            break
        soup = BeautifulSoup(resp.text, "lxml")
        items = soup.select("ul.ProductList li")
        if not items:
            break
        new_links = 0
        for item in items:
            link_node = item.select_one(".ProductDetails a.pname, .ProductDetails a")
            if not link_node:
                continue
            listing_url = clean_spaces(link_node.get("href"))
            title = clean_spaces(link_node.get_text(" ", strip=True))
            if not listing_url or not title:
                continue
            if listing_url in seen_links:
                continue
            seen_links.add(listing_url)
            new_links += 1
            price_text = clean_spaces((item.select_one("em.p-price") or item.select_one(".ProductPrice") or item).get_text(" ", strip=True))
            price = parse_price(price_text)
            if price is None:
                continue

            rows.append(
                {
                    "manufacturer": infer_manufacturer(title),
                    "model": infer_model(title),
                    "part_number": extract_part_number(title),
                    "condition": "used",
                    "price": price,
                    "currency": "USD",
                    "title": title,
                    "description": None,
                    "listing_url": listing_url,
                    "source_category": category_url.rstrip("/").split("/")[-1],
                    "source": "bennett_avionics",
                    "scraped_at": utcnow(),
                }
            )
        if new_links == 0:
            break
        time.sleep(random.uniform(0.6, 1.6))
    return rows


def main() -> int:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    progress = load_progress()
    progress.setdefault("phases", {}).setdefault("phase_3_used_inventory", {})
    progress.setdefault("notes", [])
    progress.setdefault("stats", {})
    progress["phases"]["phase_3_used_inventory"]["bennett_avionics"] = "in_progress"
    write_progress(progress)

    robots = fetch(ROBOTS_URL)
    if robots and robots_disallows_all(robots.text):
        progress["phases"]["phase_3_used_inventory"]["bennett_avionics"] = "skipped"
        progress["notes"].append("Phase 3 bennett_avionics skipped: robots disallows crawling.")
        write_progress(progress)
        return 0

    records: list[dict] = []
    for cat in CATEGORY_URLS:
        records.extend(scrape_category(cat))

    # Light detail enrichment for manufacturer/part-number quality.
    for idx, rec in enumerate(records[: min(140, len(records))], start=1):
        dmfr, dpn = parse_detail_fields(str(rec.get("listing_url") or ""))
        if dmfr:
            rec["manufacturer"] = rec.get("manufacturer") or dmfr
        if dpn:
            rec["part_number"] = rec.get("part_number") or dpn
        if idx % 20 == 0:
            time.sleep(random.uniform(0.8, 1.6))

    dedup = {str(x.get("listing_url")): x for x in records if x.get("listing_url")}
    out_rows = list(dedup.values())
    OUT_PATH.write_text(json.dumps(out_rows, indent=2), encoding="utf-8")

    progress["stats"]["inventory_units_extracted"] = int(progress["stats"].get("inventory_units_extracted", 0)) + len(out_rows)
    progress["phases"]["phase_3_used_inventory"]["bennett_avionics"] = "done"
    progress["notes"].append(
        f"Phase 3 bennett_avionics: extracted {len(out_rows)} priced records from NAV and NAV/COMM categories."
    )
    write_progress(progress)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
