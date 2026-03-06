"""
Layer 2 helper: Avionics intelligence scoring.
Parses listing avionics text and estimates installed market value.
"""

from __future__ import annotations

import json
import os
import re

from .stc_intelligence import detect_stcs

AVIONICS_MARKET_VALUE = {
    # Glass Cockpit Systems (installed value in $USD)
    "garmin g1000": 35000,
    "garmin g2000": 55000,
    "garmin g3000": 75000,
    "garmin g500": 18000,
    "garmin g600": 22000,
    "garmin g700": 28000,
    "garmin g2000 suite": 10000,
    "avidyne entegra": 12000,
    "aspen evolution": 8000,
    "dynon skyview": 6000,
    # GPS/Nav Systems
    "garmin gtns 750": 18000,
    "garmin gns 530": 8000,
    "garmin gns 430": 5000,
    "garmin gns 430w": 7000,
    "garmin gns 480": 6000,
    "garmin aera": 1500,
    "king kln 94": 2500,
    # Autopilots
    "garmin gfc 500": 12000,
    "garmin gfc 700": 18000,
    "king kap 140": 5000,
    "king kfc 225": 7000,
    "century iii": 3000,
    "stec 55x": 6000,
    "stec 3100": 8000,
    "navmatic 300": 2000,
    # ADS-B
    "ads-b out": 2500,
    "ads-b in": 1500,
    "waas": 1000,
    # Weather
    "xm weather": 800,
    "siriusxm weather": 800,
    "strikefinder": 600,
    "ryan stormscope": 600,
    # Engine Monitoring
    "engine monitor": 2000,
    "jpi edm": 2500,
    "eis": 1500,
    # Transponders
    "garmin gtx 345": 3500,
    "garmin gtx 335": 2500,
    "garmin gtx 330": 1500,
    "garmin gtx 327": 1200,
    "garmin gtx 3000": 7000,
    # Comm/Nav
    "garmin gma 350": 2000,
    "garmin gma 35": 2200,
    "garmin gma 36": 2400,
    "garmin gma 340": 1200,
    "garmin gtc 570": 3000,
    "garmin gtx 33es": 3000,
    "garmin gts 800": 3500,
    "garmin gia 63w": 3500,
    "garmin gdu 1400": 4000,
    "garmin gea 71": 1500,
    "garmin grs 77": 1800,
    "garmin gsr 56": 2500,
    "garmin gdl 69a": 1800,
    "garmin gmu 44": 900,
    "garmin gdc 74a": 1200,
    "garmin gcu 275": 1800,
    "garmin gmc 720": 1800,
    "garmin safetaxi": 500,
    "garmin chartview": 1200,
    "avidyne ifd 550": 15000,
    "taws-b": 1500,
    "synthetic vision": 3000,
    "electronic stability protection": 1200,
    "king kx 155": 800,
}


STEAM_GAUGE_INDICATORS = [
    "steam gauge",
    "steam gauges",
    "six pack",
    "analog",
    "original avionics",
    "original panel",
]


AVIONICS_ALIASES = {
    "garmin g1000": ["g1000", "garmin g1000"],
    "garmin g2000": ["g2000", "garmin g2000"],
    "garmin g3000": ["g3000", "garmin g3000"],
    "garmin g500": ["g500", "garmin g500"],
    "garmin g600": ["g600", "garmin g600"],
    "garmin g700": ["g700", "garmin g700"],
    "garmin g2000 suite": ["g2000 suite", "garmin g2000 suite", "g2000 integrated flight deck", "g2000 integrated"],
    "avidyne entegra": ["avidyne entegra", "entegra"],
    "aspen evolution": ["aspen evolution", "aspen"],
    "dynon skyview": ["dynon skyview", "skyview"],
    "garmin gtns 750": ["garmin gtns 750", "gtns 750", "gtn 750", "gtn750", "gtn 750 xi", "gtn750xi"],
    "garmin gns 530": ["garmin gns 530", "gns 530", "gns530"],
    "garmin gns 430": ["garmin gns 430", "gns 430", "gns430"],
    "garmin gns 430w": ["garmin gns 430w", "gns 430w", "gns430w"],
    "garmin gns 480": ["garmin gns 480", "gns 480", "gns480"],
    "garmin aera": ["garmin aera", "aera"],
    "king kln 94": ["king kln 94", "kln 94", "kln94"],
    "garmin gfc 500": ["garmin gfc 500", "gfc 500", "gfc500"],
    "garmin gfc 700": ["garmin gfc 700", "gfc 700", "gfc700"],
    "king kap 140": ["king kap 140", "kap 140", "kap140"],
    "king kfc 225": ["king kfc 225", "kfc 225", "kfc225"],
    "century iii": ["century iii", "century 3"],
    "stec 55x": ["stec 55x", "s tec 55x", "s-tec 55x"],
    "stec 3100": ["stec 3100", "s tec 3100", "s-tec 3100"],
    "navmatic 300": ["navmatic 300"],
    "ads-b out": ["ads-b out", "ads b out", "adsb out"],
    "ads-b in": ["ads-b in", "ads b in", "adsb in"],
    "waas": ["waas"],
    "xm weather": ["xm weather"],
    "siriusxm weather": ["siriusxm weather", "sirius xm weather"],
    "strikefinder": ["strikefinder"],
    "ryan stormscope": ["ryan stormscope", "stormscope"],
    "engine monitor": ["engine monitor"],
    "jpi edm": ["jpi edm", "edm"],
    "eis": ["eis"],
    "garmin gtx 345": ["garmin gtx 345", "gtx 345", "gtx345"],
    "garmin gtx 335": ["garmin gtx 335", "gtx 335", "gtx335"],
    "garmin gtx 330": ["garmin gtx 330", "gtx 330", "gtx330"],
    "garmin gtx 327": ["garmin gtx 327", "gtx 327", "gtx327"],
    "garmin gtx 3000": ["garmin gtx 3000", "gtx 3000", "gtx3000"],
    "garmin gma 350": ["garmin gma 350", "gma 350", "gma350"],
    "garmin gma 35": ["garmin gma 35", "gma 35", "gma35"],
    "garmin gma 36": ["garmin gma 36", "gma 36", "gma36"],
    "garmin gma 340": ["garmin gma 340", "gma 340", "gma340"],
    "garmin gtc 570": ["garmin gtc 570", "gtc 570", "gtc570"],
    "garmin gtx 33es": ["garmin gtx 33es", "gtx 33es", "gtx33es"],
    "garmin gts 800": ["garmin gts 800", "gts 800", "gts800"],
    "garmin gia 63w": ["garmin gia 63w", "gia 63w", "gia63w"],
    "garmin gdu 1400": ["garmin gdu 1400", "gdu 1400", "gdu1400"],
    "garmin gea 71": ["garmin gea 71", "gea 71", "gea71"],
    "garmin grs 77": ["garmin grs 77", "grs 77", "grs77"],
    "garmin gsr 56": ["garmin gsr 56", "gsr 56", "gsr56", "iridium gsr 56"],
    "garmin gdl 69a": ["garmin gdl 69a", "gdl 69a", "gdl69a"],
    "garmin gmu 44": ["garmin gmu 44", "gmu 44", "gmu44"],
    "garmin gdc 74a": ["garmin gdc 74a", "gdc 74a", "gdc74a"],
    "garmin gcu 275": ["garmin gcu 275", "gcu 275", "gcu275"],
    "garmin gmc 720": ["garmin gmc 720", "gmc 720", "gmc720"],
    "garmin safetaxi": ["garmin safetaxi", "safetaxi"],
    "garmin chartview": ["garmin chart view", "garmin chartview", "chart view", "chartview", "jeppesen chart view"],
    "taws-b": ["taws-b", "taws b", "terrain awareness and warning system"],
    "synthetic vision": ["synthetic vision", "svt"],
    "electronic stability protection": ["electronic stability protection", "esp"],
    "king kx 155": ["king kx 155", "kx 155", "kx155"],
    "avidyne ifd 550": ["avidyne ifd 550", "ifd 550", "ifd550"],
}

_market_values_client = None
_alias_to_market_value_cache: dict[str, dict[str, dict]] = {}


def _description_intelligence_text(listing: dict) -> str:
    value = listing.get("description_intelligence")
    if not value:
        return ""
    parsed = value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except Exception:
            return ""
    if not isinstance(parsed, dict):
        return ""
    chunks: list[str] = []
    avionics = parsed.get("avionics")
    if isinstance(avionics, list):
        chunks.extend(str(item) for item in avionics if item)

    detailed = parsed.get("avionics_detailed")
    if isinstance(detailed, list):
        for item in detailed:
            if not isinstance(item, dict):
                continue
            canonical_name = item.get("canonical_name")
            if canonical_name:
                chunks.append(str(canonical_name))
            for token in item.get("matched_texts", []) if isinstance(item.get("matched_texts"), list) else []:
                if token:
                    chunks.append(str(token))

    unresolved = parsed.get("avionics_unresolved")
    if isinstance(unresolved, list):
        chunks.extend(str(token) for token in unresolved if token)

    return " ".join(chunks)


def _normalize_text(value: str) -> str:
    lowered = (value or "").lower()
    alnum_spaces = re.sub(r"[^a-z0-9]+", " ", lowered)
    return re.sub(r"\s+", " ", alnum_spaces).strip()


def _contains_phrase(normalized_description: str, phrase: str) -> bool:
    normalized_phrase = _normalize_text(phrase)
    if not normalized_phrase:
        return False
    padded = f" {normalized_description} "
    return f" {normalized_phrase} " in padded


def _safe_float(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number:  # NaN
        return None
    return number


def _infer_segment(listing: dict) -> str:
    aircraft_type = str(listing.get("aircraft_type") or "").lower()
    model = str(listing.get("model") or "").lower()
    if any(token in aircraft_type for token in ("multi", "twin")) or any(token in model for token in ("twin", "seneca", "baron")):
        return "piston_multi"
    if "turboprop" in aircraft_type:
        return "turboprop"
    if "rotor" in aircraft_type or "helicopter" in aircraft_type:
        return "rotorcraft"
    if "jet" in aircraft_type:
        return "jet"
    return "piston_single"


def _get_alias_to_market_value(segment: str) -> dict[str, dict]:
    if segment in _alias_to_market_value_cache:
        return _alias_to_market_value_cache[segment]

    url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not service_key:
        _alias_to_market_value_cache[segment] = {}
        return {}

    global _market_values_client
    if _market_values_client is None:
        try:
            from supabase import create_client

            _market_values_client = create_client(url, service_key)
        except Exception:
            _alias_to_market_value_cache[segment] = {}
            return {}

    try:
        units_resp = _market_values_client.table("avionics_units").select("id,canonical_name").eq("is_active", True).execute()
        units = units_resp.data or []
        if not units:
            _alias_to_market_value_cache[segment] = {}
            return {}
        unit_ids = [row["id"] for row in units if row.get("id")]
        aliases_resp = (
            _market_values_client.table("avionics_aliases")
            .select("unit_id,alias_norm")
            .in_("unit_id", unit_ids)
            .execute()
        )
        aliases = aliases_resp.data or []
        market_resp = (
            _market_values_client.table("avionics_market_values")
            .select("unit_id,aircraft_segment,sample_count,price_p25,oem_msrp_value,valuation_basis,confidence_score")
            .in_("aircraft_segment", [segment, "piston_single"])
            .in_("unit_id", unit_ids)
            .execute()
        )
        market_rows = market_resp.data or []
    except Exception:
        _alias_to_market_value_cache[segment] = {}
        return {}

    unit_aliases: dict[int, set[str]] = {}
    for row in units:
        unit_id = row.get("id")
        canonical_name = _normalize_text(str(row.get("canonical_name") or ""))
        if not unit_id:
            continue
        unit_aliases.setdefault(int(unit_id), set())
        if canonical_name:
            unit_aliases[int(unit_id)].add(canonical_name)
    for row in aliases:
        unit_id = row.get("unit_id")
        alias_norm = _normalize_text(str(row.get("alias_norm") or ""))
        if not unit_id or not alias_norm:
            continue
        unit_aliases.setdefault(int(unit_id), set()).add(alias_norm)

    # Prefer exact requested segment; otherwise fall back to piston_single defaults.
    market_by_unit: dict[int, dict] = {}
    for row in market_rows:
        unit_id = row.get("unit_id")
        seg = str(row.get("aircraft_segment") or "")
        if not unit_id:
            continue
        if unit_id not in market_by_unit:
            market_by_unit[int(unit_id)] = row
            continue
        current_seg = str(market_by_unit[int(unit_id)].get("aircraft_segment") or "")
        if seg == segment and current_seg != segment:
            market_by_unit[int(unit_id)] = row

    alias_lookup: dict[str, dict] = {}
    for unit_id, aliases_for_unit in unit_aliases.items():
        market_row = market_by_unit.get(unit_id)
        if not market_row:
            continue
        for alias in aliases_for_unit:
            alias_lookup[alias] = market_row

    _alias_to_market_value_cache[segment] = alias_lookup
    return alias_lookup


def _resolve_equipment_value(
    equipment: str,
    aliases: list[str],
    *,
    segment: str,
    fallback_value: int,
) -> tuple[int, str, int | None]:
    alias_lookup = _get_alias_to_market_value(segment)
    market_row = None
    for alias in aliases:
        alias_norm = _normalize_text(alias)
        if not alias_norm:
            continue
        market_row = alias_lookup.get(alias_norm)
        if market_row:
            break

    if not market_row:
        return fallback_value, "fallback_static", None

    oem = _safe_float(market_row.get("oem_msrp_value"))
    if oem is not None and oem > 0:
        return int(round(oem)), "oem_msrp", int(market_row.get("sample_count") or 0)

    sample_count = int(market_row.get("sample_count") or 0)
    p25 = _safe_float(market_row.get("price_p25"))
    if sample_count >= 3 and p25 is not None and p25 > 0:
        return int(round(p25)), "market_p25", sample_count

    return fallback_value, "fallback_static", sample_count


def avionics_score(listing: dict) -> dict:
    description = (
        listing.get("avionics_description")
        or listing.get("description_full")
        or listing.get("description")
        or ""
    )
    intelligence_text = _description_intelligence_text(listing)
    normalized_description = _normalize_text(f"{description} {intelligence_text}")
    stc_intel = detect_stcs(listing)
    segment = _infer_segment(listing)

    installed_value = 0
    matched_items = []
    value_source_counts = {"oem_msrp": 0, "market_p25": 0, "fallback_static": 0}
    market_sample_total = 0

    for equipment, fallback_value in AVIONICS_MARKET_VALUE.items():
        aliases = AVIONICS_ALIASES.get(equipment, [equipment])
        if any(_contains_phrase(normalized_description, alias) for alias in aliases):
            resolved_value, value_source, sample_count = _resolve_equipment_value(
                equipment,
                aliases,
                segment=segment,
                fallback_value=fallback_value,
            )
            installed_value += resolved_value
            value_source_counts[value_source] = int(value_source_counts.get(value_source, 0)) + 1
            if isinstance(sample_count, int) and sample_count > 0:
                market_sample_total += sample_count
            matched_items.append(
                {
                    "item": equipment,
                    "value": resolved_value,
                    "value_source": value_source,
                    "market_sample_count": sample_count,
                }
            )

    # Avoid stacking multiple primary glass systems when listings mention alternatives.
    glass_systems = {
        "garmin g1000",
        "garmin g2000",
        "garmin g3000",
        "garmin g500",
        "garmin g600",
        "garmin g700",
        "avidyne entegra",
        "aspen evolution",
        "dynon skyview",
    }
    matched_glass = [item for item in matched_items if item["item"] in glass_systems]
    if len(matched_glass) > 1:
        best_glass = max(matched_glass, key=lambda item: item["value"])
        non_glass = [item for item in matched_items if item["item"] not in glass_systems]
        matched_items = [best_glass, *non_glass]
        installed_value = sum(item["value"] for item in matched_items)

    has_glass = any(_contains_phrase(normalized_description, k) for k in ["g1000", "g2000", "g3000", "g500", "g600", "entegra"])
    is_steam = any(_contains_phrase(normalized_description, k) for k in STEAM_GAUGE_INDICATORS)
    matched_names = {item["item"] for item in matched_items}
    has_nav = bool(
        matched_names
        & {
            "garmin gtns 750",
            "garmin gns 530",
            "garmin gns 430",
            "garmin gns 430w",
            "garmin gns 480",
            "garmin aera",
            "king kln 94",
        }
    )
    has_autopilot = bool(
        matched_names
        & {
            "garmin gfc 500",
            "garmin gfc 700",
            "king kap 140",
            "king kfc 225",
            "century iii",
            "stec 55x",
            "stec 3100",
            "navmatic 300",
        }
    )
    has_adsb = bool(matched_names & {"ads-b out", "ads-b in", "garmin gtx 345", "garmin gtx 335", "garmin gtx 330"})

    bundle_multiplier = 1.0
    bundle_profile = "base"
    if has_nav and has_autopilot and has_adsb:
        bundle_multiplier = 1.20
        bundle_profile = "ifr_stack_plus_adsb"
    elif has_nav and has_autopilot:
        bundle_multiplier = 1.12
        bundle_profile = "ifr_stack"
    elif has_glass and has_autopilot:
        bundle_multiplier = 1.10
        bundle_profile = "glass_plus_autopilot"
    elif has_nav and has_adsb:
        bundle_multiplier = 1.06
        bundle_profile = "nav_plus_adsb"

    bundle_adjusted_value = int(round(installed_value * bundle_multiplier))
    total_stc_premium = int(stc_intel.get("total_market_value_premium") or 0)
    total_modification_value = bundle_adjusted_value + total_stc_premium

    if total_modification_value == 0 and is_steam:
        score = 20
    elif total_modification_value == 0:
        score = 40
    else:
        score = min(100, 40 + (total_modification_value / 50000) * 60)

    dominant_source = "none"
    if matched_items:
        dominant_source = max(value_source_counts.items(), key=lambda item: item[1])[0]

    return {
        "score": round(score, 1),
        "installed_value": installed_value,
        "bundle_adjusted_value": bundle_adjusted_value,
        "bundle_multiplier": round(bundle_multiplier, 2),
        "bundle_profile": bundle_profile,
        "total_modification_value": total_modification_value,
        "stc_market_value_premium_total": total_stc_premium,
        "detected_stcs": stc_intel.get("detected_stcs", []),
        "matched_items": matched_items,
        "market_value_source_breakdown": value_source_counts,
        "market_value_source_primary": dominant_source,
        "market_sample_total": market_sample_total,
        "has_glass_cockpit": has_glass,
        "is_steam_gauge": is_steam,
        "data_available": len(description) > 20,
    }
