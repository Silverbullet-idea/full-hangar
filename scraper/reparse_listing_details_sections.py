r"""
Backfill cleaner listing detail sections from description_full blocks.

Usage:
  .venv312\Scripts\python.exe scraper\reparse_listing_details_sections.py --limit 500 --dry-run
  .venv312\Scripts\python.exe scraper\reparse_listing_details_sections.py --limit 500 --apply
"""

from __future__ import annotations

import argparse
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

try:
    from env_check import env_check
    from scraper_base import get_supabase, setup_logging
except ImportError:  # pragma: no cover
    from .env_check import env_check
    from .scraper_base import get_supabase, setup_logging

load_dotenv(Path(__file__).resolve().parent / ".env")

SECTION_NAMES = {
    "detailed description",
    "avionics / equipment",
    "engines / mods / prop",
    "interior / exterior",
    "general specs (cont.)",
    "airframe",
    "remarks",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Reparse listing detail sections into cleaner fields")
    parser.add_argument("--limit", type=int, default=2000, help="Max listings to process")
    parser.add_argument("--offset", type=int, default=0, help="Start offset")
    parser.add_argument("--batch-size", type=int, default=250, help="Page size for selects")
    parser.add_argument("--apply", action="store_true", help="Write updates to DB")
    parser.add_argument("--dry-run", action="store_true", help="Preview only (default if --apply omitted)")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging")
    return parser.parse_args()


def _clean_text(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = re.sub(r"\s+", " ", value).strip()
    if not cleaned:
        return None
    if cleaned.lower() in {"n/a", "na", "none", "-", "--", "unknown"}:
        return None
    return cleaned


def _extract_sections(text: str) -> dict[str, str]:
    lines = text.replace("\r", "\n").split("\n")
    sections: dict[str, list[str]] = {}
    current: str | None = None
    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            if current and sections.get(current):
                sections[current].append("")
            continue
        match = re.match(r"^([A-Za-z0-9 /()&.-]+)\s*:\s*$", line)
        if match:
            key = match.group(1).strip().lower()
            if key in SECTION_NAMES:
                current = key
                sections.setdefault(current, [])
                continue
        if current:
            sections[current].append(line)
    return {key: "\n".join(parts).strip() for key, parts in sections.items() if "".join(parts).strip()}


def _parse_hours(value: str | None) -> int | None:
    if not value:
        return None
    match = re.search(r"(\d[\d,]{0,6})(?:\.\d+)?", value)
    if not match:
        return None
    try:
        return int(match.group(1).replace(",", ""))
    except Exception:
        return None


def _extract_engine_model(engine_block: str | None, full_text: str) -> str | None:
    search_text = "\n".join(part for part in [engine_block, full_text] if part)
    explicit = re.search(r"\bEngine Model\s*:\s*([A-Za-z0-9\-\/]+)", search_text, flags=re.I)
    if explicit:
        return _clean_text(explicit.group(1))
    fallback = re.search(r"\b((?:TSIO|TIO|IO|O|AEIO|GO|LTSIO|PT6A|RR)[\- ]?[A-Z0-9]{2,}(?:\-[A-Z0-9]{1,4})?)\b", search_text, flags=re.I)
    if fallback:
        return _clean_text(fallback.group(1).replace(" ", ""))
    return None


def _extract_serial(full_text: str) -> str | None:
    serial = re.search(r"\bEngine Serial\s*#?\s*:\s*([A-Za-z0-9\-]+)", full_text, flags=re.I)
    return _clean_text(serial.group(1)) if serial else None


def _looks_noisy_engine_model(value: str | None) -> bool:
    if not value:
        return True
    lowered = value.lower()
    return any(token in lowered for token in ["engine hp", "useable fuel", "hours since overhaul", "overhaul date", "engine make:"])


def _extract_avionics_and_maintenance(avionics_block: str | None) -> tuple[str | None, str | None]:
    if not avionics_block:
        return None, None
    text = avionics_block.strip()
    split = re.split(r"\bAdditional Equipment(?:\s*&\s*Modifications?)?\s*:\s*", text, maxsplit=1, flags=re.I)
    avionics_part = re.sub(r"^\s*Avionics(?:\s*\/\s*Equipment)?\s*:\s*", "", split[0], flags=re.I).strip()
    maintenance_part = split[1].strip() if len(split) > 1 else None
    return _clean_text(avionics_part), _clean_text(maintenance_part)


def _build_update_payload(row: dict[str, Any]) -> dict[str, Any]:
    description_full = str(row.get("description_full") or row.get("description") or "").strip()
    if not description_full:
        return {}

    sections = _extract_sections(description_full)
    avionics_block = sections.get("avionics / equipment")
    engines_block = sections.get("engines / mods / prop")
    interior_block = sections.get("interior / exterior")
    airframe_block = sections.get("airframe")
    general_block = sections.get("general specs (cont.)")
    remarks_block = sections.get("remarks")

    avionics_clean, maintenance_extra = _extract_avionics_and_maintenance(avionics_block)
    maintenance_combined = " ".join(part for part in [maintenance_extra, remarks_block] if part).strip() or None
    total_time = _parse_hours(
        _clean_text(
            re.search(r"\b(?:Aircraft\s+)?Total Time\s*:\s*([^\n]+)", "\n".join(filter(None, [airframe_block, general_block, description_full])), flags=re.I).group(1)
        ) if re.search(r"\b(?:Aircraft\s+)?Total Time\s*:\s*([^\n]+)", "\n".join(filter(None, [airframe_block, general_block, description_full])), flags=re.I) else None
    )
    engine_smoh = _parse_hours(
        _clean_text(
            re.search(
                r"\b(?:Engine\s*Hours\s*since\s*Overhaul|Engine\s*1\s*Time|SMOH|TSMOH|STOH)\s*[:\-]?\s*([^\n]+)",
                "\n".join(filter(None, [engines_block, general_block, description_full])),
                flags=re.I,
            ).group(1)
        ) if re.search(
            r"\b(?:Engine\s*Hours\s*since\s*Overhaul|Engine\s*1\s*Time|SMOH|TSMOH|STOH)\s*[:\-]?\s*([^\n]+)",
            "\n".join(filter(None, [engines_block, general_block, description_full])),
            flags=re.I,
        ) else None
    )
    prop_smoh = _parse_hours(
        _clean_text(
            re.search(r"\b(?:Hours\s*since\s*Prop\s*Overhaul|Prop\s*1\s*Time)\s*[:\-]?\s*([^\n]+)", "\n".join(filter(None, [engines_block, general_block, description_full])), flags=re.I).group(1)
        ) if re.search(
            r"\b(?:Hours\s*since\s*Prop\s*Overhaul|Prop\s*1\s*Time)\s*[:\-]?\s*([^\n]+)",
            "\n".join(filter(None, [engines_block, general_block, description_full])),
            flags=re.I,
        ) else None
    )

    payload: dict[str, Any] = {}
    if avionics_clean and avionics_clean != row.get("avionics_notes"):
        payload["avionics_notes"] = avionics_clean
    if airframe_block and airframe_block != row.get("airframe_notes"):
        payload["airframe_notes"] = airframe_block
    if engines_block and engines_block != row.get("engine_notes"):
        payload["engine_notes"] = engines_block
    if interior_block and interior_block != row.get("interior_notes"):
        payload["interior_notes"] = interior_block
    if maintenance_combined and maintenance_combined != row.get("maintenance_notes"):
        payload["maintenance_notes"] = maintenance_combined
    if total_time and not row.get("total_time_airframe"):
        payload["total_time_airframe"] = total_time
    if engine_smoh and not row.get("engine_time_since_overhaul"):
        payload["engine_time_since_overhaul"] = engine_smoh
    if prop_smoh and not row.get("time_since_prop_overhaul"):
        payload["time_since_prop_overhaul"] = prop_smoh
    model = _extract_engine_model(engines_block, description_full)
    if model and _looks_noisy_engine_model(row.get("engine_model")) and model != row.get("engine_model"):
        payload["engine_model"] = model
    if not row.get("serial_number"):
        serial = _extract_serial(description_full)
        if serial:
            payload["serial_number"] = serial
    if payload:
        payload["updated_at"] = datetime.now(UTC).isoformat()
    return payload


def main() -> int:
    args = parse_args()
    log = setup_logging(args.verbose)
    env_check()
    supabase = get_supabase()

    processed = 0
    updated = 0
    offset = max(0, int(args.offset))
    limit = max(1, int(args.limit))
    batch_size = max(50, int(args.batch_size))

    while processed < limit:
        page_size = min(batch_size, limit - processed)
        response = (
            supabase.table("aircraft_listings")
            .select(
                "id,description,description_full,avionics_notes,airframe_notes,engine_notes,maintenance_notes,interior_notes,"
                "total_time_airframe,engine_time_since_overhaul,time_since_prop_overhaul,engine_model,serial_number"
            )
            .order("last_seen_date", desc=True)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = response.data or []
        if not rows:
            break

        for row in rows:
            processed += 1
            payload = _build_update_payload(row)
            if not payload:
                continue
            if args.apply and not args.dry_run:
                supabase.table("aircraft_listings").update(payload).eq("id", row["id"]).execute()
            updated += 1

        offset += len(rows)
        if len(rows) < page_size:
            break

    log.info(
        "Listing detail reparse complete: processed=%s updated=%s apply=%s",
        processed,
        updated,
        bool(args.apply and not args.dry_run),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
