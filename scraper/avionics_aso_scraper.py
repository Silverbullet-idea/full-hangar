from __future__ import annotations

import argparse
import json
import random
import re
from datetime import datetime, timezone
from pathlib import Path

import requests

from aso_scraper import (
    CATEGORIES,
    fetch_soup,
    scrape_detail_page,
    scrape_model_group_listings,
    scrape_model_groups,
    setup_logging,
)

ROOT = Path(__file__).resolve().parent
OUT_PATH = ROOT / "data" / "avionics" / "inventory_extracts" / "aso_avionics_from_aircraft.json"


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
    "L3",
    "L3Harris",
    "PS Engineering",
    "S-Tec",
    "STEC",
    "Artex",
]


def utcnow() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def clean(s: str | None) -> str:
    if not s:
        return ""
    return re.sub(r"\s+", " ", s).strip()


def infer_mfr(text: str) -> str | None:
    t = clean(text)
    for prefix in MFR_PREFIXES:
        if t.lower().startswith(prefix.lower()):
            return prefix
    for prefix in MFR_PREFIXES:
        if f" {prefix.lower()} " in f" {t.lower()} ":
            return prefix
    return None


def infer_model(text: str) -> str | None:
    m = re.search(
        r"\b(GTN|GNS|GNC|GPS|GNX|GTX|GFC|GMA|GDL|GI|GMC|IFD|KX|KY|KT|KMA|KI|KFC|KAP|KLN|KC|KA|KNS|NGT|PMA|STEC|S-TEC|CTL)\s*[- ]?\s*([0-9]{2,4}[A-Z]{0,2})\b",
        text,
        flags=re.I,
    )
    if not m:
        return None
    return f"{m.group(1).upper()} {m.group(2).upper()}".replace("S-TEC", "S-TEC")


def _extract_mentions(items: list[str]) -> list[dict]:
    mentions: list[dict] = []
    for raw in items:
        item = clean(raw)
        if not item:
            continue
        mentions.append(
            {
                "raw_item": item,
                "manufacturer": infer_mfr(item),
                "model": infer_model(item),
            }
        )
    return mentions


def run(args: argparse.Namespace) -> list[dict]:
    logger = setup_logging(args.verbose)
    session = requests.Session()
    records: list[dict] = []
    seen_ids: set[str] = set()

    categories = {args.category: CATEGORIES[args.category]} if args.category else CATEGORIES
    for cat_name, cat in categories.items():
        logger.info("ASO avionics: category=%s", cat_name)
        seed = fetch_soup(session, cat["url"], min_delay=args.delay_min, max_delay=args.delay_max)
        if not seed:
            continue
        groups = scrape_model_groups(session, cat["url"], min_delay=args.delay_min, max_delay=args.delay_max)
        if args.limit_groups:
            groups = groups[: args.limit_groups]
        for group in groups:
            rows = scrape_model_group_listings(
                session,
                group["url"],
                cat["aircraft_type"],
                min_delay=args.delay_min,
                max_delay=args.delay_max,
                page_delay_min=args.page_delay_min,
                page_delay_max=args.page_delay_max,
                max_pages=args.max_pages,
            )
            if args.limit_listings:
                rows = rows[: args.limit_listings]
            for listing in rows:
                sid = str(listing.get("source_id") or "")
                adv_id = str(listing.get("aso_adv_id") or "")
                if not sid or sid in seen_ids or not adv_id:
                    continue
                seen_ids.add(sid)
                detail = scrape_detail_page(
                    session,
                    adv_id,
                    min_delay=max(args.delay_min, args.detail_delay_min),
                    max_delay=max(args.delay_max, args.detail_delay_max),
                )
                sections = detail.get("aso_sections_raw") or {}
                avionics = sections.get("Avionics", {}) if isinstance(sections, dict) else {}
                avionics_items = [clean(x) for x in (avionics.get("items") or []) if clean(x)]
                avionics_text = clean(avionics.get("text") or "")
                if not avionics_items and not avionics_text:
                    continue
                mentions = _extract_mentions(avionics_items if avionics_items else [avionics_text])
                records.append(
                    {
                        "source": "aso_avionics_from_aircraft",
                        "source_site": "aso",
                        "source_listing_id": sid,
                        "listing_url": listing.get("url"),
                        "aircraft_title": listing.get("title"),
                        "year": listing.get("year"),
                        "make": listing.get("make"),
                        "model": listing.get("model"),
                        "aircraft_type": listing.get("aircraft_type"),
                        "source_category": cat_name,
                        "avionics_items": avionics_items,
                        "avionics_text": avionics_text,
                        "avionics_mentions": mentions,
                        "scraped_at": utcnow(),
                    }
                )
                if args.max_records and len(records) >= args.max_records:
                    logger.info("Reached max-records=%s", args.max_records)
                    return records
                if len(records) % 20 == 0:
                    logger.info("Collected %s ASO avionics records...", len(records))
                    # Human-like pacing across detail pulls.
                    _ = random.uniform(args.delay_min, args.delay_max)
    return records


def build_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract avionics data from ASO aircraft detail pages.")
    parser.add_argument("--category", choices=list(CATEGORIES.keys()), help="Single category only.")
    parser.add_argument("--limit-groups", type=int, default=None)
    parser.add_argument("--limit-listings", type=int, default=None)
    parser.add_argument("--max-pages", type=int, default=40)
    parser.add_argument("--max-records", type=int, default=None)
    parser.add_argument("--delay-min", type=float, default=2.0)
    parser.add_argument("--delay-max", type=float, default=5.0)
    parser.add_argument("--page-delay-min", type=float, default=3.0)
    parser.add_argument("--page-delay-max", type=float, default=7.0)
    parser.add_argument("--detail-delay-min", type=float, default=3.0)
    parser.add_argument("--detail-delay-max", type=float, default=8.0)
    parser.add_argument("--out", default=str(OUT_PATH))
    parser.add_argument("--verbose", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = build_args()
    rows = run(args)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print(json.dumps({"records": len(rows), "out": str(out)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

