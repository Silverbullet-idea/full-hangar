from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import avionics_global_scraper as global_scraper
import avionics_price_consolidator as consolidator

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data" / "avionics"
INV_DIR = DATA_DIR / "inventory_extracts"
GLOBAL_BASELINE_PATH = INV_DIR / "global_aircraft.json"
OUT_CANDIDATES_PATH = INV_DIR / "global_new_candidates.json"
OUT_REPORT_PATH = INV_DIR / "global_new_discovery_report.json"


def utcnow() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def normalize_key(record: dict[str, Any]) -> str:
    return "|".join(
        [
            str(record.get("listing_url") or "").strip(),
            str(record.get("part_number") or "").strip().upper(),
            str(record.get("title") or "").strip().upper(),
        ]
    )


def classify_against_catalog(
    row: dict[str, Any],
    by_canonical: dict[str, int],
    by_mfr_model: dict[tuple[str, str], int],
    by_alias: dict[str, int],
    alias_pairs: list[tuple[str, int]],
    by_alias_compact: dict[str, int],
) -> tuple[int | None, str, str]:
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
    return unit_id, manufacturer, model


def build_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Discover only new Global avionics candidates.")
    parser.add_argument("--max-results", type=int, default=500, help="Upper bound on pulled search items.")
    parser.add_argument("--enrich-details", type=int, default=140, help="How many product detail pages to enrich.")
    return parser.parse_args()


def main() -> int:
    args = build_args()
    baseline_rows = load_json(GLOBAL_BASELINE_PATH, [])
    known_keys = {normalize_key(x) for x in baseline_rows if isinstance(x, dict)}
    known_part_numbers = {
        str(x.get("part_number") or "").strip().upper()
        for x in baseline_rows
        if isinstance(x, dict) and x.get("part_number")
    }

    catalog_rows, by_canonical, by_mfr_model, by_alias, _, alias_pairs, by_alias_compact = consolidator.load_catalog()
    _ = catalog_rows

    api_key = global_scraper.discover_searchanise_api_key()
    if not api_key:
        report = {
            "status": "failed",
            "reason": "api_key_not_found",
            "run_at": utcnow(),
        }
        write_json(OUT_REPORT_PATH, report)
        print(json.dumps(report))
        return 1

    raw_items = global_scraper.fetch_searchanise_items(api_key, page_size=100)
    if args.max_results > 0:
        raw_items = raw_items[: int(args.max_results)]
    records = global_scraper.build_records(raw_items)

    enrich_n = min(max(0, int(args.enrich_details)), len(records))
    for rec in records[:enrich_n]:
        global_scraper.enrich_detail_page(rec)

    candidates: list[dict[str, Any]] = []
    for rec in records:
        key = normalize_key(rec)
        if key in known_keys:
            continue
        part_number = str(rec.get("part_number") or "").strip().upper()
        unit_id, norm_mfr, norm_model = classify_against_catalog(
            rec, by_canonical, by_mfr_model, by_alias, alias_pairs, by_alias_compact
        )
        rec["normalized_manufacturer"] = norm_mfr
        rec["normalized_model"] = norm_model
        rec["catalog_match_unit_id"] = unit_id

        # keep only truly new + unmatched candidates
        if unit_id is None and (not part_number or part_number not in known_part_numbers):
            rec["discovered_at"] = utcnow()
            candidates.append(rec)
            if part_number:
                known_part_numbers.add(part_number)
        known_keys.add(key)

    write_json(OUT_CANDIDATES_PATH, candidates)
    report = {
        "status": "ok",
        "run_at": utcnow(),
        "api_key_found": bool(api_key),
        "raw_items": len(raw_items),
        "parsed_records": len(records),
        "known_baseline_records": len(baseline_rows),
        "new_candidates": len(candidates),
        "output_candidates_path": str(OUT_CANDIDATES_PATH),
    }
    write_json(OUT_REPORT_PATH, report)
    print(json.dumps(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

