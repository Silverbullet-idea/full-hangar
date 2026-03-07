"""
Seed and maintain canonical avionics catalog records.

Phase 1 scope:
- Seed piston-single priority avionics units
- Seed normalized aliases used by parser matching
- Seed baseline certification/evidence metadata

Usage:
  .venv312\\Scripts\\python.exe scraper\\avionics_catalog_builder.py --segment piston_single
  .venv312\\Scripts\\python.exe scraper\\avionics_catalog_builder.py --segment piston_single --apply
"""

from __future__ import annotations

import argparse
import re
from typing import Any

from dotenv import load_dotenv

try:
    from env_check import env_check
    from scraper_base import get_supabase, setup_logging
except ImportError:  # pragma: no cover
    from .env_check import env_check
    from .scraper_base import get_supabase, setup_logging

load_dotenv()


def _norm_alias(text: str) -> str:
    lowered = (text or "").lower()
    alnum_spaces = re.sub(r"[^a-z0-9]+", " ", lowered)
    return re.sub(r"\s+", " ", alnum_spaces).strip()


def _seed_units() -> list[dict[str, Any]]:
    # 2026-03-05: Piston-single focused seed list for parser-first avionics depth.
    return [
        {
            "manufacturer": "Garmin",
            "model": "GTN 650 Xi",
            "canonical_name": "garmin gtn 650 xi",
            "function_category": "gps_fms_nav_com",
            "legacy_vs_glass": "glass",
            "priority_family": "piston_single",
            "aliases": ["GTN 650 Xi", "GTN650Xi", "Garmin GTN 650Xi", "GTN 650XI"],
            "certifications": [{"authority": "FAA", "approval_type": "TSO", "approval_ref": "TSO-C146"}],
        },
        {
            "manufacturer": "Garmin",
            "model": "GTN 750 Xi",
            "canonical_name": "garmin gtn 750 xi",
            "function_category": "gps_fms_nav_com",
            "legacy_vs_glass": "glass",
            "priority_family": "piston_single",
            "aliases": ["GTN 750 Xi", "GTN750Xi", "Garmin GTN 750Xi", "GTN 750XI"],
            "certifications": [{"authority": "FAA", "approval_type": "TSO", "approval_ref": "TSO-C146"}],
        },
        {
            "manufacturer": "Garmin",
            "model": "GNS 430W",
            "canonical_name": "garmin gns 430w",
            "function_category": "gps_nav_com",
            "legacy_vs_glass": "hybrid",
            "priority_family": "piston_single",
            "aliases": ["GNS 430W", "GNS430W", "Garmin 430W"],
            "certifications": [{"authority": "FAA", "approval_type": "TSO", "approval_ref": "TSO-C146"}],
        },
        {
            "manufacturer": "Garmin",
            "model": "GNS 430",
            "canonical_name": "garmin gns 430",
            "function_category": "gps_nav_com",
            "legacy_vs_glass": "hybrid",
            "priority_family": "piston_single",
            "aliases": ["GNS 430", "GNS430", "Garmin 430"],
            "certifications": [{"authority": "FAA", "approval_type": "TSO", "approval_ref": "TSO-C129"}],
        },
        {
            "manufacturer": "Garmin",
            "model": "GNS 530W",
            "canonical_name": "garmin gns 530w",
            "function_category": "gps_nav_com",
            "legacy_vs_glass": "hybrid",
            "priority_family": "piston_single",
            "aliases": ["GNS 530W", "GNS530W", "Garmin 530W"],
            "certifications": [{"authority": "FAA", "approval_type": "TSO", "approval_ref": "TSO-C146"}],
        },
        {
            "manufacturer": "Garmin",
            "model": "GPS 175",
            "canonical_name": "garmin gps 175",
            "function_category": "gps_fms",
            "legacy_vs_glass": "glass",
            "priority_family": "piston_single",
            "aliases": ["GPS 175", "Garmin GPS 175", "GPS175"],
            "certifications": [{"authority": "FAA", "approval_type": "TSO", "approval_ref": "TSO-C146"}],
        },
        {
            "manufacturer": "Garmin",
            "model": "GNX 375",
            "canonical_name": "garmin gnx 375",
            "function_category": "gps_transponder_adsb",
            "legacy_vs_glass": "glass",
            "priority_family": "piston_single",
            "aliases": ["GNX 375", "Garmin GNX 375", "GNX375"],
            "certifications": [{"authority": "FAA", "approval_type": "TSO", "approval_ref": "TSO-C112/166/146"}],
        },
        {
            "manufacturer": "Garmin",
            "model": "G3X Touch",
            "canonical_name": "garmin g3x touch",
            "function_category": "pfd_mfd",
            "legacy_vs_glass": "glass",
            "priority_family": "piston_single",
            "aliases": ["G3X Touch", "Garmin G3X", "G3X", "G3XTouch"],
            "certifications": [{"authority": "FAA", "approval_type": "AML_STC", "approval_ref": "GARMIN_G3X_AML"}],
        },
        {
            "manufacturer": "Garmin",
            "model": "G5",
            "canonical_name": "garmin g5 efis",
            "function_category": "pfd_backup",
            "legacy_vs_glass": "glass",
            "priority_family": "piston_single",
            "aliases": ["G5", "Garmin G5", "G5 EFIS"],
            "certifications": [{"authority": "FAA", "approval_type": "STC", "approval_ref": "GARMIN_G5_STC"}],
        },
        {
            "manufacturer": "Garmin",
            "model": "GFC 500",
            "canonical_name": "garmin gfc 500",
            "function_category": "autopilot",
            "legacy_vs_glass": "glass",
            "priority_family": "piston_single",
            "aliases": ["GFC 500", "Garmin GFC500", "GFC500"],
            "certifications": [{"authority": "FAA", "approval_type": "AML_STC", "approval_ref": "GARMIN_GFC500_AML"}],
        },
        {
            "manufacturer": "Garmin",
            "model": "GTX 345",
            "canonical_name": "garmin gtx 345",
            "function_category": "transponder_adsb",
            "legacy_vs_glass": "hybrid",
            "priority_family": "piston_single",
            "aliases": ["GTX 345", "GTX345", "GTX 345R", "GTX345R", "Garmin GTX 345", "ADS-B Out GTX345"],
            "certifications": [{"authority": "FAA", "approval_type": "TSO", "approval_ref": "TSO-C112/166"}],
        },
        {
            "manufacturer": "Garmin",
            "model": "GTX 335",
            "canonical_name": "garmin gtx 335",
            "function_category": "transponder_adsb",
            "legacy_vs_glass": "hybrid",
            "priority_family": "piston_single",
            "aliases": ["GTX 335", "GTX335", "Garmin GTX 335"],
            "certifications": [{"authority": "FAA", "approval_type": "TSO", "approval_ref": "TSO-C112/166"}],
        },
        {
            "manufacturer": "Garmin",
            "model": "GTX 327",
            "canonical_name": "garmin gtx 327",
            "function_category": "transponder",
            "legacy_vs_glass": "legacy",
            "priority_family": "piston_single",
            "aliases": ["GTX 327", "GTX327", "Garmin GTX 327"],
            "certifications": [{"authority": "FAA", "approval_type": "TSO", "approval_ref": "TSO-C74"}],
        },
        {
            "manufacturer": "Garmin",
            "model": "GTX 3000",
            "canonical_name": "garmin gtx 3000",
            "function_category": "transponder_adsb",
            "legacy_vs_glass": "glass",
            "priority_family": "piston_single",
            "aliases": ["GTX 3000", "GTX3000", "Garmin GTX 3000"],
            "certifications": [{"authority": "FAA", "approval_type": "TSO", "approval_ref": "TSO-C112/166"}],
        },
        {
            "manufacturer": "Garmin",
            "model": "GMA 340",
            "canonical_name": "garmin gma 340",
            "function_category": "audio_panel",
            "legacy_vs_glass": "legacy",
            "priority_family": "piston_single",
            "aliases": ["GMA 340", "GMA340", "Garmin GMA 340"],
            "certifications": [{"authority": "FAA", "approval_type": "TSO", "approval_ref": "TSO-C50"}],
        },
        {
            "manufacturer": "Avidyne",
            "model": "IFD 440",
            "canonical_name": "avidyne ifd 440",
            "function_category": "gps_fms_nav_com",
            "legacy_vs_glass": "glass",
            "priority_family": "piston_single",
            "aliases": ["IFD 440", "IFD440", "Avidyne IFD440"],
            "certifications": [{"authority": "FAA", "approval_type": "TSO", "approval_ref": "TSO-C146"}],
        },
        {
            "manufacturer": "Avidyne",
            "model": "IFD 540",
            "canonical_name": "avidyne ifd 540",
            "function_category": "gps_fms_nav_com",
            "legacy_vs_glass": "glass",
            "priority_family": "piston_single",
            "aliases": ["IFD 540", "IFD540", "Avidyne IFD540"],
            "certifications": [{"authority": "FAA", "approval_type": "TSO", "approval_ref": "TSO-C146"}],
        },
        {
            "manufacturer": "Avidyne",
            "model": "IFD 550",
            "canonical_name": "avidyne ifd 550",
            "function_category": "gps_fms_nav_com",
            "legacy_vs_glass": "glass",
            "priority_family": "piston_single",
            "aliases": ["IFD 550", "IFD550", "Avidyne IFD550"],
            "certifications": [{"authority": "FAA", "approval_type": "TSO", "approval_ref": "TSO-C146"}],
        },
        {
            "manufacturer": "Avidyne",
            "model": "Entegra",
            "canonical_name": "avidyne entegra",
            "function_category": "integrated_flight_deck",
            "legacy_vs_glass": "glass",
            "priority_family": "piston_single",
            "aliases": ["Entegra", "Avidyne Entegra", "Entegra Release 9"],
            "certifications": [{"authority": "FAA", "approval_type": "TC", "approval_ref": "OEM_INTEGRATION"}],
        },
        {
            "manufacturer": "Aspen Avionics",
            "model": "Evolution EFD1000 Pro MAX",
            "canonical_name": "aspen evolution efd1000 pro max",
            "function_category": "pfd_mfd",
            "legacy_vs_glass": "glass",
            "priority_family": "piston_single",
            "aliases": ["Aspen Evolution", "EFD1000", "EFD1000 Pro MAX", "Aspen MAX"],
            "certifications": [{"authority": "FAA", "approval_type": "STC", "approval_ref": "ASPEN_EFD_STC"}],
        },
        {
            "manufacturer": "uAvionix",
            "model": "tailBeaconX",
            "canonical_name": "uavionix tailbeaconx",
            "function_category": "transponder_adsb",
            "legacy_vs_glass": "hybrid",
            "priority_family": "piston_single",
            "aliases": ["tailBeaconX", "tail beacon x", "uAvionix tailBeaconX"],
            "certifications": [{"authority": "FAA", "approval_type": "STC", "approval_ref": "TAILBEACONX_AML"}],
        },
        {
            "manufacturer": "BendixKing",
            "model": "KAP 140",
            "canonical_name": "bendixking kap 140",
            "function_category": "autopilot",
            "legacy_vs_glass": "legacy",
            "priority_family": "piston_single",
            "aliases": ["KAP 140", "King KAP 140", "Bendix/King KAP 140"],
            "certifications": [{"authority": "FAA", "approval_type": "TSO", "approval_ref": "TSO-AUTOPILOT_LEGACY"}],
        },
        {
            "manufacturer": "Genesys Aerosystems",
            "model": "S-TEC 55X",
            "canonical_name": "stec 55x autopilot",
            "function_category": "autopilot",
            "legacy_vs_glass": "legacy",
            "priority_family": "piston_single",
            "aliases": ["S-TEC 55X", "STEC 55X", "S TEC 55X"],
            "certifications": [{"authority": "FAA", "approval_type": "STC", "approval_ref": "STEC_55X_STC"}],
        },
        {
            "manufacturer": "Genesys Aerosystems",
            "model": "S-TEC 3100",
            "canonical_name": "stec 3100 autopilot",
            "function_category": "autopilot",
            "legacy_vs_glass": "glass",
            "priority_family": "piston_single",
            "aliases": ["S-TEC 3100", "STEC 3100", "S TEC 3100", "DFCS 3100"],
            "certifications": [{"authority": "FAA", "approval_type": "STC", "approval_ref": "STEC_3100_STC"}],
        },
        {
            "manufacturer": "L3Harris",
            "model": "NGT-9000",
            "canonical_name": "l3harris ngt 9000",
            "function_category": "transponder_adsb",
            "legacy_vs_glass": "hybrid",
            "priority_family": "piston_single",
            "aliases": ["NGT-9000", "NGT 9000", "L-3 NGT-9000"],
            "certifications": [{"authority": "FAA", "approval_type": "AML_STC", "approval_ref": "ADSB_CERTIFIED_EQUIPMENT"}],
        },
        {
            "manufacturer": "Capability",
            "model": "ADS-B Out",
            "canonical_name": "capability ads-b out",
            "function_category": "transponder_adsb",
            "legacy_vs_glass": "hybrid",
            "priority_family": "piston_single",
            "aliases": ["ADS-B Out", "ADS B Out", "ADSB Out"],
            "certifications": [{"authority": "FAA", "approval_type": "OTHER", "approval_ref": "CAPABILITY_SIGNAL"}],
        },
        {
            "manufacturer": "Capability",
            "model": "ADS-B In",
            "canonical_name": "capability ads-b in",
            "function_category": "transponder_adsb",
            "legacy_vs_glass": "hybrid",
            "priority_family": "piston_single",
            "aliases": ["ADS-B In", "ADS B In", "ADSB In"],
            "certifications": [{"authority": "FAA", "approval_type": "OTHER", "approval_ref": "CAPABILITY_SIGNAL"}],
        },
        {
            "manufacturer": "Capability",
            "model": "WAAS",
            "canonical_name": "capability waas",
            "function_category": "gps_fms",
            "legacy_vs_glass": "hybrid",
            "priority_family": "piston_single",
            "aliases": ["WAAS", "WAAS GPS"],
            "certifications": [{"authority": "FAA", "approval_type": "OTHER", "approval_ref": "CAPABILITY_SIGNAL"}],
        },
        {
            "manufacturer": "JPI",
            "model": "EDM Series",
            "canonical_name": "jpi edm series",
            "function_category": "engine_monitoring",
            "legacy_vs_glass": "hybrid",
            "priority_family": "piston_single",
            "aliases": ["JPI EDM", "EDM", "Engine Monitor", "Engine Monitoring"],
            "certifications": [{"authority": "FAA", "approval_type": "OTHER", "approval_ref": "CAPABILITY_SIGNAL"}],
        },
        {
            "manufacturer": "Ryan",
            "model": "Stormscope",
            "canonical_name": "ryan stormscope system",
            "function_category": "weather",
            "legacy_vs_glass": "legacy",
            "priority_family": "piston_single",
            "aliases": ["Ryan Stormscope", "Stormscope"],
            "certifications": [{"authority": "FAA", "approval_type": "OTHER", "approval_ref": "CAPABILITY_SIGNAL"}],
        },
        {
            "manufacturer": "Capability",
            "model": "XM Weather",
            "canonical_name": "capability xm weather",
            "function_category": "weather",
            "legacy_vs_glass": "hybrid",
            "priority_family": "piston_single",
            "aliases": ["XM Weather", "SiriusXM Weather", "Sirius XM Weather"],
            "certifications": [{"authority": "FAA", "approval_type": "OTHER", "approval_ref": "CAPABILITY_SIGNAL"}],
        },
        {
            "manufacturer": "Capability",
            "model": "Synthetic Vision",
            "canonical_name": "capability synthetic vision",
            "function_category": "situational_awareness",
            "legacy_vs_glass": "glass",
            "priority_family": "piston_single",
            "aliases": ["Synthetic Vision", "SVT"],
            "certifications": [{"authority": "FAA", "approval_type": "OTHER", "approval_ref": "CAPABILITY_SIGNAL"}],
        },
        {
            "manufacturer": "Capability",
            "model": "Electronic Stability Protection",
            "canonical_name": "capability electronic stability protection",
            "function_category": "flight_envelope_protection",
            "legacy_vs_glass": "glass",
            "priority_family": "piston_single",
            "aliases": ["Electronic Stability Protection", "ESP"],
            "certifications": [{"authority": "FAA", "approval_type": "OTHER", "approval_ref": "CAPABILITY_SIGNAL"}],
        },
        {
            "manufacturer": "Capability",
            "model": "TAWS-B",
            "canonical_name": "capability taws-b",
            "function_category": "terrain_awareness",
            "legacy_vs_glass": "hybrid",
            "priority_family": "piston_single",
            "aliases": ["TAWS-B", "TAWS B"],
            "certifications": [{"authority": "FAA", "approval_type": "OTHER", "approval_ref": "CAPABILITY_SIGNAL"}],
        },
        {
            "manufacturer": "BendixKing",
            "model": "KX 155",
            "canonical_name": "bendixking kx 155",
            "function_category": "comm_nav",
            "legacy_vs_glass": "legacy",
            "priority_family": "piston_single",
            "aliases": ["KX 155", "KX155", "King KX 155"],
            "certifications": [{"authority": "FAA", "approval_type": "TSO", "approval_ref": "TSO-C37/C38"}],
        },
        {
            "manufacturer": "Garmin",
            "model": "GTN 750",
            "canonical_name": "garmin gtn 750",
            "function_category": "gps_fms_nav_com",
            "legacy_vs_glass": "glass",
            "priority_family": "piston_multi",
            "aliases": ["GTN 750", "GTN750", "Garmin GTN 750", "GTN 750Xi", "GTN 750 Xi"],
            "certifications": [{"authority": "FAA", "approval_type": "TSO", "approval_ref": "TSO-C146"}],
        },
        {
            "manufacturer": "Garmin",
            "model": "GTN 650",
            "canonical_name": "garmin gtn 650",
            "function_category": "gps_fms_nav_com",
            "legacy_vs_glass": "glass",
            "priority_family": "piston_multi",
            "aliases": ["GTN 650", "GTN650", "Garmin GTN 650", "GTN 650Xi", "GTN 650 Xi"],
            "certifications": [{"authority": "FAA", "approval_type": "TSO", "approval_ref": "TSO-C146"}],
        },
        {
            "manufacturer": "Garmin",
            "model": "G600 TXi",
            "canonical_name": "garmin g600 txi",
            "function_category": "pfd_mfd",
            "legacy_vs_glass": "glass",
            "priority_family": "piston_multi",
            "aliases": ["G600 TXi", "G600TXi", "Garmin G600 TXi", "G600Txi"],
            "certifications": [{"authority": "FAA", "approval_type": "AML_STC", "approval_ref": "GARMIN_G600TXI_AML"}],
        },
        {
            "manufacturer": "Garmin",
            "model": "G500 TXi",
            "canonical_name": "garmin g500 txi",
            "function_category": "pfd_mfd",
            "legacy_vs_glass": "glass",
            "priority_family": "piston_multi",
            "aliases": ["G500 TXi", "G500TXi", "Garmin G500 TXi", "G500Txi"],
            "certifications": [{"authority": "FAA", "approval_type": "AML_STC", "approval_ref": "GARMIN_G500TXI_AML"}],
        },
        {
            "manufacturer": "Garmin",
            "model": "GFC 600",
            "canonical_name": "garmin gfc 600",
            "function_category": "autopilot",
            "legacy_vs_glass": "glass",
            "priority_family": "piston_multi",
            "aliases": ["GFC 600", "GFC600", "Garmin GFC 600", "Garmin GFC600"],
            "certifications": [{"authority": "FAA", "approval_type": "AML_STC", "approval_ref": "GARMIN_GFC600_AML"}],
        },
        {
            "manufacturer": "Avidyne",
            "model": "IFD 550",
            "canonical_name": "avidyne ifd 550 mp",
            "function_category": "gps_fms_nav_com",
            "legacy_vs_glass": "glass",
            "priority_family": "piston_multi",
            "aliases": ["IFD 550", "IFD550", "Avidyne IFD 550", "Avidyne IFD550"],
            "certifications": [{"authority": "FAA", "approval_type": "TSO", "approval_ref": "TSO-C146"}],
        },
        {
            "manufacturer": "Avidyne",
            "model": "IFD 540",
            "canonical_name": "avidyne ifd 540 mp",
            "function_category": "gps_fms_nav_com",
            "legacy_vs_glass": "glass",
            "priority_family": "piston_multi",
            "aliases": ["IFD 540", "IFD540", "Avidyne IFD 540", "Avidyne IFD540"],
            "certifications": [{"authority": "FAA", "approval_type": "TSO", "approval_ref": "TSO-C146"}],
        },
        {
            "manufacturer": "BendixKing",
            "model": "KFC 225",
            "canonical_name": "bendixking kfc 225",
            "function_category": "autopilot",
            "legacy_vs_glass": "legacy",
            "priority_family": "piston_multi",
            "aliases": ["KFC 225", "KFC225", "Bendix/King KFC 225", "King KFC 225"],
            "certifications": [{"authority": "FAA", "approval_type": "TSO", "approval_ref": "TSO-AUTOPILOT_LEGACY"}],
        },
        {
            "manufacturer": "Honeywell",
            "model": "KAS 297B",
            "canonical_name": "honeywell kas 297b",
            "function_category": "autopilot_control",
            "legacy_vs_glass": "legacy",
            "priority_family": "piston_multi",
            "aliases": ["KAS 297B", "KAS297B", "Honeywell KAS 297B", "King KAS 297B"],
            "certifications": [{"authority": "FAA", "approval_type": "TSO", "approval_ref": "TSO-AUTOPILOT_LEGACY"}],
        },
        {
            "manufacturer": "L3Harris",
            "model": "Lynx NGT-9000+",
            "canonical_name": "l3harris lynx ngt 9000 plus",
            "function_category": "transponder_adsb",
            "legacy_vs_glass": "hybrid",
            "priority_family": "piston_multi",
            "aliases": ["Lynx NGT-9000+", "NGT-9000+", "Lynx NGT9000+", "Lynx 9000+"],
            "certifications": [{"authority": "FAA", "approval_type": "AML_STC", "approval_ref": "ADSB_CERTIFIED_EQUIPMENT"}],
        },
    ]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build/seed avionics catalog tables")
    parser.add_argument(
        "--segment",
        default="piston_single",
        choices=["piston_single", "piston_multi", "turboprop", "rotorcraft", "jet", "all"],
        help="Priority family segment to seed",
    )
    parser.add_argument("--apply", action="store_true", help="Write changes to DB")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging")
    return parser.parse_args()


def _filter_units(all_units: list[dict[str, Any]], segment: str) -> list[dict[str, Any]]:
    if segment == "all":
        return all_units
    return [row for row in all_units if row.get("priority_family") == segment]


def main() -> int:
    args = parse_args()
    log = setup_logging(args.verbose)
    all_units = _seed_units()
    units = _filter_units(all_units, args.segment)
    alias_count = sum(len(row.get("aliases", [])) for row in units)
    cert_count = sum(len(row.get("certifications", [])) for row in units)

    log.info(
        "Catalog seed preview: segment=%s units=%s aliases=%s certs=%s apply=%s",
        args.segment,
        len(units),
        alias_count,
        cert_count,
        args.apply,
    )

    if not units:
        log.warning("No units matched requested segment '%s'. Nothing to do.", args.segment)
        return 0

    if not args.apply:
        for row in units[:10]:
            log.info(
                "[dry-run] %s %s (%s) aliases=%s",
                row["manufacturer"],
                row["model"],
                row["function_category"],
                len(row.get("aliases", [])),
            )
        if len(units) > 10:
            log.info("[dry-run] ... %s additional units omitted", len(units) - 10)
        return 0

    env_check()
    supabase = get_supabase()

    unit_rows: list[dict[str, Any]] = []
    for row in units:
        unit_rows.append(
            {
                "manufacturer": row["manufacturer"],
                "model": row["model"],
                "canonical_name": row["canonical_name"],
                "function_category": row["function_category"],
                "legacy_vs_glass": row["legacy_vs_glass"],
                "priority_family": row["priority_family"],
                "is_active": True,
            }
        )

    supabase.table("avionics_units").upsert(unit_rows, on_conflict="manufacturer,model").execute()

    canonical_names = [row["canonical_name"] for row in units]
    units_resp = (
        supabase.table("avionics_units")
        .select("id,canonical_name")
        .in_("canonical_name", canonical_names)
        .execute()
    )
    id_by_canonical = {
        str(row.get("canonical_name")): row.get("id") for row in (units_resp.data or []) if row.get("id")
    }

    alias_rows: list[dict[str, Any]] = []
    cert_rows: list[dict[str, Any]] = []
    evidence_rows: list[dict[str, Any]] = []

    for row in units:
        unit_id = id_by_canonical.get(row["canonical_name"])
        if not unit_id:
            log.warning("No unit ID found for canonical_name='%s'; skipping child rows", row["canonical_name"])
            continue

        aliases = row.get("aliases", [])
        seen_alias_norms: set[str] = set()
        for alias in aliases:
            alias_norm = _norm_alias(alias)
            if not alias_norm or alias_norm in seen_alias_norms:
                continue
            seen_alias_norms.add(alias_norm)
            alias_rows.append(
                {
                    "unit_id": unit_id,
                    "alias_text": alias,
                    "alias_norm": alias_norm,
                    "alias_source": "manual",
                    "confidence": 0.98,
                }
            )

        for cert in row.get("certifications", []):
            cert_rows.append(
                {
                    "unit_id": unit_id,
                    "authority": cert.get("authority", "FAA"),
                    "approval_type": cert.get("approval_type", "TSO"),
                    "approval_ref": cert.get("approval_ref"),
                    "approval_notes": "Phase 1 catalog seed",
                    "source_url": None,
                }
            )

        evidence_rows.append(
            {
                "unit_id": unit_id,
                "source_name": "phase1_seed_catalog",
                "source_url": None,
                "source_tier": "tier_b",
                "evidence_type": "catalog_seed",
                "confidence_score": 0.95,
                "payload": {
                    "priority_family": row["priority_family"],
                    "function_category": row["function_category"],
                    "alias_count": len(aliases),
                },
            }
        )

    if alias_rows:
        supabase.table("avionics_aliases").upsert(alias_rows, on_conflict="unit_id,alias_norm").execute()
    if cert_rows:
        supabase.table("avionics_certifications").upsert(
            cert_rows,
            on_conflict="unit_id,authority,approval_type,approval_ref",
        ).execute()
    if evidence_rows:
        supabase.table("avionics_source_evidence").insert(evidence_rows).execute()

    log.info(
        "Catalog seed applied: units=%s aliases=%s certs=%s evidence=%s",
        len(unit_rows),
        len(alias_rows),
        len(cert_rows),
        len(evidence_rows),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
