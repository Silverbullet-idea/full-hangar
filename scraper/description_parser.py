from __future__ import annotations

import re
from typing import Any

PARSER_VERSION = "2.0.3"


AVIONICS_MAP: dict[str, str] = {
    r"\bGarmin\s*650\s*/\s*750\b": "Garmin GTN 750",
    r"\bGTN750\b": "Garmin GTN 750",
    r"\bGTN[\s\-]?750(?:\s*XI|XI)?\b": "Garmin GTN 750",
    r"\bGarmin[\s\-]?(GTN[\s\-]?750|750)\b": "Garmin GTN 750",
    r"\bGTN[\s\-]?650(?:\s*XI|XI)?\b": "Garmin GTN 650",
    r"\bGarmin[\s\-]?(GTN[\s\-]?650|650)\b": "Garmin GTN 650",
    r"\bGNS[\s\-]?430W\b": "Garmin GNS 430W",
    r"\bGNS[\s\-]?430\b": "Garmin GNS 430",
    r"\bGNS[\s\-]?530W?\b": "Garmin GNS 530W",
    r"\bG1000\b": "Garmin G1000",
    r"\bG2000\b": "Garmin G2000",
    r"\bAspen(?:\s+EFD)?\b": "Aspen EFD1000",
    r"\bADS[\s\-]?B(?:\s*(?:OUT|IN\/OUT|IN\s*OUT))?\b": "ADS-B Out",
    r"\bADS[\s\-]?B\s*IN\b": "ADS-B In",
    r"\bSTEC[\s\-]?55X\b|\bS[\s\-]?TEC[\s\-]?55X\b|\bSTEC[\s\-]?55\b": "S-TEC 55X Autopilot",
    r"\bKAP[\s\-]?140\b": "Bendix/King KAP 140",
    r"\bG[\s\-]?5s?\b": "Garmin G5 EFIS",
    r"\bS[\s\-]?TEC[\s\-]?3100\b": "S-TEC 3100 DFCS",
    r"\bIFD[\s\-]?550\b": "Avidyne IFD 550",
    r"\bGMA[\s\-]?3[56]\b": "Garmin GMA 36/35 Audio Panel",
    r"\bGMA[\s\-]?350\b": "Garmin GMA 350 Audio Panel",
    r"\bGMA[\s\-]?340\b": "Garmin GMA 340 Audio Panel",
    r"\bGTC[\s\-]?570\b": "Garmin GTC 570 Controller",
    r"\bGTX[\s\-]?345R\b": "Garmin GTX 345",
    r"\bGTX[\s\-]?345\b": "Garmin GTX 345",
    r"\bGTX[\s\-]?335\b": "Garmin GTX 335",
    r"\bGTX[\s\-]?330\b": "Garmin GTX 330",
    r"\bGTX[\s\-]?327\b": "Garmin GTX 327",
    r"\bGTX[\s\-]?3000\b": "Garmin GTX 3000",
    r"\bGTX[\s\-]?33ES\b": "Garmin GTX 33ES Transponder",
    r"\bGTX[\s\-]?330ES\b": "Garmin GTX 330ES Transponder",
    r"\bGTS[\s\-]?800\b": "Garmin GTS 800 Traffic",
    r"\bGIA[\s\-]?63W\b": "Garmin GIA 63W NAV/COM/GPS",
    r"\bGSR[\s\-]?56\b": "Garmin GSR 56 Iridium",
    r"\bGDU[\s\-]?1400\b": "Garmin GDU 1400 Display",
    r"\bGEA[\s\-]?71\b": "Garmin GEA 71 Engine/Airframe",
    r"\bGRS[\s\-]?77\b": "Garmin GRS 77 AHRS",
    r"\bGDC[\s\-]?74A\b": "Garmin GDC 74A Air Data Computer",
    r"\bGMU[\s\-]?44\b": "Garmin GMU 44 Magnetometer",
    r"\bGCU[\s\-]?275\b": "Garmin GCU 275 Controller",
    r"\bGFC[\s\-]?700\b": "Garmin GFC 700 Autopilot",
    r"\bGMC[\s\-]?720\b": "Garmin GMC 720 AFCS Controller",
    r"\bGDL[\s\-]?69A\b": "Garmin GDL 69A Datalink",
    r"\bTAWS[\s\-]?B\b": "TAWS-B",
    r"\bSVT\b": "Synthetic Vision (SVT)",
    r"\bESP\b": "Electronic Stability Protection (ESP)",
}

MODS_MAP: dict[str, str] = {
    r"\bOsborne\s+tip\s+tanks\b|\btip\s+tanks\b": "Tip Tanks",
    r"\bRAM\s+conversion\b": "RAM Engine Conversion",
    r"\bturbo[\s\-]?normalized\b|\bTurbo[\s\-]?Normaliz(?:ed|ing)\b|\bTN\b": "Turbo Normalizing",
    r"\bRobertson\s+STOL\b": "Robertson STOL Kit",
    r"\bHorton\s+STOL\b": "Horton STOL Kit",
    r"\bspeed\s+brakes\b": "Speed Brakes",
    r"\bKnots\s*2U\b": "Knots 2U Speed Mods",
}


def _normalize_text(text: str) -> str:
    return " ".join((text or "").replace("\u00a0", " ").split())


def _int_from_number_text(number_text: str) -> int | None:
    try:
        return int(number_text.replace(",", ""))
    except (TypeError, ValueError):
        return None


def _float_from_number_text(number_text: str) -> float | None:
    try:
        return float(number_text.replace(",", ""))
    except (TypeError, ValueError):
        return None


def sanitize_engine_model(value: str | None) -> str | None:
    if not value:
        return None
    text = _normalize_text(value)
    if not text:
        return None

    # Reject obvious non-model narratives that occasionally leak from spec blocks.
    if re.match(r"^(?:\d{1,6}\s+)?since\s+new\b", text, flags=re.IGNORECASE):
        return None
    if re.match(r"^\d{1,6}\s+since\s+new\b", text, flags=re.IGNORECASE):
        return None

    # Strip obvious trailing narrative fragments that are not part of engine model.
    cut_markers = [
        r"\s[-|]\s*\d{2,7}\s*(?:tt|hours?|hrs?)\b",
        r"\b\d{2,7}\s*tt(?:af)?\b",
        r"\bsince\s+new\b",
        r"\bannual(?:\s+inspection)?\b",
        r"\bavionics\b",
        r"\badditional\s+equipment\b",
        r"\bexceptional\s+features\b",
        r"\bupgrades?\b",
        r"\bno\s+damage\s+history\b",
    ]
    earliest_cut: int | None = None
    for marker in cut_markers:
        match = re.search(marker, text, flags=re.IGNORECASE)
        if match:
            if earliest_cut is None or match.start() < earliest_cut:
                earliest_cut = match.start()

    if earliest_cut is not None and earliest_cut > 8:
        text = text[:earliest_cut].strip(" -:;,")

    if len(text) > 110:
        sentence_cut = re.search(r"[.;]", text[40:])
        if sentence_cut:
            text = text[: 40 + sentence_cut.start()].strip(" -:;,")
        else:
            text = text[:110].rsplit(" ", 1)[0].strip(" -:;,")

    if not text:
        return None
    has_engine_token = bool(
        re.search(
            r"\b(?:lycoming|continental|pratt\s*&\s*whitney|rotax|tsio|tio|io[\- ]\d|o[\- ]\d|aeio|go[\- ]\d|l?tsio|pt6|rr)\b",
            text,
            flags=re.IGNORECASE,
        )
    )
    if not has_engine_token and re.search(
        r"\b(?:interior|exterior|avionics|useful\s*load|top\s*overhaul|cylinders|annual)\b",
        text,
        flags=re.IGNORECASE,
    ):
        return None
    if re.fullmatch(r"(unknown|n/?a|none|-+)", text, flags=re.IGNORECASE):
        return None
    return text


def extract_engine_model(text: str) -> str | None:
    src = _normalize_text(text)
    if not src:
        return None

    labeled_patterns = [
        r"\b(?:engine\s*(?:1\s*)?(?:make/model|model)?|powerplant)\s*[:\-]\s*([^.;]{6,220})",
        r"\b(?:engine\s*(?:1\s*)?(?:make/model|model)?|powerplant)\s+([^.;]{6,220})",
    ]
    for pattern in labeled_patterns:
        match = re.search(pattern, src, flags=re.IGNORECASE)
        if not match:
            continue
        cleaned = sanitize_engine_model(match.group(1))
        if cleaned:
            return cleaned

    make_model_match = re.search(
        r"\b((?:Lycoming|Continental|Pratt\s*&\s*Whitney|Rotax)\s+[A-Z0-9][A-Z0-9\-/]*(?:\s*\([^)]+\))?)",
        src,
        flags=re.IGNORECASE,
    )
    if make_model_match:
        return sanitize_engine_model(make_model_match.group(1))

    standalone_model_match = re.search(
        r"\b((?:TSIO|TIO|IO|O|AEIO|GO|LTSIO|PT6A|RR)\-?[A-Z0-9]{2,}(?:\-[A-Z0-9]{1,4})?)\b",
        src,
        flags=re.IGNORECASE,
    )
    if standalone_model_match:
        return sanitize_engine_model(standalone_model_match.group(1))
    return None


def extract_times(text: str) -> dict[str, int]:
    src = _normalize_text(text)
    out: dict[str, int] = {}

    patterns = {
        "total_time": [
            r"\bTTAF\s*[:\-]?\s*([\d,]{2,7})\b",
            r"\b([\d,]{2,7})\s*TT\b",
            r"\b([\d,]{2,7})\s*TTAF\b",
            r"\b([\d,]{2,7})\s*total\s*time\b",
        ],
        "engine_smoh": [
            r"\b([\d,]{2,7})\s*SMOH\b",
            r"\b([\d,]{2,7})\s*SRAM\b",
            r"\b([\d,]{2,7})\s*since\s*major\b",
            r"\bSMOH\s*[:\-]?\s*([\d,]{2,7})\b",
        ],
        "prop_spoh": [
            r"\b([\d,]{2,7})\s*SPOH\b",
            r"\b([\d,]{2,7})\s*since\s*prop\s*overhaul\b",
        ],
        "engine_stop": [
            r"\b([\d,]{2,7})\s*since\s*top\b",
            r"\b([\d,]{2,7})\s*STOP\b",
        ],
    }

    for key, key_patterns in patterns.items():
        for pattern in key_patterns:
            match = re.search(pattern, src, flags=re.IGNORECASE)
            if not match:
                continue
            value = _int_from_number_text(match.group(1))
            if value is not None:
                out[key] = value
                break
    return out


def extract_cylinder_time_since_new(text: str) -> int | None:
    src = _normalize_text(text)
    patterns = [
        r"\b([\d,]{1,6})\s*(?:hours?|hrs?)\s+since\s+new\s+cylinders?\b",
        r"\bcylinders?\b[^.]{0,80}\b([\d,]{1,6})\s*(?:hours?|hrs?)\s+since\s+new\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, src, flags=re.IGNORECASE)
        if match:
            return _int_from_number_text(match.group(1))
    return None


def extract_hours_since_iran(text: str) -> int | None:
    src = _normalize_text(text)
    match = re.search(r"\b([\d,]{1,6})\s*(?:hours?|hrs?)\s+since\s+IRAN\b", src, flags=re.IGNORECASE)
    if not match:
        return None
    return _int_from_number_text(match.group(1))


def extract_last_annual_inspection(text: str) -> str | None:
    src = _normalize_text(text)
    patterns = [
        r"\bannual(?:\s+inspection)?\s*[:\-]?\s*(?:completed\s*)?(?:in\s*)?([A-Za-z]{3,9}\s+\d{4})\b",
        r"\bannual(?:\s+inspection)?\s*[:\-]?\s*(\d{1,2}/\d{4})\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, src, flags=re.IGNORECASE)
        if not match:
            continue
        value = _normalize_text(match.group(1))
        if value:
            return value
    return None


def extract_avionics(text: str) -> list[str]:
    detailed = extract_avionics_detailed(text)
    return sorted({str(item.get("canonical_name")) for item in detailed if item.get("canonical_name")})


def _infer_quantity(window_text: str) -> int:
    window = _normalize_text(window_text).lower()
    if not window:
        return 1
    # Highest confidence explicit multipliers first.
    mult = re.search(r"\b([2-4])\s*[xX]\b", window)
    if mult:
        return int(mult.group(1))
    if re.search(r"\bdual\b|\btwo\b", window):
        return 2
    if re.search(r"\btriple\b|\bthree\b", window):
        return 3
    if re.search(r"\bquad\b|\bfour\b", window):
        return 4
    return 1


def extract_avionics_detailed(text: str) -> list[dict[str, Any]]:
    src = _normalize_text(text)
    if not src:
        return []

    aggregated: dict[str, dict[str, Any]] = {}
    for pattern, canonical_name in AVIONICS_MAP.items():
        for match in re.finditer(pattern, src, flags=re.IGNORECASE):
            start = max(0, match.start() - 18)
            end = min(len(src), match.end() + 18)
            context = src[start:end]
            quantity = _infer_quantity(context)

            entry = aggregated.setdefault(
                canonical_name,
                {
                    "canonical_name": canonical_name,
                    "quantity": 1,
                    "confidence": 0.95,
                    "match_type": "regex_alias",
                    "matched_texts": [],
                },
            )
            entry["quantity"] = max(int(entry.get("quantity") or 1), quantity)
            texts = entry["matched_texts"]
            if len(texts) < 5:
                texts.append(match.group(0))

    return sorted(aggregated.values(), key=lambda row: str(row.get("canonical_name") or ""))


def extract_avionics_unresolved(text: str, matched: list[dict[str, Any]] | None = None) -> list[str]:
    src = _normalize_text(text)
    if not src:
        return []

    matched = matched or []
    resolved_tokens: set[str] = set()
    for item in matched:
        for token in item.get("matched_texts", []):
            resolved_tokens.add(re.sub(r"[^A-Za-z0-9]+", "", str(token).upper()))

    candidates = re.findall(
        r"\b(?:GTN[\- ]?\d{3}(?:XI)?|GNS[\- ]?\d{3}W?|IFD[\- ]?\d{3}|GNX[\- ]?\d{3}|GPS[\- ]?\d{3}|"
        r"GFC[\- ]?\d{3}|GTX[\- ]?\d{2,4}[A-Z]{0,2}|GMA[\- ]?\d{2,4}|GTC[\- ]?\d{2,4}|GTS[\- ]?\d{2,4}|"
        r"GIA[\- ]?\d{2,4}[A-Z]?|GDU[\- ]?\d{2,4}|GEA[\- ]?\d{2,4}|GRS[\- ]?\d{2,4}|GSR[\- ]?\d{2,4}|"
        r"GDL[\- ]?\d{2,4}[A-Z]?|GMU[\- ]?\d{2,4}|GDC[\- ]?\d{2,4}[A-Z]?|GCU[\- ]?\d{2,4}|GMC[\- ]?\d{2,4}|"
        r"KAP[\- ]?\d{2,4}|KFC[\- ]?\d{2,4}|KX[\- ]?\d{2,4}[A-Z]?|KLN[\- ]?\d{2,4}[A-Z]?|KGX[\- ]?\d{2,4}|"
        r"STEC[\- ]?\d{2,4}[A-Z]?|S[\- ]?TEC[\- ]?\d{2,4}[A-Z]?|PMA[\- ]?\d{2,4}[A-Z]?|NGT[\- ]?\d{2,4})\b",
        src.upper(),
    )
    deny = {
        "TT",
        "TTAF",
        "SMOH",
        "SPOH",
        "STOP",
        "ADSB",
        "ADSBOUT",
        "ADSBIN",
        "SVT",
        "ESP",
        "TAWSB",
        "GTN750",
        "GTX345R",
    }
    unresolved: set[str] = set()
    for raw in candidates:
        compact = re.sub(r"[^A-Za-z0-9]+", "", raw.upper())
        if not compact or compact in deny:
            continue
        if compact in resolved_tokens:
            continue
        # Ignore short numeric fragments that slip through.
        if compact.isdigit() or len(compact) < 4:
            continue
        unresolved.add(compact)
    return sorted(unresolved)


def extract_mods_and_stcs(text: str) -> list[str]:
    src = _normalize_text(text)
    matched: set[str] = set()
    for pattern, canonical_name in MODS_MAP.items():
        if re.search(pattern, src, flags=re.IGNORECASE):
            matched.add(canonical_name)
    return sorted(matched)


def extract_useful_load(text: str) -> int | None:
    src = _normalize_text(text)
    patterns = [
        r"\b([\d,]{2,5})\s*useful\s*load\b",
        r"\buseful\s*load\s*[:\-]?\s*([\d,]{2,5})\b",
        r"\bUL\s*[:\-]?\s*([\d,]{2,5})\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, src, flags=re.IGNORECASE)
        if not match:
            continue
        value = _int_from_number_text(match.group(1))
        if value is not None:
            return value
    return None


def extract_fuel_capacity(text: str) -> int | None:
    src = _normalize_text(text)
    patterns = [
        r"\b([\d,]{2,4})\s*gal(?:lons?)?\s*usable\b",
        r"\btotal\s*fuel\s*[:\-]?\s*([\d,]{2,4})\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, src, flags=re.IGNORECASE)
        if not match:
            continue
        value = _int_from_number_text(match.group(1))
        if value is not None:
            return value
    return None


def extract_special_equipment(text: str) -> dict[str, bool]:
    src = _normalize_text(text).lower()
    equipment: dict[str, bool] = {}
    if re.search(r"\boxygen\b|\bo2\b|\btat\b", src):
        equipment["oxygen_system"] = True
    if re.search(r"\btks\b|\bboots\b|\bde[\s\-]?ice\b", src):
        equipment["known_ice"] = True
    if re.search(r"\bair\s*conditioning\b|\ba\/c\b", src):
        equipment["air_conditioning"] = True
    if re.search(r"\bengine\s*pre[\s\-]?heat\b", src):
        equipment["engine_pre_heat"] = True
    if re.search(r"\bco\s*detector\b|\bpulse\s*oximeter\b", src):
        equipment["safety_monitoring_equipment"] = True
    return equipment


def extract_fractional_pricing(text: str, observed_price: int | float | None = None) -> dict[str, Any]:
    src = _normalize_text(text)
    payload: dict[str, Any] = {
        "is_fractional": False,
        "share_numerator": None,
        "share_denominator": None,
        "share_percent": None,
        "share_price": None,
        "normalized_full_price": None,
        "review_needed": False,
        "evidence": [],
    }
    if not src:
        return payload

    evidence: list[str] = []
    numerator: int | None = None
    denominator: int | None = None
    share_percent: float | None = None

    ratio_match = re.search(r"\b(\d{1,2})\s*/\s*(\d{1,3})(?:st|nd|rd|th)?\b", src, flags=re.IGNORECASE)
    if ratio_match:
        ratio_text = ratio_match.group(0)
        window_start = max(0, ratio_match.start() - 50)
        window_end = min(len(src), ratio_match.end() + 50)
        context_window = src[window_start:window_end]
        if re.search(
            r"\b(?:partnership|fractional|ownership|co[\-\s]?ownership|share|member(?:ship)?\s+interest|interest)\b",
            context_window,
            flags=re.IGNORECASE,
        ):
            numerator = int(ratio_match.group(1))
            denominator = int(ratio_match.group(2))
            evidence.append(ratio_text)

    if numerator is None or denominator is None:
        ordinal_match = re.search(
            r"\b(\d{1,3})(?:st|nd|rd|th)\s+(?:partnership|ownership|share|interest)\b",
            src,
            flags=re.IGNORECASE,
        )
        if ordinal_match:
            numerator = 1
            denominator = int(ordinal_match.group(1))
            evidence.append(ordinal_match.group(0))

    if numerator is None or denominator is None:
        percent_match = re.search(
            r"\b(\d{1,2}(?:\.\d+)?)\s*%\s*(?:ownership|share|interest)\b",
            src,
            flags=re.IGNORECASE,
        )
        if percent_match:
            percent_val = _float_from_number_text(percent_match.group(1))
            if percent_val is not None and 0 < percent_val < 100:
                share_percent = round(percent_val, 3)
                fraction = percent_val / 100.0
                reciprocal = 1.0 / fraction
                rounded_reciprocal = round(reciprocal)
                if abs(reciprocal - rounded_reciprocal) <= 0.01 and rounded_reciprocal >= 2:
                    numerator = 1
                    denominator = int(rounded_reciprocal)
                evidence.append(percent_match.group(0))

    money_matches = list(re.finditer(r"\$\s*([\d,]{2,9})\b", src))
    inferred_share_price: int | None = None
    if money_matches:
        target_idx = None
        if ratio_match:
            target_idx = ratio_match.start()
        elif evidence:
            token = evidence[0]
            token_idx = src.lower().find(token.lower())
            target_idx = token_idx if token_idx >= 0 else None
        if target_idx is not None:
            closest = min(money_matches, key=lambda m: abs(m.start() - target_idx))
            inferred_share_price = _int_from_number_text(closest.group(1))
        else:
            inferred_share_price = _int_from_number_text(money_matches[0].group(1))

    if inferred_share_price is None and isinstance(observed_price, (int, float)) and observed_price > 0:
        inferred_share_price = int(round(float(observed_price)))

    normalized_full_price: int | None = None
    if (
        inferred_share_price is not None
        and numerator is not None
        and denominator is not None
        and denominator > 0
        and numerator > 0
        and denominator > numerator
    ):
        normalized_full_price = int(round((float(inferred_share_price) * float(denominator)) / float(numerator)))

    strong_fractional_term = re.search(
        r"\b(?:fractional\s+ownership|fractional|partnership|co[\-\s]?ownership|ownership\s+interest|share\s+available|member(?:ship)?\s+interest)\b",
        src,
        flags=re.IGNORECASE,
    )
    has_explicit_fraction = numerator is not None and denominator is not None and denominator > 1

    payload["is_fractional"] = has_explicit_fraction
    payload["share_numerator"] = numerator
    payload["share_denominator"] = denominator
    payload["share_percent"] = share_percent
    payload["share_price"] = inferred_share_price
    payload["normalized_full_price"] = normalized_full_price
    payload["review_needed"] = bool(strong_fractional_term and not has_explicit_fraction)
    payload["evidence"] = evidence[:3]
    return payload


def parse_description(text: str, observed_price: int | float | None = None) -> dict[str, Any]:
    src = _normalize_text(text)
    times = extract_times(src)
    avionics_detailed = extract_avionics_detailed(src)
    avionics = extract_avionics(src)
    avionics_unresolved = extract_avionics_unresolved(src, avionics_detailed)
    mods = extract_mods_and_stcs(src)
    useful_load = extract_useful_load(src)
    fuel_capacity = extract_fuel_capacity(src)
    special_equipment = extract_special_equipment(src)
    pricing_context = extract_fractional_pricing(src, observed_price=observed_price)
    engine_model = extract_engine_model(src)
    cylinders_since_new = extract_cylinder_time_since_new(src)
    hours_since_iran = extract_hours_since_iran(src)
    last_annual_inspection = extract_last_annual_inspection(src)

    engine_payload = {
        "model": engine_model,
        "smoh": times.get("engine_smoh"),
        "tt": times.get("total_time"),
        "spoh": times.get("prop_spoh"),
        "stop": times.get("engine_stop"),
    }
    engine_payload = {k: v for k, v in engine_payload.items() if v is not None}

    maintenance_payload: dict[str, Any] = {}
    if cylinders_since_new is not None:
        maintenance_payload["cylinders_since_new_hours"] = cylinders_since_new
        times["cylinders_since_new_hours"] = cylinders_since_new
    if hours_since_iran is not None:
        maintenance_payload["hours_since_iran"] = hours_since_iran
        times["hours_since_iran"] = hours_since_iran
    if last_annual_inspection:
        maintenance_payload["last_annual_inspection"] = last_annual_inspection

    evidence_count = 0
    evidence_count += len(engine_payload)
    evidence_count += len(avionics_detailed)
    evidence_count += len(mods)
    evidence_count += 1 if useful_load is not None else 0
    evidence_count += 1 if fuel_capacity is not None else 0
    evidence_count += len(special_equipment)
    evidence_count += len(maintenance_payload)
    evidence_count += 1 if pricing_context.get("is_fractional") else 0
    confidence = round(min(1.0, 0.2 + evidence_count * 0.08), 2) if src else 0.0

    payload: dict[str, Any] = {
        "engine": engine_payload,
        "mods": mods,
        "avionics": avionics,
        "avionics_detailed": avionics_detailed,
        "avionics_unresolved": avionics_unresolved,
        "useful_load_lbs": useful_load,
        "fuel_capacity_gal": fuel_capacity,
        "special_equipment": special_equipment,
        "pricing_context": pricing_context,
        "maintenance": maintenance_payload,
        "confidence": confidence,
        "avionics_parser_version": PARSER_VERSION,
    }
    payload["times"] = times
    return payload

