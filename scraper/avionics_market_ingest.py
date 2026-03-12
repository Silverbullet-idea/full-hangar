"""
Compute conservative avionics market values for seeded catalog units.

Phase 1 scope:
- Pull avionics component sales comps from aircraft_component_sales
- Match sold rows to canonical units via aliases
- Compute min/p25/median/p75/max and sample counts
- Upsert avionics_market_values snapshot rows
- Seed default bundle rules + install factors for piston singles

Usage:
  .venv312\\Scripts\\python.exe scraper\\avionics_market_ingest.py --segment piston_single
  .venv312\\Scripts\\python.exe scraper\\avionics_market_ingest.py --segment piston_single --apply
"""

from __future__ import annotations

import argparse
import math
import re
from collections import defaultdict
from datetime import date, timedelta
from typing import Any

from dotenv import load_dotenv

try:
    from env_check import env_check
    from scraper_base import get_supabase, setup_logging
except ImportError:  # pragma: no cover
    from .env_check import env_check
    from .scraper_base import get_supabase, setup_logging

load_dotenv()

OEM_MSRP_SEED: dict[str, float] = {
    # Piston single anchors (conservative MSRP references).
    "garmin gtn 750 xi": 19995.0,
    "garmin gtn 650 xi": 12995.0,
    "garmin gns 430w": 9500.0,
    "garmin gns 430": 7000.0,
    "garmin gns 530w": 12000.0,
    "garmin gps 175": 4995.0,
    "garmin gnx 375": 7995.0,
    "garmin g3x touch": 8995.0,
    "garmin g5 efis": 2495.0,
    "garmin gfc 500": 8995.0,
    "garmin gtx 345": 5995.0,
    "garmin gtx 335": 3495.0,
    "garmin gtx 327": 1800.0,
    "garmin gtx 3000": 6995.0,
    "garmin gma 340": 1800.0,
    "avidyne ifd 440": 11999.0,
    "avidyne ifd 540": 17999.0,
    "avidyne ifd 550": 21999.0,
    "aspen evolution efd1000 pro max": 9995.0,
    "uavionix tailbeaconx": 2499.0,
    "l3harris ngt 9000": 6395.0,
    "capability ads-b out": 2500.0,
    "capability ads-b in": 1500.0,
    "capability waas": 1000.0,
    "jpi edm series": 2500.0,
    "ryan stormscope system": 600.0,
    "capability xm weather": 800.0,
    "capability synthetic vision": 3000.0,
    "capability electronic stability protection": 1200.0,
    "capability taws-b": 1500.0,
    "bendixking kx 155": 800.0,
    # Piston multi anchors.
    "garmin gtn 750": 17995.0,
    "garmin gtn 650": 11995.0,
    "garmin g500 txi": 15995.0,
    "garmin g600 txi": 25995.0,
    "garmin gfc 600": 19995.0,
    "avidyne ifd 540 mp": 17999.0,
    "avidyne ifd 550 mp": 21999.0,
    "l3harris lynx ngt 9000 plus": 6995.0,
    # Turboprop anchors (shadow-lane conservative references).
    "garmin g1000 nxi": 45000.0,
    "garmin g3000 turboprop": 70000.0,
    "garmin gfc 700 turboprop": 18000.0,
    "garmin gts 8000": 32000.0,
    "garmin gwx 75": 13995.0,
    "collins pro line 21": 65000.0,
    "honeywell primus apex": 68000.0,
    "bendixking kfc 325": 18000.0,
    "l3harris lynx ngt 2000": 6500.0,
    # Rotorcraft anchors (shadow-lane conservative references).
    "garmin g500h txi": 42000.0,
    "garmin gra 55": 9500.0,
    "garmin gtn 750h xi": 19995.0,
    "garmin gtn 650h xi": 12995.0,
    "genesys helisas": 48000.0,
    "honeywell kra 405b": 8500.0,
    "avidyne ifd 550 rotor": 21999.0,
    "garmin gts 855h": 28000.0,
    # Jet anchors (shadow-lane conservative references).
    "collins pro line fusion": 125000.0,
    "garmin g5000": 140000.0,
    "honeywell primus elite": 115000.0,
    "universal uns 1ew": 55000.0,
    "collins tcas 4000": 65000.0,
    "honeywell kra 405b jet": 9000.0,
    "garmin gwx 8000": 45000.0,
    "l3harris lynx ngt 2000 jet": 8000.0,
    "garmin gsr 56 satcom": 18000.0,
}


def _norm_text(value: str | None) -> str:
    lowered = (value or "").lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", lowered)).strip()


def _contains_phrase(text_norm: str, phrase_norm: str) -> bool:
    if not text_norm or not phrase_norm:
        return False
    padded = f" {text_norm} "
    return f" {phrase_norm} " in padded


def _percentile(sorted_values: list[float], pct: float) -> float | None:
    if not sorted_values:
        return None
    if len(sorted_values) == 1:
        return sorted_values[0]
    rank = (len(sorted_values) - 1) * pct
    low = math.floor(rank)
    high = math.ceil(rank)
    if low == high:
        return sorted_values[low]
    weight = rank - low
    return sorted_values[low] * (1 - weight) + sorted_values[high] * weight


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Ingest avionics market comps into valuation tables")
    parser.add_argument(
        "--segment",
        default="piston_single",
        choices=["piston_single", "piston_multi", "turboprop", "rotorcraft", "jet", "all"],
        help="Segment to process",
    )
    parser.add_argument("--lookback-days", type=int, default=3650, help="Sold comps lookback window")
    parser.add_argument("--apply", action="store_true", help="Write valuation snapshots to DB")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logs")
    return parser.parse_args()


def _seed_bundle_rules(segment: str) -> list[dict[str, Any]]:
    return [
        {
            "bundle_code": "ifr_stack_plus_adsb",
            "aircraft_segment": segment,
            "required_units": {"patterns": ["gtn", "gns", "ifd", "gfc", "kap", "stec", "gtx", "ads b out"]},
            "multiplier": 1.12,
            "priority_order": 10,
            "is_active": True,
            "notes": "Conservative uplift when nav/fms + autopilot + surveillance stack all present.",
        },
        {
            "bundle_code": "glass_plus_autopilot",
            "aircraft_segment": segment,
            "required_units": {"patterns": ["g3x", "aspen", "entegra", "g5", "gfc", "stec", "kap"]},
            "multiplier": 1.08,
            "priority_order": 20,
            "is_active": True,
            "notes": "Conservative uplift for coherent glass + autopilot pairing.",
        },
    ]


def _seed_install_factors(segment: str) -> list[dict[str, Any]]:
    return [
        {
            "function_category": "gps_fms_nav_com",
            "aircraft_segment": segment,
            "install_factor": 1.00,
            "obsolescence_haircut": 0.95,
            "default_confidence_discount": 0.92,
            "is_active": True,
            "notes": "Baseline conservative install value for integrated nav/com/fms.",
        },
        {
            "function_category": "autopilot",
            "aircraft_segment": segment,
            "install_factor": 1.00,
            "obsolescence_haircut": 0.90,
            "default_confidence_discount": 0.90,
            "is_active": True,
            "notes": "Legacy autopilots receive stronger haircut than modern digital systems.",
        },
        {
            "function_category": "transponder_adsb",
            "aircraft_segment": segment,
            "install_factor": 0.98,
            "obsolescence_haircut": 0.93,
            "default_confidence_discount": 0.90,
            "is_active": True,
            "notes": "ADS-B hardware retains value but conservative install realization.",
        },
        {
            "function_category": "pfd_mfd",
            "aircraft_segment": segment,
            "install_factor": 1.00,
            "obsolescence_haircut": 0.95,
            "default_confidence_discount": 0.92,
            "is_active": True,
            "notes": "Glass display systems baseline conservative valuation behavior.",
        },
    ]


def main() -> int:
    args = parse_args()
    log = setup_logging(args.verbose)
    env_check()
    supabase = get_supabase()

    segment = args.segment
    cutoff = (date.today() - timedelta(days=max(1, args.lookback_days))).isoformat()

    units_q = supabase.table("avionics_units").select(
        "id,manufacturer,model,canonical_name,function_category,priority_family,is_active"
    )
    if segment != "all":
        units_q = units_q.eq("priority_family", segment)
    units_resp = units_q.eq("is_active", True).execute()
    units = units_resp.data or []
    if not units:
        log.warning("No active avionics_units found for segment='%s'.", segment)
        return 0

    unit_ids = [u["id"] for u in units]
    aliases_resp = (
        supabase.table("avionics_aliases")
        .select("unit_id,alias_norm")
        .in_("unit_id", unit_ids)
        .execute()
    )
    aliases = aliases_resp.data or []
    alias_map: dict[int, list[str]] = defaultdict(list)
    for row in aliases:
        unit_id = row.get("unit_id")
        alias_norm = str(row.get("alias_norm") or "").strip()
        if not unit_id or not alias_norm:
            continue
        alias_map[int(unit_id)].append(alias_norm)

    sales_resp = (
        supabase.table("aircraft_component_sales")
        .select("id,raw_title,manufacturer,model,price_sold,sold_date,confidence")
        .eq("component_type", "avionics")
        .gte("sold_date", cutoff)
        .gt("price_sold", 0)
        .execute()
    )
    sales_rows = sales_resp.data or []

    prices_by_unit: dict[int, list[float]] = defaultdict(list)
    unmatched_count = 0
    matched_rows = 0

    # Match longest aliases first to reduce accidental short-token captures.
    alias_rows: list[tuple[int, str]] = []
    for unit_id, norms in alias_map.items():
        for norm in norms:
            alias_rows.append((unit_id, norm))
    alias_rows.sort(key=lambda item: len(item[1]), reverse=True)

    for sale in sales_rows:
        price = sale.get("price_sold")
        if price in (None, 0):
            continue
        try:
            price_num = float(price)
        except (TypeError, ValueError):
            continue
        text = " ".join(
            [
                str(sale.get("manufacturer") or ""),
                str(sale.get("model") or ""),
                str(sale.get("raw_title") or ""),
            ]
        )
        text_norm = _norm_text(text)
        if not text_norm:
            unmatched_count += 1
            continue

        matched_unit_id: int | None = None
        for unit_id, alias_norm in alias_rows:
            if _contains_phrase(text_norm, alias_norm):
                matched_unit_id = unit_id
                break

        if matched_unit_id is None:
            unmatched_count += 1
            continue

        prices_by_unit[matched_unit_id].append(price_num)
        matched_rows += 1

    market_rows: list[dict[str, Any]] = []
    for unit in units:
        unit_id = int(unit["id"])
        canonical = str(unit.get("canonical_name") or "").strip().lower()
        values = sorted(prices_by_unit.get(unit_id, []))
        sample_count = len(values)
        p25 = _percentile(values, 0.25)
        p50 = _percentile(values, 0.50)
        p75 = _percentile(values, 0.75)
        oem_msrp_value = OEM_MSRP_SEED.get(canonical)
        valuation_basis = "oem_msrp" if oem_msrp_value else ("market_p25" if sample_count >= 3 else "market_insufficient")
        confidence_score = (
            0.90
            if oem_msrp_value
            else (0.80 if sample_count >= 10 else (0.65 if sample_count >= 3 else 0.40))
        )
        market_rows.append(
            {
                "unit_id": unit_id,
                "aircraft_segment": unit.get("priority_family") if segment == "all" else segment,
                "sample_count": sample_count,
                "price_min": values[0] if values else None,
                "price_p25": p25,
                "price_median": p50,
                "price_p75": p75,
                "price_max": values[-1] if values else None,
                "oem_msrp_value": oem_msrp_value,
                "valuation_basis": valuation_basis,
                "confidence_score": confidence_score,
                "source_mix": {
                    "policy": {
                        "conservative_anchor": "P25",
                        "sample_floor": 3,
                        "oem_override": "preferred_when_available",
                    },
                    "oem_seeded": bool(oem_msrp_value),
                    "lookback_days": args.lookback_days,
                    "matched_component_rows": matched_rows,
                    "unmatched_component_rows": unmatched_count,
                },
            }
        )

    total_units = len(units)
    units_with_samples = sum(1 for row in market_rows if int(row["sample_count"] or 0) > 0)
    units_meeting_floor = sum(1 for row in market_rows if int(row["sample_count"] or 0) >= 3)
    log.info(
        "Market ingest preview: segment=%s units=%s with_samples=%s sample_floor_met=%s matched_rows=%s unmatched_rows=%s apply=%s",
        segment,
        total_units,
        units_with_samples,
        units_meeting_floor,
        matched_rows,
        unmatched_count,
        args.apply,
    )

    if not args.apply:
        for row in market_rows[:10]:
            log.info(
                "[dry-run] unit_id=%s samples=%s p25=%s median=%s basis=%s",
                row["unit_id"],
                row["sample_count"],
                row["price_p25"],
                row["price_median"],
                row["valuation_basis"],
            )
        if len(market_rows) > 10:
            log.info("[dry-run] ... %s additional market rows omitted", len(market_rows) - 10)
        return 0

    if market_rows:
        supabase.table("avionics_market_values").upsert(market_rows, on_conflict="unit_id,aircraft_segment").execute()

    segment_for_seed = "piston_single" if segment == "all" else segment
    bundle_rows = _seed_bundle_rules(segment_for_seed)
    install_rows = _seed_install_factors(segment_for_seed)
    supabase.table("avionics_bundle_rules").upsert(bundle_rows, on_conflict="bundle_code,aircraft_segment").execute()
    supabase.table("avionics_install_factors").upsert(
        install_rows,
        on_conflict="function_category,aircraft_segment",
    ).execute()

    log.info(
        "Market ingest applied: market_rows=%s bundle_rules=%s install_factors=%s",
        len(market_rows),
        len(bundle_rows),
        len(install_rows),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
