from __future__ import annotations

import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent
OUT_PATH = ROOT / "data" / "avionics" / "inventory_extracts" / "wipaire.json"
PROGRESS_PATH = ROOT / "avionics_expansion_progress.json"
ROBOTS_URL = "https://www.wipaire.com/robots.txt"
START_URL = "https://www.wipaire.com/used-parts-and-equipment/"
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
    m = re.search(r"\$?\s*([\d,]+(?:\.\d{2})?)", text or "")
    return float(m.group(1).replace(",", "")) if m else None


def main() -> int:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    progress = load_progress()
    progress["phases"]["phase_3_used_inventory"]["wipaire"] = "in_progress"
    write_progress(progress)

    robots = fetch(ROBOTS_URL)
    if robots and "disallow: /used-parts-and-equipment" in robots.text.lower():
        progress["phases"]["phase_3_used_inventory"]["wipaire"] = "skipped"
        progress["notes"].append("Phase 3 wipaire skipped: robots disallows used-parts-and-equipment.")
        write_progress(progress)
        return 0

    resp = fetch(START_URL)
    if not resp:
        progress["phases"]["phase_3_used_inventory"]["wipaire"] = "skipped"
        progress["notes"].append("Phase 3 wipaire skipped: page fetch failed.")
        write_progress(progress)
        return 0

    soup = BeautifulSoup(resp.text, "lxml")
    links = soup.select("a[href]")
    records: list[dict] = []
    external_hits = 0
    for a in links:
        title = re.sub(r"\s+", " ", a.get_text(" ", strip=True))
        href = a.get("href") or ""
        if not title or len(title) < 4:
            continue
        if any(k in href.lower() for k in ("controller.com", "trade-a-plane.com", "ebay.com")):
            external_hits += 1
            records.append(
                {
                    "manufacturer": None,
                    "model": None,
                    "part_number": None,
                    "condition": None,
                    "price": None,
                    "currency": "USD",
                    "title": title,
                    "description": "External listing link from Wipaire inventory page.",
                    "listing_url": href,
                    "source": "wipaire",
                    "scraped_at": utcnow(),
                }
            )
            continue
        lower = f"{title} {href}".lower()
        if "avionic" not in lower and "garmin" not in lower and "transponder" not in lower:
            continue
        records.append(
            {
                "manufacturer": "Wipaire",
                "model": None,
                "part_number": None,
                "condition": "used",
                "price": parse_price(title),
                "currency": "USD",
                "title": title,
                "description": None,
                "listing_url": urljoin(START_URL, href),
                "source": "wipaire",
                "scraped_at": utcnow(),
            }
        )

    dedup = {f"{x['title']}|{x['listing_url']}": x for x in records}
    out = list(dedup.values())
    if len(out) < 20 and external_hits > 0:
        progress["phases"]["phase_3_used_inventory"]["wipaire"] = "skipped"
        progress["notes"].append(
            f"Phase 3 wipaire skipped: thin in-page avionics inventory ({len(out)}), mostly external links ({external_hits})."
        )
        write_progress(progress)
        return 0

    OUT_PATH.write_text(json.dumps(out, indent=2), encoding="utf-8")
    progress["stats"]["inventory_units_extracted"] = int(progress["stats"].get("inventory_units_extracted", 0)) + len(out)
    progress["phases"]["phase_3_used_inventory"]["wipaire"] = "done"
    progress["notes"].append(f"Phase 3 wipaire: extracted {len(out)} records.")
    write_progress(progress)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
