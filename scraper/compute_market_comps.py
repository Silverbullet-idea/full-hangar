"""
Recompute pre-aggregated rows in `market_comps` from active `aircraft_listings`.

Used as a fallback tier when live per-listing comp pools are thin; see
`core/intelligence/aircraft_intelligence._get_market_comps` (columns:
sample_size, median_price, median_smoh, pct_with_glass).

Usage:
  .venv312\\Scripts\\python.exe scraper\\compute_market_comps.py
  .venv312\\Scripts\\python.exe scraper\\compute_market_comps.py --min-sample 5 --page-size 1000
"""

from __future__ import annotations

import argparse
import os
import statistics
import sys
from collections import Counter
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

_ROOT = Path(__file__).resolve().parent
if _ROOT.name == "scraper":
    sys.path.insert(0, str(_ROOT.parent))

from core.intelligence.us_location import parse_us_state_from_listing_fields

PAGE_DEFAULT = 1000


def _get_supabase():
    from supabase import create_client

    load_dotenv(Path(__file__).resolve().parent / ".env")
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise EnvironmentError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in scraper/.env")
    return create_client(url, key)


def _effective_price(row: dict) -> float | None:
    price = row.get("asking_price")
    if price is None:
        price = row.get("price_asking")
    try:
        p = float(price)
    except (TypeError, ValueError):
        return None
    if p <= 0:
        return None
    try:
        d = float(row.get("deferred_total") or 0)
    except (TypeError, ValueError):
        d = 0.0
    if d < 0:
        d = 0.0
    return p + d


def _smoh(row: dict) -> float | None:
    for key in ("engine_time_since_overhaul", "time_since_overhaul"):
        v = row.get(key)
        if v is None:
            continue
        try:
            n = float(v)
        except (TypeError, ValueError):
            continue
        if n > 0:
            return n
    return None


def _glass_flag(row: dict) -> bool | None:
    g = row.get("has_glass_cockpit")
    if g is True:
        return True
    if g is False:
        return False
    av = row.get("avionics_score")
    try:
        a = float(av)
    except (TypeError, ValueError):
        return None
    return a >= 72.0


def fetch_all_rows(supabase: Any, *, page_size: int = PAGE_DEFAULT) -> list[dict]:
    """All active listings with fields needed for comp aggregates."""
    candidates = (
        "make,model,asking_price,price_asking,deferred_total,location_raw,state,"
        "engine_time_since_overhaul,time_since_overhaul,has_glass_cockpit,avionics_score,is_active",
        "make,model,asking_price,price_asking,deferred_total,"
        "engine_time_since_overhaul,time_since_overhaul,has_glass_cockpit,avionics_score,is_active",
        "make,model,asking_price,price_asking,deferred_total,engine_time_since_overhaul,time_since_overhaul,is_active",
    )
    select_cols = candidates[0]
    candidate_idx = 0
    rows: list[dict] = []
    offset = 0
    while True:
        try:
            page = (
                supabase.table("aircraft_listings")
                .select(select_cols)
                .eq("is_active", True)
                .order("id")
                .range(offset, offset + page_size - 1)
                .execute()
                .data
                or []
            )
        except Exception as exc:
            if "column" in str(exc).lower() and candidate_idx + 1 < len(candidates):
                candidate_idx += 1
                select_cols = candidates[candidate_idx]
                offset = 0
                rows = []
                continue
            raise
        if not page:
            break
        rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size
    return rows


def fetch_sold_rows(supabase: Any, *, limit: int = 5000) -> list[dict]:
    """Optional aircraft/component sold observations (reserved for future weighting)."""
    try:
        return (
            supabase.table("aircraft_component_sales")
            .select("id,created_at,price_usd")
            .limit(limit)
            .execute()
            .data
            or []
        )
    except Exception:
        return []


def fetch_transfer_rows(supabase: Any) -> list[dict]:
    return []


def _median(nums: list[float]) -> float | None:
    if not nums:
        return None
    return float(statistics.median(nums))


def build_comps_payload(
    all_rows: list[dict],
    sold_rows: list[dict],
    transfer_rows: list[dict],
    min_sample: int = 5,
) -> list[dict]:
    _ = (sold_rows, transfer_rows)
    buckets: dict[tuple[str, str], dict[str, Any]] = {}
    for row in all_rows:
        mk = str(row.get("make") or "").strip()
        md = str(row.get("model") or "").strip()
        if not mk or not md:
            continue
        key = (mk.casefold(), md.casefold())
        eff = _effective_price(row)
        if eff is None:
            continue
        if key not in buckets:
            buckets[key] = {
                "make_keys": Counter(),
                "model_keys": Counter(),
                "prices": [],
                "smoh": [],
                "glass_yes": 0,
                "glass_no": 0,
            }
        b = buckets[key]
        b["make_keys"][mk] += 1
        b["model_keys"][md] += 1
        b["prices"].append(eff)
        smoh = _smoh(row)
        if smoh is not None:
            b["smoh"].append(smoh)
        gf = _glass_flag(row)
        if gf is True:
            b["glass_yes"] += 1
        elif gf is False:
            b["glass_no"] += 1

    out: list[dict] = []
    for key, b in buckets.items():
        n = len(b["prices"])
        if n < min_sample:
            continue
        make_canon = b["make_keys"].most_common(1)[0][0]
        model_canon = b["model_keys"].most_common(1)[0][0]
        prices = sorted(b["prices"])
        median_price = _median(list(prices))
        median_smoh = _median(b["smoh"]) if len(b["smoh"]) >= max(3, min_sample // 2) else None
        glass_den = b["glass_yes"] + b["glass_no"]
        pct_glass = (b["glass_yes"] / glass_den) if glass_den else None
        row_out: dict[str, Any] = {
            "make": make_canon,
            "model": model_canon,
            "sample_size": n,
            "median_price": round(median_price, 2) if median_price is not None else None,
            "median_smoh": int(round(median_smoh)) if median_smoh is not None else None,
            "pct_with_glass": round(pct_glass, 4) if pct_glass is not None else None,
        }
        out.append(row_out)
    out.sort(key=lambda r: (-(r.get("sample_size") or 0), r.get("make") or "", r.get("model") or ""))
    return out


def build_regional_comps_payload(
    all_rows: list[dict],
    *,
    min_sample: int = 3,
) -> list[dict]:
    """
    Median effective price per (make, model, US state) for regional_price_index.
    State comes from `state` column or parsed `location_raw`; rows without a US state are skipped.
    """
    buckets: dict[tuple[str, str, str], dict[str, Any]] = {}
    for row in all_rows:
        mk = str(row.get("make") or "").strip()
        md = str(row.get("model") or "").strip()
        if not mk or not md:
            continue
        st = parse_us_state_from_listing_fields(state=row.get("state"), location_raw=row.get("location_raw"))
        if not st:
            continue
        eff = _effective_price(row)
        if eff is None:
            continue
        key = (mk.casefold(), md.casefold(), st)
        if key not in buckets:
            buckets[key] = {
                "make_keys": Counter(),
                "model_keys": Counter(),
                "prices": [],
            }
        b = buckets[key]
        b["make_keys"][mk] += 1
        b["model_keys"][md] += 1
        b["prices"].append(eff)

    out: list[dict] = []
    for key, b in buckets.items():
        n = len(b["prices"])
        if n < min_sample:
            continue
        _, _, state_code = key
        make_canon = b["make_keys"].most_common(1)[0][0]
        model_canon = b["model_keys"].most_common(1)[0][0]
        prices = sorted(b["prices"])
        median_price = _median(list(prices))
        out.append(
            {
                "make": make_canon,
                "model": model_canon,
                "state": state_code,
                "sample_size": n,
                "median_price": round(median_price, 2) if median_price is not None else None,
            }
        )
    out.sort(
        key=lambda r: (
            -(r.get("sample_size") or 0),
            r.get("make") or "",
            r.get("model") or "",
            r.get("state") or "",
        )
    )
    return out


def upsert_market_comps(supabase: Any, comps_rows: list[dict]) -> int:
    if not comps_rows:
        return 0
    saved = 0
    batch_size = 100
    for i in range(0, len(comps_rows), batch_size):
        chunk = comps_rows[i : i + batch_size]
        try:
            supabase.table("market_comps").upsert(chunk, on_conflict="make,model").execute()
            saved += len(chunk)
        except Exception as exc:
            # Some projects use a different unique constraint name — try without on_conflict.
            if "conflict" in str(exc).lower() or "constraint" in str(exc).lower():
                for row in chunk:
                    try:
                        supabase.table("market_comps").upsert(row).execute()
                        saved += 1
                    except Exception:
                        pass
            else:
                raise
    return saved


def upsert_market_comps_regional(supabase: Any, regional_rows: list[dict]) -> int:
    if not regional_rows:
        return 0
    saved = 0
    batch_size = 100
    for i in range(0, len(regional_rows), batch_size):
        chunk = regional_rows[i : i + batch_size]
        try:
            supabase.table("market_comps_regional").upsert(chunk, on_conflict="make,model,state").execute()
            saved += len(chunk)
        except Exception as exc:
            if "conflict" in str(exc).lower() or "constraint" in str(exc).lower():
                for row in chunk:
                    try:
                        supabase.table("market_comps_regional").upsert(row).execute()
                        saved += 1
                    except Exception:
                        pass
            else:
                raise
    return saved


def main() -> None:
    parser = argparse.ArgumentParser(description="Recompute market_comps from aircraft_listings")
    parser.add_argument("--min-sample", type=int, default=5)
    parser.add_argument(
        "--min-sample-regional",
        type=int,
        default=3,
        help="Minimum listings per make/model/state bucket for market_comps_regional",
    )
    parser.add_argument("--page-size", type=int, default=PAGE_DEFAULT)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    supabase = _get_supabase()
    all_rows = fetch_all_rows(supabase, page_size=args.page_size)
    sold_rows = fetch_sold_rows(supabase)
    transfer_rows = fetch_transfer_rows(supabase)
    comps_rows = build_comps_payload(all_rows, sold_rows, transfer_rows, min_sample=args.min_sample)
    regional_rows = build_regional_comps_payload(all_rows, min_sample=args.min_sample_regional)
    print(
        f"computed_groups={len(comps_rows)} regional_groups={len(regional_rows)} listings_scanned={len(all_rows)}"
    )
    if args.dry_run:
        print("dry-run: no upsert")
        return
    upserted = upsert_market_comps(supabase, comps_rows)
    upserted_regional = upsert_market_comps_regional(supabase, regional_rows)
    print(f"upserted={upserted} regional_upserted={upserted_regional}")


if __name__ == "__main__":
    main()
