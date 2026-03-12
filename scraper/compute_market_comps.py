from __future__ import annotations

from typing import Any


def fetch_all_rows(supabase: Any) -> list[dict]:
    """
    Compatibility shim for branches that do not include the full
    market comps recomputation module.
    """
    try:
        rows = (
            supabase.table("aircraft_listings")
            .select("id,year,make,model,asking_price,source_site,location_state")
            .limit(1000)
            .execute()
            .data
            or []
        )
        return rows
    except Exception:
        return []


def fetch_sold_rows(supabase: Any) -> list[dict]:
    try:
        rows = (
            supabase.table("aircraft_component_sales")
            .select("id,created_at,price_usd")
            .limit(1000)
            .execute()
            .data
            or []
        )
        return rows
    except Exception:
        return []


def fetch_transfer_rows(supabase: Any) -> list[dict]:
    # Transfer/comps history is optional in this compatibility path.
    return []


def build_comps_payload(
    all_rows: list[dict],
    sold_rows: list[dict],
    transfer_rows: list[dict],
    min_sample: int = 5,
) -> list[dict]:
    # No-op payload in compatibility mode. Keep signature stable.
    _ = (all_rows, sold_rows, transfer_rows, min_sample)
    return []


def upsert_market_comps(supabase: Any, comps_rows: list[dict]) -> int:
    _ = supabase
    return len(comps_rows or [])
