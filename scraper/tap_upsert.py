from __future__ import annotations

from datetime import date
from typing import Any, Optional

from config import get_manufacturer_tier, normalize_manufacturer
from description_parser import parse_description
from schema import validate_listing
from scraper_base import safe_upsert_with_fallback


def upsert_tap_listings(supabase, listings) -> int:
    if not listings:
        return 0
    today_iso = date.today().isoformat()
    source_ids = [str(item.get("source_id")) for item in listings if item.get("source_id") is not None]
    unique_source_ids = list(dict.fromkeys(source_ids))
    existing_by_source_id: dict[str, dict] = {}
    for idx in range(0, len(unique_source_ids), 200):
        chunk = unique_source_ids[idx : idx + 200]
        if not chunk:
            continue
        existing = (
            supabase.table("aircraft_listings")
            .select("source_id,first_seen_date,price_asking,asking_price")
            .eq("source_site", "trade_a_plane")
            .in_("source_id", chunk)
            .execute()
        )
        for row in existing.data or []:
            sid = row.get("source_id")
            if sid is not None:
                existing_by_source_id[str(sid)] = row

    def _as_int(value) -> Optional[int]:
        try:
            if value is None or isinstance(value, bool):
                return None
            return int(float(value))
        except (TypeError, ValueError):
            return None

    rows = []
    observation_rows = []
    for listing in listings:
        parser_text = f"{listing.get('description') or ''} {listing.get('description_full') or ''}".strip()
        if parser_text:
            parsed_intel = parse_description(parser_text)
            listing["description_intelligence"] = parsed_intel
            parsed_engine_model = parsed_intel.get("engine", {}).get("model")
            existing_engine_model = listing.get("engine_model")
            existing_engine_model_text = str(existing_engine_model).strip() if existing_engine_model else ""
            if isinstance(parsed_engine_model, str) and (not existing_engine_model_text or len(existing_engine_model_text) > 120):
                listing["engine_model"] = parsed_engine_model
            parsed_smoh = parsed_intel.get("times", {}).get("engine_smoh")
            if listing.get("engine_time_since_overhaul") in (None, "", 0) and isinstance(parsed_smoh, int):
                listing["engine_time_since_overhaul"] = parsed_smoh
            if listing.get("time_since_overhaul") in (None, "", 0) and isinstance(parsed_smoh, int):
                listing["time_since_overhaul"] = parsed_smoh
            parsed_spoh = parsed_intel.get("times", {}).get("prop_spoh")
            if listing.get("time_since_prop_overhaul") in (None, "", 0) and isinstance(parsed_spoh, int):
                listing["time_since_prop_overhaul"] = parsed_spoh
            parsed_tt = parsed_intel.get("times", {}).get("total_time")
            if listing.get("total_time_airframe") in (None, "", 0) and isinstance(parsed_tt, int):
                listing["total_time_airframe"] = parsed_tt

        row, warnings = validate_listing(listing)
        if warnings:
            continue
        source_id = row.get("source_id")
        existing = existing_by_source_id.get(str(source_id)) if source_id is not None else None

        row["source"] = "trade_a_plane"
        row["source_site"] = "trade_a_plane"
        row["listing_source"] = "trade_a_plane"
        row["last_seen_date"] = today_iso
        row["is_active"] = True
        row["inactive_date"] = None

        normalized_make = normalize_manufacturer(str(row.get("make") or ""))
        if normalized_make:
            row["make"] = normalized_make
        manufacturer_tier = get_manufacturer_tier(row.get("make"))
        if manufacturer_tier is not None:
            row["manufacturer_tier"] = manufacturer_tier

        if existing is None:
            row["first_seen_date"] = today_iso
        else:
            previous_price = _as_int(existing.get("price_asking"))
            if previous_price is None:
                previous_price = _as_int(existing.get("asking_price"))
            current_price = _as_int(row.get("price_asking"))
            if current_price is None:
                current_price = _as_int(row.get("asking_price"))
            if previous_price is not None and current_price is not None and current_price < previous_price:
                row["price_reduced"] = True
                row["price_reduced_date"] = today_iso
                row["price_reduction_amount"] = previous_price - current_price

        rows.append(row)
        observation_rows.append(
            {
                "source_site": "trade_a_plane",
                "source_id": str(source_id),
                "observed_on": today_iso,
                "observed_at": f"{today_iso}T00:00:00Z",
                "asking_price": row.get("price_asking") if row.get("price_asking") is not None else row.get("asking_price"),
                "url": row.get("url"),
                "title": row.get("title"),
                "listing_fingerprint": row.get("listing_fingerprint"),
                "is_active": True,
            }
        )

    if not rows:
        return 0

    all_keys: set[str] = set()
    for row in rows:
        all_keys.update(row.keys())
    for row in rows:
        for key in all_keys:
            row.setdefault(key, None)

    conflict_attempts = [
        ("source_site,source_listing_id", ["source_site", "source_listing_id"]),
        ("source_site,source_id", ["source_site", "source_id"]),
    ]
    saved = 0
    for on_conflict, match_keys in conflict_attempts:
        saved = safe_upsert_with_fallback(
            supabase=supabase,
            table="aircraft_listings",
            rows=rows,
            on_conflict=on_conflict,
            fallback_match_keys=match_keys,
            logger=None,
        )
        if saved:
            break
    if saved == 0:
        for row in rows:
            row_saved = False
            for on_conflict, _ in conflict_attempts:
                try:
                    supabase.table("aircraft_listings").upsert(row, on_conflict=on_conflict).execute()
                    saved += 1
                    row_saved = True
                    break
                except Exception:
                    continue
            if not row_saved:
                continue

    if observation_rows:
        try:
            supabase.table("listing_observations").upsert(
                observation_rows, on_conflict="source_site,source_id,observed_on"
            ).execute()
        except Exception:
            pass
    return saved
