from __future__ import annotations

import argparse
import json
import re
import urllib.request
from collections import Counter
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup

DATA_DIR = Path(__file__).resolve().parent / "data" / "avionics"
FAA_ADSB_HTML = DATA_DIR / "faa_adsb_equipment.html"
OUTPUT_PATH = DATA_DIR / "avionics_master_catalog.json"
CURATED_FILES = [
    DATA_DIR / "garmin_seed.json",
    DATA_DIR / "avidyne_seed.json",
    DATA_DIR / "aspen_seed.json",
    DATA_DIR / "legacy_market_seed.json",
    DATA_DIR / "supplemental_seed.json",
]

FAA_ADSB_URL = "https://www.faa.gov/air_traffic/technology/equipadsb/installation/equipment"

MODEL_PREFIX_MANUFACTURER = {
    "GTN": "Garmin",
    "GNS": "Garmin",
    "GNC": "Garmin",
    "GPS": "Garmin",
    "GNX": "Garmin",
    "GDL": "Garmin",
    "GTX": "Garmin",
    "GMA": "Garmin",
    "GFC": "Garmin",
    "GDU": "Garmin",
    "GI": "Garmin",
    "AXP": "Avidyne",
    "IFD": "Avidyne",
    "ATX": "Aspen Avionics",
    "KGX": "BendixKing",
    "KT": "BendixKing",
    "KTX": "BendixKing",
    "KFC": "BendixKing",
    "KAP": "BendixKing",
    "KX": "BendixKing",
    "FDL": "FreeFlight",
    "TT": "Trig",
    "TN": "Trig",
    "NGT": "L3Harris",
    "ADS": "NavWorx",
}

ALLOWED_GA_PREFIXES = {
    "GTN",
    "GNS",
    "GNC",
    "GPS",
    "GNX",
    "GTX",
    "GDL",
    "GMA",
    "GFC",
    "GDU",
    "GI",
    "IFD",
    "AXP",
    "ATX",
    "KT",
    "KTX",
    "KGX",
    "KAP",
    "KFC",
    "KX",
    "FDL",
    "TT",
    "TN",
    "NGT",
    "ADS",
    "BXT",
    "MLB",
    "MST",
    "AEROCRUZE",
    "SYSTEM",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build local avionics catalog seed JSON")
    parser.add_argument("--output", default=str(OUTPUT_PATH), help="Output catalog JSON path")
    return parser.parse_args()


def normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def norm_key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (text or "").lower())


def clean_model_text(text: str) -> str:
    cleaned = re.sub(r"\(.*?\)", "", text)
    cleaned = cleaned.replace("TM", "").replace("™", "")
    cleaned = cleaned.replace("–", "-").replace("—", "-")
    cleaned = cleaned.replace(" w/ ", " with ")
    return normalize_space(cleaned)


def looks_like_model(token: str) -> bool:
    t = token.upper()
    return bool(re.search(r"[A-Z]", t) and re.search(r"\d", t))


def infer_manufacturer(model: str, fallback: str | None = None) -> str:
    normalized = normalize_space(model.upper()).replace(" -", "-").replace("- ", "-")
    prefix_match = re.match(r"([A-Z]{1,5})[- ]?\d", normalized)
    if prefix_match:
        prefix = prefix_match.group(1)
        if prefix in MODEL_PREFIX_MANUFACTURER:
            return MODEL_PREFIX_MANUFACTURER[prefix]
    return fallback or "Unknown"


def is_ga_avionics_token(token: str) -> bool:
    t = token.upper().strip()
    if not looks_like_model(t):
        return False
    if re.match(r"^[AB]\d{3,4}", t):
        return False
    if any(m in t for m in (" JAN ", " FEB ", " MAR ", " APR ", " MAY ", " JUN ", " JUL ", " AUG ", " SEP ", " OCT ", " NOV ", " DEC ")):
        return False
    if " TC " in f" {t} " or " STC " in f" {t} ":
        return False
    for prefix in ALLOWED_GA_PREFIXES:
        if t.startswith(prefix + " ") or t.startswith(prefix + "-") or t == prefix:
            return True
    return any(tag in t for tag in ("BEACON", "SKYTRAX", "AV-30", "PING200", "S-TEC"))


def infer_function_category(model: str) -> str:
    m = model.upper()
    if any(p in m for p in ("GTN", "GNS", "IFD", "GPS 175", "GNX 375")):
        return "GPS/NAV/COMM IFD"
    if any(p in m for p in ("GTX", "AXP", "ATX", "TAILBEACON", "SKYBEACON", "KT 74", "FDL", "ADS600")):
        return "Transponder ADS-B"
    if any(p in m for p in ("GFC", "KAP", "KFC", "S-TEC", "SYSTEM 55", "AEROCRUZE", "DFC")):
        return "Autopilot"
    if any(p in m for p in ("G3X", "G5", "GI 275", "EFD", "EVOLUTION", "ENTEGRA", "EX500", "EX600")):
        return "PFD/MFD"
    if any(p in m for p in ("GMA", "KMA")):
        return "Audio Panel"
    return "Avionics"


def infer_tso_refs(function_category: str, model: str) -> list[str]:
    m = model.upper()
    if "AUTOPILOT" in function_category.upper():
        return ["TSO-C9c"]
    if "AUDIO" in function_category.upper():
        return ["TSO-C50c"]
    if "PFD/MFD" in function_category.upper():
        return ["STC"]
    if "GPS/NAV/COMM" in function_category.upper():
        if "W" in m or "XI" in m or "IFD" in m or "GTN" in m or "GPS 175" in m:
            return ["TSO-C146e", "TSO-C145e"]
        return ["TSO-C129a"]
    if "ADS-B" in function_category.upper() or "TRANSPONDER" in function_category.upper():
        if "GDL" in m or "SKYBEACON" in m or "TAILBEACON" in m:
            return ["TSO-C154c"]
        return ["TSO-C112f", "TSO-C166c"]
    return []


def infer_legacy_vs_glass(model: str) -> str:
    m = model.upper()
    if any(p in m for p in ("GNS", "KAP", "KFC", "KX ", "SYSTEM 20", "SYSTEM 30", "SYSTEM 40", "SYSTEM 50")):
        return "legacy"
    if any(p in m for p in ("G3X", "G5", "GI 275", "GTN", "IFD", "EFD", "EVOLUTION", "GFC", "AEROCRUZE")):
        return "glass"
    return "hybrid"


def build_aliases(manufacturer: str, model: str) -> list[str]:
    aliases: list[str] = []
    model_clean = normalize_space(model)
    aliases.append(model_clean)
    aliases.append(f"{manufacturer} {model_clean}")

    compact = re.sub(r"[\s-]+", "", model_clean)
    aliases.append(compact)
    aliases.append(model_clean.replace(" ", "-"))
    aliases.append(model_clean.replace("-", " "))
    aliases.append(model_clean.upper())
    aliases.append(model_clean.lower())
    aliases.append(re.sub(r"([A-Za-z]+)(\d+)", r"\1 \2", model_clean))
    aliases.append(re.sub(r"(\d+)([A-Za-z]+)", r"\1 \2", model_clean))

    if "XI" in model_clean.upper():
        aliases.append(re.sub(r"(?i)XI", " Xi", model_clean))
        aliases.append(re.sub(r"(?i)\s+XI", "Xi", model_clean))

    num_suffix = re.search(r"\b(\d{2,4}[A-Z]{0,2})\b", model_clean.upper())
    if num_suffix:
        aliases.append(num_suffix.group(1))

    if model_clean.upper().startswith("GNS ") and "W" in model_clean.upper():
        n = re.search(r"\b(\d{3})W\b", model_clean.upper())
        if n:
            aliases.append(f"{n.group(1)}W")
            aliases.append(f"Garmin {n.group(1)} WAAS")

    dedup: list[str] = []
    seen: set[str] = set()
    for alias in aliases:
        a = normalize_space(alias)
        if len(a) < 3:
            continue
        key = a.lower()
        if key in seen:
            continue
        seen.add(key)
        dedup.append(a)
    if len(dedup) < 3:
        fallback = model_clean.replace(" ", "")
        if fallback and fallback.lower() not in seen:
            dedup.append(fallback)
    return dedup[:8]


def parse_model_tokens(text: str) -> list[str]:
    cleaned = clean_model_text(text)
    if not cleaned:
        return []
    cleaned = re.sub(r"\b(part|parts|numbers?|series|models?)\b", " ", cleaned, flags=re.I)
    cleaned = re.sub(r"\b(or|and|with|internal|interfaced to|only|all|requires?)\b", " ", cleaned, flags=re.I)
    parts = [normalize_space(p) for p in re.split(r"[,;]", cleaned) if p.strip()]

    out: list[str] = []
    for part in parts:
        candidates = [part]
        if "/" in part and re.search(r"[A-Za-z]", part):
            for split in part.split("/"):
                s = normalize_space(split)
                if s:
                    candidates.append(s)
        for cand in candidates:
            cand = re.sub(r"[^A-Za-z0-9\- ]+", " ", cand)
            cand = normalize_space(cand)
            if not looks_like_model(cand):
                continue
            if len(cand) > 36:
                continue
            out.append(cand)
    return out


def ensure_faa_adsb_file() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if FAA_ADSB_HTML.exists():
        return
    req = urllib.request.Request(FAA_ADSB_URL, headers={"User-Agent": "Mozilla/5.0"})
    data = urllib.request.urlopen(req, timeout=60).read()
    FAA_ADSB_HTML.write_bytes(data)


def parse_faa_adsb_units() -> list[dict[str, Any]]:
    ensure_faa_adsb_file()
    soup = BeautifulSoup(FAA_ADSB_HTML.read_text(encoding="utf-8", errors="ignore"), "html.parser")
    units: list[dict[str, Any]] = []

    for table in soup.find_all("table"):
        current_manufacturer = ""
        for row in table.find_all("tr"):
            header_row = row.find("th", string=re.compile(r"Manufacturer|Model", re.I))
            if header_row:
                continue

            ths = row.find_all("th")
            tds = row.find_all("td")
            if not ths and not tds:
                continue

            model_text = ""
            source_text = ""
            if ths and tds:
                th_text = clean_model_text(ths[0].get_text(" ", strip=True))
                if not looks_like_model(th_text):
                    current_manufacturer = th_text
                    model_text = tds[0].get_text(" ", strip=True) if tds else ""
                    source_text = tds[1].get_text(" ", strip=True) if len(tds) > 1 else ""
                else:
                    model_text = th_text
                    source_text = tds[0].get_text(" ", strip=True) if tds else ""
            else:
                model_text = tds[0].get_text(" ", strip=True) if tds else ""
                source_text = tds[1].get_text(" ", strip=True) if len(tds) > 1 else ""

            model_tokens = parse_model_tokens(model_text)
            source_tokens = parse_model_tokens(source_text)

            for token in model_tokens:
                if not is_ga_avionics_token(token):
                    continue
                manufacturer = infer_manufacturer(token, fallback=current_manufacturer or "Unknown")
                function_category = infer_function_category(token)
                units.append(
                    {
                        "manufacturer": manufacturer,
                        "model": token,
                        "function_category": function_category,
                        "tso_refs": infer_tso_refs(function_category, token),
                        "legacy_vs_glass": infer_legacy_vs_glass(token),
                        "priority_family": "piston_single",
                        "notes": "faa_adsb_certified_equipment_2021",
                    }
                )

            for token in source_tokens:
                if not is_ga_avionics_token(token):
                    continue
                manufacturer = infer_manufacturer(token)
                function_category = "GPS Position Source"
                units.append(
                    {
                        "manufacturer": manufacturer,
                        "model": token,
                        "function_category": function_category,
                        "tso_refs": ["TSO-C145e", "TSO-C146e"],
                        "legacy_vs_glass": infer_legacy_vs_glass(token),
                        "priority_family": "piston_single",
                        "notes": "faa_adsb_position_source_2021",
                    }
                )
    return units


def load_curated_units() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for path in CURATED_FILES:
        if not path.exists():
            continue
        rows.extend(json.loads(path.read_text(encoding="utf-8")))
    return rows


def finalize_row(row: dict[str, Any]) -> dict[str, Any]:
    manufacturer = normalize_space(str(row.get("manufacturer") or "Unknown"))
    model = normalize_space(str(row.get("model") or ""))
    function_category = normalize_space(str(row.get("function_category") or infer_function_category(model)))
    tso_refs = row.get("tso_refs") or infer_tso_refs(function_category, model)

    aliases = row.get("aliases") or build_aliases(manufacturer, model)
    if len(aliases) < 3:
        compact = re.sub(r"[\s-]+", "", model)
        maker_short = manufacturer.split()[0] if manufacturer else ""
        candidates = [
            compact,
            f"{manufacturer} {compact}".strip(),
            model.upper(),
            f"{maker_short}-{compact}".strip("-"),
        ]
        for cand in candidates:
            c = normalize_space(cand)
            if c and c.lower() not in {a.lower() for a in aliases}:
                aliases.append(c)
            if len(aliases) >= 3:
                break

    out = {
        "manufacturer": manufacturer,
        "model": model,
        "canonical_name": f"{manufacturer} {model}",
        "function_category": function_category,
        "tso_refs": tso_refs,
        "aliases": aliases[:8],
        "oem_msrp_usd": row.get("oem_msrp_usd", None),
        "msrp_source": row.get("msrp_source", ""),
        "market_estimate_usd": row.get("market_estimate_usd", None),
        "market_estimate_source": row.get("market_estimate_source", ""),
        "legacy_vs_glass": row.get("legacy_vs_glass", infer_legacy_vs_glass(model)),
        "priority_family": row.get("priority_family", "piston_single"),
        "notes": row.get("notes", ""),
    }
    return out


def dedupe_units(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    dedup: dict[str, dict[str, Any]] = {}
    for row in rows:
        final = finalize_row(row)
        key = norm_key(final["canonical_name"])
        existing = dedup.get(key)
        if not existing:
            dedup[key] = final
            continue

        # Prefer rows with explicit MSRP or market estimate and richer aliases.
        if existing.get("oem_msrp_usd") is None and final.get("oem_msrp_usd") is not None:
            dedup[key] = final
        elif len(final.get("aliases", [])) > len(existing.get("aliases", [])):
            merged = existing.copy()
            merged_aliases = existing["aliases"] + [a for a in final["aliases"] if norm_key(a) not in {norm_key(x) for x in existing["aliases"]}]
            merged["aliases"] = merged_aliases[:8]
            if not merged.get("notes") and final.get("notes"):
                merged["notes"] = final["notes"]
            dedup[key] = merged
    return sorted(dedup.values(), key=lambda x: (x["manufacturer"], x["model"]))


def main() -> int:
    args = parse_args()
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    faa_rows = parse_faa_adsb_units()
    curated_rows = load_curated_units()
    all_rows = faa_rows + curated_rows
    deduped = dedupe_units(all_rows)
    output.write_text(json.dumps(deduped, indent=2), encoding="utf-8")

    by_source = Counter(
        "curated" if row in curated_rows else "faa_adsb"
        for row in all_rows
    )
    print(f"Wrote {len(deduped)} units to {output}")
    print(f"Raw rows -> FAA: {by_source['faa_adsb']}, curated: {by_source['curated']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
