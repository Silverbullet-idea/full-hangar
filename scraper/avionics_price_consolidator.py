from __future__ import annotations

import json
import re
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from config import AVIONICS_MANUFACTURER_ALIASES

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data" / "avionics"
PDF_DIR = DATA_DIR / "pdf_extracts"
INV_DIR = DATA_DIR / "inventory_extracts"
CATALOG_PATH = DATA_DIR / "avionics_master_catalog.json"
OUT_JSON = DATA_DIR / "consolidated_price_observations.json"
OUT_MD = DATA_DIR / "price_summary_report.md"
OUT_MEDIUM_QUEUE = DATA_DIR / "top_medium_confidence_candidates.json"
PROGRESS_PATH = ROOT / "avionics_expansion_progress.json"


def utcnow() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_progress() -> dict[str, Any]:
    if not PROGRESS_PATH.exists():
        return {}
    return json.loads(PROGRESS_PATH.read_text(encoding="utf-8"))


def write_progress(progress: dict[str, Any]) -> None:
    progress["last_updated"] = utcnow()
    PROGRESS_PATH.write_text(json.dumps(progress, indent=2), encoding="utf-8")


def norm_text(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(value.upper().strip().split())


def normalize_manufacturer(value: str | None) -> str:
    v = norm_text(value)
    return AVIONICS_MANUFACTURER_ALIASES.get(v, value or "Unknown")


def compact_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"[^A-Z0-9]", "", norm_text(value))


def canonicalize_model_token(token: str) -> str:
    t = norm_text(token).replace("S-TEC", "STEC")
    t = re.sub(r"\s+", " ", t).strip()
    m = re.match(
        r"^(GTN|GNS|GNC|GPSMAP|GPS|GNX|GTX|GFC|GMA|GDL|GI|GMC|IFD|KX|KY|KT|KMA|KI|KFC|KAP|KLN|KC|KA|KAS|KCS|KPA|KRA|KNS|NGT|PMA|STEC|EFD|MVP|ME|GA|AEROCRUZE)\s*[- ]?\s*([0-9]{2,4}[A-Z]{0,2})$",
        t,
        flags=re.I,
    )
    if m:
        return f"{m.group(1).upper()} {m.group(2).upper()}"
    t = re.sub(r"[-/]", " ", t)
    return norm_text(t)


def infer_manufacturer_from_title(title: str) -> str | None:
    if not title:
        return None
    t = norm_text(title)
    known = (
        "GARMIN",
        "AVIDYNE",
        "KING",
        "BENDIXKING",
        "BENDIX KING",
        "BENDIX/KING",
        "PS ENGINEERING",
        "L3HARRIS",
        "L3",
        "UAVIONIX",
        "ASPEN",
        "HONEYWELL",
        "COLLINS",
        "ARTEX",
        "ELECTRONICS INTERNATIONAL",
        "S-TEC",
        "STEC",
    )
    for prefix in known:
        if t.startswith(prefix):
            return prefix
    for marker in known:
        if f" {marker} " in f" {t} ":
            return marker
    return None


def extract_model_candidates(title: str) -> list[str]:
    if not title:
        return []
    t = " ".join(title.split())
    patterns = (
        r"\b(?:GTN|GNS|GNC|GPSMAP|GPS|GNX|GTX|GFC|GMA|GDL|GI|GMC|IFD|KX|KY|KT|KMA|KI|KFC|KAP|KLN|KC|KA|KAS|KCS|KPA|KRA|KNS|NGT|PMA|STEC|S-TEC|EFD|MVP|ME|GA|AEROCRUZE)\s*[- ]?\s*[0-9]{2,4}[A-Z]{0,2}\b",
        r"\bGNS[- ]?XLS\b",
    )
    out: list[str] = []
    seen: set[str] = set()
    for pat in patterns:
        for m in re.findall(pat, t, flags=re.I):
            token = canonicalize_model_token(m)
            if token and token not in seen:
                seen.add(token)
                out.append(token)
    return out


def infer_from_title(title: str) -> tuple[str | None, str | None]:
    if not title:
        return None, None
    t = " ".join(title.split())
    manufacturer = infer_manufacturer_from_title(t)
    candidates = extract_model_candidates(t)
    return manufacturer, (candidates[0] if candidates else None)


def parse_price(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).replace("$", "").replace(",", "").strip()
    try:
        return float(s)
    except Exception:
        return None


def normalize_listing_title(title: str, source_name: str) -> str:
    t = " ".join((title or "").split())
    if not t:
        return ""
    up = t.upper()

    # Collapse exact duplicated title tails seen in some Global rows.
    m = re.match(r"^(.{20,}?)\s+\1$", t, flags=re.I)
    if m:
        t = m.group(1).strip()
        up = t.upper()

    if source_name == "global_aircraft":
        # Remove tail-number style suffixes and noisy placeholders.
        t = re.sub(r"\s+-\s+(?:C|N|OO|5Y|VH|CF|G)-[A-Z0-9]{2,6}\b", "", t, flags=re.I)
        t = re.sub(r"\bI-?CODE\b", "", t, flags=re.I)
        t = re.sub(r"\bMISC\b", "", t, flags=re.I)
        t = re.sub(r"\s{2,}", " ", t).strip(" -")

    return t


def normalize_model_text(model: str, title: str, source_name: str) -> str:
    m = " ".join((model or "").split()).strip()
    if not m:
        return m
    # If model text is descriptive/noisy, prefer avionics token extraction.
    if source_name == "global_aircraft" and len(m) > 40:
        cands = extract_model_candidates(f"{m} {title}")
        if cands:
            return cands[0]
    return m


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    vals = sorted(values)
    k = (len(vals) - 1) * p
    f = int(k)
    c = min(f + 1, len(vals) - 1)
    if f == c:
        return float(vals[f])
    return float(vals[f] + (vals[c] - vals[f]) * (k - f))


def load_catalog() -> tuple[
    list[dict[str, Any]],
    dict[str, int],
    dict[tuple[str, str], int],
    dict[str, int],
    dict[int, str],
    list[tuple[str, int]],
    dict[str, int],
]:
    rows = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    by_canonical: dict[str, int] = {}
    by_mfr_model: dict[tuple[str, str], int] = {}
    by_alias: dict[str, int] = {}
    id_to_canonical: dict[int, str] = {}
    alias_pairs: list[tuple[str, int]] = []
    by_alias_compact: dict[str, int] = {}
    for idx, row in enumerate(rows, start=1):
        cid = int(row.get("id") or idx)
        canonical = norm_text(row.get("canonical_name"))
        if canonical:
            by_canonical[canonical] = cid
            id_to_canonical[cid] = str(row.get("canonical_name") or canonical)
            cc = compact_text(canonical)
            if cc:
                by_alias_compact[cc] = cid
        mfr = norm_text(row.get("manufacturer"))
        model = norm_text(row.get("model"))
        if mfr and model:
            by_mfr_model[(mfr, model)] = cid
            cm = compact_text(model)
            if cm:
                by_alias_compact[cm] = cid
        for alias in row.get("aliases") or []:
            a = norm_text(alias)
            if a:
                by_alias[a] = cid
                alias_pairs.append((a, cid))
                ac = compact_text(a)
                if ac:
                    by_alias_compact[ac] = cid
    alias_pairs = sorted(set(alias_pairs), key=lambda x: len(x[0]), reverse=True)
    return rows, by_canonical, by_mfr_model, by_alias, id_to_canonical, alias_pairs, by_alias_compact


def load_extracts() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for p in sorted(PDF_DIR.glob("*.json")):
        payload = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(payload, list):
            rows.extend([x for x in payload if isinstance(x, dict)])
    for p in sorted(INV_DIR.glob("*.json")):
        payload = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(payload, list):
            rows.extend([x for x in payload if isinstance(x, dict)])
    return rows


def is_high_confidence_short_alias(alias_norm: str) -> bool:
    # Allow short aliases like G5 or GI275, but avoid pure text/number fragments.
    if len(alias_norm) >= 5:
        return False
    return bool(re.search(r"[A-Z]", alias_norm) and re.search(r"[0-9]", alias_norm))


def alias_matches_title(alias_norm: str, title_norm: str, title_compact: str) -> bool:
    if len(alias_norm) >= 5:
        if alias_norm in title_norm:
            return True
        alias_compact = compact_text(alias_norm)
        return bool(alias_compact and alias_compact in title_compact)
    if not is_high_confidence_short_alias(alias_norm):
        return False
    # Strict token boundary for short aliases to reduce false positives.
    return re.search(rf"(?<![A-Z0-9]){re.escape(alias_norm)}(?![A-Z0-9])", title_norm) is not None


def confidence_rank(value: str | None) -> int:
    return {"none": 0, "low": 1, "medium": 2, "high": 3}.get((value or "none").lower(), 0)


def build_medium_confidence_queue(
    consolidated: list[dict[str, Any]],
    by_alias: dict[str, int],
    by_alias_compact: dict[str, int],
    id_to_canonical: dict[int, str],
    max_rows: int = 250,
) -> list[dict[str, Any]]:
    grouped: dict[tuple[int, str], dict[str, Any]] = {}

    for row in consolidated:
        if row.get("match_confidence") != "medium":
            continue
        unit_id = row.get("unit_id")
        if unit_id is None:
            continue
        try:
            unit_id_int = int(unit_id)
        except Exception:
            continue

        alias_text = " ".join(str(row.get("model") or "").split()).strip()
        if not alias_text:
            candidates = extract_model_candidates(str(row.get("normalized_title") or row.get("listing_title") or ""))
            alias_text = candidates[0] if candidates else ""
        alias_norm = norm_text(alias_text)
        if len(alias_norm) < 3:
            continue

        # Do not queue aliases that already map to this unit.
        if by_alias.get(alias_norm) == unit_id_int:
            continue
        alias_compact = compact_text(alias_norm)
        if alias_compact and by_alias_compact.get(alias_compact) == unit_id_int:
            continue

        k = (unit_id_int, alias_norm)
        if k not in grouped:
            grouped[k] = {
                "unit_id": unit_id_int,
                "canonical_name": id_to_canonical.get(unit_id_int) or row.get("canonical_name"),
                "alias_candidate": alias_text,
                "alias_norm": alias_norm,
                "observations": 0,
                "source_counts": Counter(),
                "match_reasons": Counter(),
                "sample_titles": [],
                "sample_prices": [],
            }
        g = grouped[k]
        g["observations"] += 1
        g["source_counts"][str(row.get("source_name") or "unknown")] += 1
        g["match_reasons"][str(row.get("match_reason") or "unknown")] += 1
        title = str(row.get("normalized_title") or row.get("listing_title") or "").strip()
        if title and title not in g["sample_titles"] and len(g["sample_titles"]) < 3:
            g["sample_titles"].append(title)
        price = row.get("observed_price")
        if isinstance(price, (int, float)) and len(g["sample_prices"]) < 5:
            g["sample_prices"].append(float(price))

    out: list[dict[str, Any]] = []

    reject_keywords = (
        "MANUAL",
        "GUIDE",
        "ADDENDUM",
        "KIT",
        "BUNDLE",
        "HARNESS",
        "CABLE",
        "BATTERY",
        "CHARGER",
        "MOUNT",
        "ANTENNA",
        "PROBE",
    )

    for _, g in grouped.items():
        alias_text = str(g["alias_candidate"] or "")
        alias_upper = alias_text.upper()
        suggested_action = "approve_alias"
        action_reason = "likely canonical token/variant alias"
        if any(k in alias_upper for k in reject_keywords):
            suggested_action = "reject_non_unit"
            action_reason = "looks like accessory/documentation rather than avionics unit"
        out.append(
            {
                "unit_id": g["unit_id"],
                "canonical_name": g["canonical_name"],
                "alias_candidate": alias_text,
                "alias_norm": g["alias_norm"],
                "observations": g["observations"],
                "source_counts": dict(g["source_counts"]),
                "match_reasons": dict(g["match_reasons"]),
                "suggested_action": suggested_action,
                "action_reason": action_reason,
                "sample_titles": g["sample_titles"],
                "sample_prices": g["sample_prices"],
            }
        )
    out.sort(key=lambda x: (int(x.get("observations", 0)), len(x.get("source_counts", {}))), reverse=True)
    return out[:max_rows]


def main() -> int:
    progress = load_progress()
    progress["phases"]["phase_4_price_consolidation"] = "in_progress"
    write_progress(progress)

    catalog, by_canonical, by_mfr_model, by_alias, id_to_canonical, alias_pairs, by_alias_compact = load_catalog()
    raw_rows = load_extracts()
    consolidated: list[dict[str, Any]] = []

    for row in raw_rows:
        source_name = row.get("source") or "unknown"
        source_type = "capability_list" if "capabilities" in source_name else "used_inventory"
        raw_title = (row.get("title") or "").strip()
        title = normalize_listing_title(raw_title, source_name)
        manufacturer = normalize_manufacturer(row.get("manufacturer"))
        model = normalize_model_text((row.get("model") or "").strip(), title, source_name)
        title_candidates: list[str] = []
        match_confidence = "none"
        match_reason = "unmatched"
        if title:
            inferred_mfr, inferred_model = infer_from_title(title)
            title_candidates = extract_model_candidates(title)
            if inferred_mfr and (not row.get("manufacturer") or manufacturer == "Unknown"):
                manufacturer = normalize_manufacturer(inferred_mfr)
            if inferred_model:
                model = inferred_model
        if not model and title:
            model = title
        canonical = f"{manufacturer} {model}".strip()
        canonical_norm = norm_text(canonical)
        model_norm = norm_text(model)
        mfr_norm = norm_text(manufacturer)
        unit_id = None
        if canonical_norm in by_canonical:
            unit_id = by_canonical[canonical_norm]
            match_confidence = "high"
            match_reason = "canonical_exact"
        elif (mfr_norm, model_norm) in by_mfr_model:
            unit_id = by_mfr_model[(mfr_norm, model_norm)]
            match_confidence = "high"
            match_reason = "manufacturer_model_exact"
        elif model_norm in by_alias:
            unit_id = by_alias[model_norm]
            match_confidence = "high"
            match_reason = "model_alias_exact"
        elif compact_text(model) in by_alias_compact:
            unit_id = by_alias_compact[compact_text(model)]
            match_confidence = "medium"
            match_reason = "model_alias_compact"
        if unit_id is None and title_candidates:
            for cand in title_candidates:
                cand_norm = norm_text(cand)
                if cand_norm in by_alias:
                    unit_id = by_alias[cand_norm]
                    model = cand
                    match_confidence = "medium"
                    match_reason = "title_token_alias_exact"
                    break
                cand_compact = compact_text(cand)
                if cand_compact in by_alias_compact:
                    unit_id = by_alias_compact[cand_compact]
                    model = cand
                    match_confidence = "medium"
                    match_reason = "title_token_alias_compact"
                    break
        if unit_id is None and title:
            title_norm = norm_text(title)
            title_compact = compact_text(title)
            for alias_norm, cid in alias_pairs:
                if alias_matches_title(alias_norm, title_norm, title_compact):
                    unit_id = cid
                    match_confidence = "low" if len(alias_norm) >= 5 else "medium"
                    match_reason = "title_alias_scan"
                    break
        observed_price = parse_price(row.get("price") or row.get("observed_price"))
        canonical_out = id_to_canonical.get(int(unit_id)) if unit_id is not None else None
        consolidated.append(
            {
                "unit_id": unit_id,
                "canonical_name": canonical_out or (canonical if model else row.get("canonical_name")),
                "manufacturer": manufacturer,
                "model": model or None,
                "part_number": row.get("part_number"),
                "condition": row.get("condition"),
                "observed_price": observed_price,
                "source_name": source_name,
                "source_type": source_type,
                "source_url": row.get("source_url") or row.get("listing_url"),
                "listing_title": raw_title,
                "normalized_title": title or raw_title,
                "raw_description": row.get("description"),
                "match_confidence": match_confidence,
                "match_reason": match_reason,
                "unmatched": unit_id is None,
            }
        )

    OUT_JSON.write_text(json.dumps(consolidated, indent=2), encoding="utf-8")

    medium_queue = build_medium_confidence_queue(consolidated, by_alias, by_alias_compact, id_to_canonical)
    OUT_MEDIUM_QUEUE.write_text(json.dumps(medium_queue, indent=2), encoding="utf-8")

    # Build markdown report
    by_unit: dict[str, list[dict[str, Any]]] = defaultdict(list)
    unmatched = Counter()
    for row in consolidated:
        if row["unmatched"]:
            unmatched[f"{row.get('manufacturer')} {row.get('model')}".strip()] += 1
            continue
        if row.get("observed_price") is None:
            continue
        by_unit[str(row["unit_id"])].append(row)

    lines: list[str] = ["# Avionics Price Summary Report", ""]
    conf_counts = Counter((x.get("match_confidence") or "none") for x in consolidated if x.get("observed_price") is not None)
    lines.append("## Match Confidence (Priced Rows)")
    lines.append("")
    for conf in ("high", "medium", "low", "none"):
        lines.append(f"- {conf}: {int(conf_counts.get(conf, 0))}")
    lines.append("")
    lines.append(f"Medium-confidence alias review queue: `{OUT_MEDIUM_QUEUE.as_posix()}` ({len(medium_queue)} candidates)")
    lines.append("")
    for unit_id, rows in sorted(by_unit.items(), key=lambda kv: len(kv[1]), reverse=True):
        if len(rows) < 2:
            continue
        prices = sorted(float(x["observed_price"]) for x in rows if x.get("observed_price") is not None)
        if not prices:
            continue
        counts = Counter(x["source_name"] for x in rows)
        title = rows[0].get("canonical_name") or f"Unit {unit_id}"
        lines.append(f"### {title}")
        lines.append(
            f"- Observations: {len(prices)} ("
            + ", ".join(f"{k}: {v}" for k, v in counts.items())
            + ")"
        )
        lines.append("- Prices: " + " / ".join(f"${p:,.0f}" for p in prices))
        lines.append(
            f"- P25: ${percentile(prices, 0.25):,.0f}  |  Median: ${statistics.median(prices):,.0f}  |  P75: ${percentile(prices, 0.75):,.0f}"
        )
        lines.append(f"- Recommended conservative anchor: ${percentile(prices, 0.25):,.0f} (P25)")
        lines.append("")

    lines.append("## Unmatched Records")
    lines.append("")
    for key, count in unmatched.most_common(100):
        if not key.strip():
            continue
        lines.append(f"- {key}: {count}")
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")

    progress["phases"]["phase_4_price_consolidation"] = "done"
    progress["notes"].append(f"Phase 4 complete: consolidated {len(consolidated)} rows.")
    write_progress(progress)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
