from __future__ import annotations

import argparse
import json
import random
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import avionics_bas_scraper as bas
import avionics_price_consolidator as consolidator

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data" / "avionics"
OUT_DIR = DATA_DIR / "inventory_extracts"
PROGRESS_PATH = OUT_DIR / "bas_slow_progress.json"
RAW_PATH = OUT_DIR / "bas_slow_raw_records.json"
NEW_PATH = OUT_DIR / "bas_slow_new_candidates.json"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def utcnow_str() -> str:
    return utcnow().replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def normalize_key(record: dict[str, Any]) -> str:
    return "|".join(
        [
            str(record.get("listing_url") or "").strip(),
            str(record.get("part_number") or "").strip().upper(),
            str(record.get("title") or "").strip().upper(),
        ]
    )


def classify_record(
    row: dict[str, Any],
    by_canonical: dict[str, int],
    by_mfr_model: dict[tuple[str, str], int],
    by_alias: dict[str, int],
    alias_pairs: list[tuple[str, int]],
    by_alias_compact: dict[str, int],
) -> tuple[int | None, str | None, str | None]:
    title = (row.get("title") or "").strip()
    manufacturer = consolidator.normalize_manufacturer(row.get("manufacturer"))
    model = (row.get("model") or "").strip()
    title_candidates: list[str] = []

    if title:
        inferred_mfr, inferred_model = consolidator.infer_from_title(title)
        title_candidates = consolidator.extract_model_candidates(title)
        if inferred_mfr and (not row.get("manufacturer") or manufacturer == "Unknown"):
            manufacturer = consolidator.normalize_manufacturer(inferred_mfr)
        if inferred_model:
            model = inferred_model

    if not model and title:
        model = title

    canonical = f"{manufacturer} {model}".strip()
    canonical_norm = consolidator.norm_text(canonical)
    model_norm = consolidator.norm_text(model)
    mfr_norm = consolidator.norm_text(manufacturer)
    unit_id = None

    if canonical_norm in by_canonical:
        unit_id = by_canonical[canonical_norm]
    elif (mfr_norm, model_norm) in by_mfr_model:
        unit_id = by_mfr_model[(mfr_norm, model_norm)]
    elif model_norm in by_alias:
        unit_id = by_alias[model_norm]
    elif consolidator.compact_text(model) in by_alias_compact:
        unit_id = by_alias_compact[consolidator.compact_text(model)]
    elif title_candidates:
        for cand in title_candidates:
            cand_norm = consolidator.norm_text(cand)
            if cand_norm in by_alias:
                unit_id = by_alias[cand_norm]
                model = cand
                break
            cand_compact = consolidator.compact_text(cand)
            if cand_compact in by_alias_compact:
                unit_id = by_alias_compact[cand_compact]
                model = cand
                break
    elif title:
        title_norm = consolidator.norm_text(title)
        title_compact = consolidator.compact_text(title)
        for alias_norm, cid in alias_pairs:
            if len(alias_norm) < 5:
                continue
            if alias_norm in title_norm:
                unit_id = cid
                break
        if unit_id is None:
            for alias_norm, cid in alias_pairs:
                alias_compact = consolidator.compact_text(alias_norm)
                if len(alias_compact) < 5:
                    continue
                if alias_compact and alias_compact in title_compact:
                    unit_id = cid
                    break

    canonical_out = None
    if unit_id is not None:
        canonical_out = str(unit_id)
    return unit_id, manufacturer, model


def run_cycle(
    category: str,
    category_url: str,
    max_pages: int,
    max_details: int,
    sleep_min: float,
    sleep_max: float,
    seen_keys: set[str],
    known_part_numbers: set[str],
    matcher_payload: tuple[
        dict[str, int],
        dict[tuple[str, str], int],
        dict[str, int],
        list[tuple[str, int]],
        dict[str, int],
    ],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    by_canonical, by_mfr_model, by_alias, alias_pairs, by_alias_compact = matcher_payload
    records = bas.run_scrape(
        category_urls=[(category, category_url)],
        max_pages=max_pages,
        max_details=max_details,
        sleep_min=sleep_min,
        sleep_max=sleep_max,
    )

    new_candidates: list[dict[str, Any]] = []
    for rec in records:
        key = normalize_key(rec)
        if key in seen_keys:
            continue
        seen_keys.add(key)

        part_number = str(rec.get("part_number") or "").strip().upper()
        unit_id, normalized_mfr, normalized_model = classify_record(
            rec, by_canonical, by_mfr_model, by_alias, alias_pairs, by_alias_compact
        )
        rec["normalized_manufacturer"] = normalized_mfr
        rec["normalized_model"] = normalized_model
        rec["catalog_match_unit_id"] = unit_id

        # "New" means not already represented in catalog match, and not a known BAS part number.
        if unit_id is None and (not part_number or part_number not in known_part_numbers):
            candidate = dict(rec)
            candidate["discovered_at"] = utcnow_str()
            new_candidates.append(candidate)
            if part_number:
                known_part_numbers.add(part_number)

    return records, new_candidates


def build_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run slow BAS discovery for new avionics candidates.")
    parser.add_argument("--hours", type=float, default=7.0, help="Total runtime budget in hours.")
    parser.add_argument("--max-pages", type=int, default=2, help="Pages per category pass.")
    parser.add_argument("--max-details", type=int, default=35, help="Detail pages to enrich per category pass.")
    parser.add_argument("--request-sleep-min", type=float, default=0.8)
    parser.add_argument("--request-sleep-max", type=float, default=2.2)
    parser.add_argument("--cycle-pause-min-seconds", type=int, default=600, help="Pause between category cycles.")
    parser.add_argument("--cycle-pause-max-seconds", type=int, default=1800)
    parser.add_argument("--start-category-index", type=int, default=0)
    parser.add_argument("--max-cycles", type=int, default=0, help="Optional hard cap; 0 means unlimited until time budget.")
    return parser.parse_args()


def main() -> int:
    args = build_args()
    start_time = utcnow()
    end_time = start_time + timedelta(hours=max(0.1, args.hours))
    start_time_str = start_time.replace(microsecond=0).isoformat().replace("+00:00", "Z")
    end_time_str = end_time.replace(microsecond=0).isoformat().replace("+00:00", "Z")
    catalog_rows, by_canonical, by_mfr_model, by_alias, _, alias_pairs, by_alias_compact = consolidator.load_catalog()
    _ = catalog_rows

    progress = load_json(
        PROGRESS_PATH,
        {
            "started_at": start_time_str,
            "last_updated": utcnow_str(),
            "status": "starting",
            "hours_target": float(args.hours),
            "cycles_completed": 0,
            "records_seen_total": 0,
            "new_candidates_total": 0,
            "last_category": None,
            "next_category_index": int(args.start_category_index),
            "end_time_target": end_time_str,
            "notes": [],
        },
    )
    progress["started_at"] = start_time_str
    progress["hours_target"] = float(args.hours)
    progress["end_time_target"] = end_time_str
    progress["status"] = "running"

    raw_records = load_json(RAW_PATH, [])
    new_records = load_json(NEW_PATH, [])

    # Seed with existing BAS extract so we only keep discoveries that are actually new to us.
    seed_existing = load_json(bas.OUT_PATH, [])
    if isinstance(seed_existing, list) and seed_existing:
        raw_records.extend(seed_existing)

    dedup_seed = {normalize_key(x): x for x in raw_records if isinstance(x, dict)}
    raw_records = list(dedup_seed.values())

    seen_keys = set(dedup_seed.keys())
    known_part_numbers = {
        str(x.get("part_number") or "").strip().upper()
        for x in raw_records + new_records
        if isinstance(x, dict) and x.get("part_number")
    }

    category_items = list(bas.CATEGORY_URLS.items())
    if not category_items:
        progress["status"] = "failed_no_categories"
        write_json(PROGRESS_PATH, progress)
        return 1

    idx = int(progress.get("next_category_index") or args.start_category_index) % len(category_items)
    max_cycles = int(args.max_cycles)
    cycles = 0

    matcher_payload = (by_canonical, by_mfr_model, by_alias, alias_pairs, by_alias_compact)
    progress["status"] = "running"
    write_json(PROGRESS_PATH, progress)

    while utcnow() < end_time:
        if max_cycles > 0 and cycles >= max_cycles:
            break
        category, url = category_items[idx]
        cycle_started = utcnow_str()
        cycle_records, cycle_new = run_cycle(
            category=category,
            category_url=url,
            max_pages=max(1, int(args.max_pages)),
            max_details=max(0, int(args.max_details)),
            sleep_min=max(0.0, float(args.request_sleep_min)),
            sleep_max=max(float(args.request_sleep_min), float(args.request_sleep_max)),
            seen_keys=seen_keys,
            known_part_numbers=known_part_numbers,
            matcher_payload=matcher_payload,
        )

        raw_records.extend(cycle_records)
        new_records.extend(cycle_new)
        write_json(RAW_PATH, raw_records)
        write_json(NEW_PATH, new_records)

        cycles += 1
        idx = (idx + 1) % len(category_items)
        progress["last_updated"] = utcnow_str()
        progress["status"] = "running"
        progress["cycles_completed"] = int(progress.get("cycles_completed", 0)) + 1
        progress["records_seen_total"] = len(raw_records)
        progress["new_candidates_total"] = len(new_records)
        progress["last_category"] = category
        progress["last_cycle_started_at"] = cycle_started
        progress["last_cycle_records"] = len(cycle_records)
        progress["last_cycle_new_candidates"] = len(cycle_new)
        progress["next_category_index"] = idx
        write_json(PROGRESS_PATH, progress)

        if utcnow() >= end_time:
            break
        pause_seconds = random.randint(
            max(1, int(args.cycle_pause_min_seconds)),
            max(int(args.cycle_pause_min_seconds), int(args.cycle_pause_max_seconds)),
        )
        time.sleep(pause_seconds)

    progress["last_updated"] = utcnow_str()
    progress["status"] = "completed"
    progress["records_seen_total"] = len(raw_records)
    progress["new_candidates_total"] = len(new_records)
    progress["next_category_index"] = idx
    write_json(PROGRESS_PATH, progress)

    print(
        json.dumps(
            {
                "status": progress["status"],
                "cycles_completed": progress["cycles_completed"],
                "records_seen_total": progress["records_seen_total"],
                "new_candidates_total": progress["new_candidates_total"],
                "progress_path": str(PROGRESS_PATH),
                "new_candidates_path": str(NEW_PATH),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

