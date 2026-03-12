from __future__ import annotations

import json
import math
import os
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import create_client

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data" / "avionics"
CATALOG_PATH = DATA_DIR / "avionics_master_catalog.json"
CONSOLIDATED_PATH = DATA_DIR / "consolidated_price_observations.json"
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


def get_client():
    load_dotenv(ROOT / ".env")
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Missing Supabase credentials in scraper/.env.")
    return create_client(url, key)


def percentile(vals: list[float], p: float) -> float:
    if not vals:
        return 0.0
    arr = sorted(vals)
    k = (len(arr) - 1) * p
    f = int(math.floor(k))
    c = int(math.ceil(k))
    if f == c:
        return float(arr[f])
    return float(arr[f] + (arr[c] - arr[f]) * (k - f))


def confidence_rank(value: str | None) -> int:
    return {"none": 0, "low": 1, "medium": 2, "high": 3}.get((value or "none").lower(), 0)


def normalize_condition_bucket(value: str | None) -> str:
    t = str(value or "").strip().lower()
    if any(k in t for k in ("core", "as-is", "as is", "damaged", "parts")):
        return "core"
    if any(k in t for k in ("new", "factory", "nos")):
        return "new"
    return "used"


def ensure_units_and_aliases(client, catalog_rows: list[dict[str, Any]]) -> tuple[dict[str, int], dict[int, int], int, int]:
    existing = client.table("avionics_units").select("id,canonical_name").execute().data or []
    id_by_canonical = {str(x.get("canonical_name")): int(x["id"]) for x in existing if x.get("canonical_name") and x.get("id")}
    catalog_id_to_db_id: dict[int, int] = {}
    new_units = 0
    new_aliases = 0

    for idx, row in enumerate(catalog_rows, start=1):
        canonical = row.get("canonical_name")
        if not canonical:
            continue
        unit_id = id_by_canonical.get(canonical)
        if not unit_id:
            payload = {
                "manufacturer": row.get("manufacturer"),
                "model": row.get("model"),
                "canonical_name": canonical,
                "function_category": row.get("function_category"),
                "legacy_vs_glass": row.get("legacy_vs_glass"),
                "priority_family": row.get("priority_family"),
                "is_active": True,
            }
            try:
                created = client.table("avionics_units").insert(payload).execute().data or []
                if created:
                    unit_id = int(created[0]["id"])
                    id_by_canonical[canonical] = unit_id
                    new_units += 1
            except Exception:
                # Handle uniqueness collisions on (manufacturer, model) gracefully.
                existing_match = (
                    client.table("avionics_units")
                    .select("id")
                    .eq("manufacturer", row.get("manufacturer"))
                    .eq("model", row.get("model"))
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
                if existing_match:
                    unit_id = int(existing_match[0]["id"])
                    id_by_canonical[canonical] = unit_id
        if not unit_id:
            continue
        catalog_key = int(row.get("id") or idx)
        catalog_id_to_db_id[catalog_key] = int(unit_id)
        aliases = row.get("aliases") or []
        for alias in aliases:
            alias_norm = "".join(ch.lower() for ch in str(alias) if ch.isalnum())
            if not alias_norm:
                continue
            payload = {
                "unit_id": unit_id,
                "alias_text": alias,
                "alias_norm": alias_norm,
                "alias_source": "listing",
                "confidence": 0.85,
            }
            try:
                # Try insert; ignore duplicates.
                client.table("avionics_aliases").insert(payload).execute()
                new_aliases += 1
            except Exception:
                pass
    return id_by_canonical, catalog_id_to_db_id, new_units, new_aliases


def ingest_observations(
    client,
    rows: list[dict[str, Any]],
    id_by_canonical: dict[str, int],
    catalog_id_to_db_id: dict[int, int],
) -> tuple[int, int]:
    inserted = 0
    skipped_low_conf = 0
    min_conf = os.getenv("AVIONICS_INGEST_MIN_CONFIDENCE", "high").strip().lower() or "high"
    min_rank = confidence_rank(min_conf)
    existing_rows = (
        client.table("avionics_price_observations")
        .select("unit_id,part_number,source_name,source_url")
        .execute()
        .data
        or []
    )
    existing_keys = {
        (
            str(r.get("unit_id") or ""),
            str(r.get("part_number") or ""),
            str(r.get("source_name") or ""),
            str(r.get("source_url") or ""),
        )
        for r in existing_rows
    }
    for row in rows:
        canonical = row.get("canonical_name")
        unit_id = id_by_canonical.get(canonical) if canonical else None
        if not unit_id:
            raw_unit_id = row.get("unit_id")
            if raw_unit_id is not None:
                try:
                    unit_id = catalog_id_to_db_id.get(int(raw_unit_id)) or raw_unit_id
                except Exception:
                    unit_id = raw_unit_id
        conf = str(row.get("match_confidence") or "none").lower()
        if unit_id and confidence_rank(conf) < min_rank:
            skipped_low_conf += 1
            continue
        payload = {
            "unit_id": unit_id,
            "canonical_name": row.get("canonical_name"),
            "manufacturer": row.get("manufacturer"),
            "model": row.get("model"),
            "part_number": row.get("part_number"),
            "observed_price": row.get("observed_price"),
            "currency": "USD",
            "condition": row.get("condition"),
            "source_name": row.get("source_name"),
            "source_url": row.get("source_url"),
            "source_type": row.get("source_type"),
            "listing_title": row.get("listing_title"),
            "raw_description": row.get("raw_description"),
            "notes": f"match_confidence={conf};match_reason={row.get('match_reason') or 'unknown'}",
        }
        try:
            key = (
                str(unit_id or ""),
                str(row.get("part_number") or ""),
                str(row.get("source_name") or ""),
                str(row.get("source_url") or ""),
            )
            if key in existing_keys:
                continue
            client.table("avionics_price_observations").insert(payload).execute()
            existing_keys.add(key)
            inserted += 1
        except Exception:
            # If migration was not applied yet, the table insert can fail; keep going.
            continue
    return inserted, skipped_low_conf


def recompute_market_values(client) -> int:
    obs = (
        client.table("avionics_price_observations")
        .select("unit_id,observed_price,condition")
        .eq("is_active", True)
        .execute()
        .data
        or []
    )
    by_unit: dict[int, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for row in obs:
        unit_id = row.get("unit_id")
        price = row.get("observed_price")
        if not unit_id or price is None:
            continue
        val = float(price)
        if 0 < val < 500000:
            bucket = normalize_condition_bucket(row.get("condition"))
            by_unit[int(unit_id)][bucket].append(val)

    updated = 0
    for unit_id, buckets in by_unit.items():
        used_prices = buckets.get("used", [])
        new_prices = buckets.get("new", [])
        core_prices = buckets.get("core", [])
        non_core = used_prices + new_prices
        if len(used_prices) >= 2:
            prices = used_prices
            basis = "market_p25_used"
        elif len(new_prices) >= 2:
            prices = new_prices
            basis = "market_p25_new"
        elif len(non_core) >= 2:
            prices = non_core
            basis = "market_p25_non_core"
        else:
            prices = non_core + core_prices
            basis = "market_p25_all"
        if not prices:
            continue
        sample_count = len(prices)
        payload = {
            "unit_id": unit_id,
            "aircraft_segment": "piston_single",
            "sample_count": sample_count,
            "price_min": min(prices),
            "price_p25": percentile(prices, 0.25),
            "price_median": percentile(prices, 0.50),
            "price_p75": percentile(prices, 0.75),
            "price_max": max(prices),
            "valuation_basis": basis,
            "confidence_score": min(0.9, sample_count * 0.15),
            "computed_at": utcnow(),
        }
        try:
            client.table("avionics_market_values").upsert(payload, on_conflict="unit_id,aircraft_segment").execute()
            updated += 1
        except Exception:
            continue
    return updated


def main() -> int:
    progress = load_progress()
    progress["phases"]["phase_7_supabase_ingest"] = "in_progress"
    write_progress(progress)

    client = get_client()
    catalog_rows = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    consolidated_rows = json.loads(CONSOLIDATED_PATH.read_text(encoding="utf-8"))

    id_by_canonical, catalog_id_to_db_id, new_units, new_aliases = ensure_units_and_aliases(client, catalog_rows)
    inserted_prices = 0
    skipped_low_conf = 0
    updated_market_values = 0
    table_ready = True
    try:
        client.table("avionics_price_observations").select("id").limit(1).execute()
    except Exception:
        table_ready = False

    if table_ready:
        inserted_prices, skipped_low_conf = ingest_observations(client, consolidated_rows, id_by_canonical, catalog_id_to_db_id)
        updated_market_values = recompute_market_values(client)
    else:
        progress["notes"].append(
            "Phase 7 note: avionics_price_observations table not found; apply migration 20260311000054 before rerunning ingest."
        )

    progress["stats"]["new_units_added_to_catalog"] = int(progress["stats"].get("new_units_added_to_catalog", 0)) + new_units
    progress["stats"]["aliases_added"] = int(progress["stats"].get("aliases_added", 0)) + new_aliases
    progress["stats"]["price_observations_added"] = int(progress["stats"].get("price_observations_added", 0)) + inserted_prices
    progress["stats"]["price_observations_skipped_low_conf"] = int(
        progress["stats"].get("price_observations_skipped_low_conf", 0)
    ) + skipped_low_conf
    progress["phases"]["phase_7_supabase_ingest"] = "done" if table_ready else "skipped"
    progress["notes"].append(
        f"Phase 7 complete: units+{new_units}, aliases+{new_aliases}, price_obs+{inserted_prices}, "
        f"skipped_low_conf={skipped_low_conf}, market_values_updated={updated_market_values}."
    )
    write_progress(progress)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
