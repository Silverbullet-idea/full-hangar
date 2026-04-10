"""
Second-pass backfill: set aircraft_type on rows where it is null using peer consensus
by normalized (make, model) from listings that already have aircraft_type.

Example: many rows already say Cessna / 152 -> single_engine_piston; a null row with the same
make/model can inherit that label when the peer vote is strong enough.

  .venv312\\Scripts\\python.exe scraper\\backfill_aircraft_type_peers.py --dry-run
  .venv312\\Scripts\\python.exe scraper\\backfill_aircraft_type_peers.py --apply

Guards (defaults): --min-samples 2 --min-ratio 0.75 (winner must be >= 75% of peer rows for that key).

Peer pool: active listings with non-null aircraft_type (all sources). Targets: null aircraft_type,
optionally restricted with --source-site (default: controller, globalair, trade_a_plane).
"""

from __future__ import annotations

import argparse
import logging
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from listing_category_infer import normalized_make_model_key
from scraper_base import get_supabase, setup_logging

log = logging.getLogger(__name__)

DEFAULT_BATCH = 800
DEFAULT_TARGET_SITES = ("controller", "globalair", "trade_a_plane")

# Never learn or emit placeholder / junk labels from peers.
_PEER_TYPE_BLOCKLIST = frozenset(
    {
        "unknown",
        "other",
        "n/a",
        "na",
        "none",
        "unspecified",
        "see listing",
        "tbd",
        "?",
    }
)


def _usable_peer_aircraft_type(value: object) -> bool:
    if value is None:
        return False
    s = str(value).strip()
    if not s:
        return False
    return s.lower() not in _PEER_TYPE_BLOCKLIST


def _build_consensus_map(
    supabase: Any,
    *,
    batch_size: int,
    min_samples: int,
    min_ratio: float,
) -> dict[tuple[str, str], str]:
    """Scan active typed listings; return make/model -> aircraft_type when vote is strong."""
    type_counts: dict[tuple[str, str], Counter[str]] = defaultdict(Counter)
    last_id: Any = None
    peer_rows = 0

    while True:
        q = (
            supabase.table("aircraft_listings")
            .select("id,make,model,aircraft_type")
            .eq("is_active", True)
            .not_.is_("aircraft_type", "null")
            .order("id")
            .limit(batch_size)
        )
        if last_id is not None:
            q = q.gt("id", last_id)
        resp = q.execute()
        rows = resp.data or []
        if not rows:
            break
        last_id = rows[-1].get("id")

        for row in rows:
            at = row.get("aircraft_type")
            if not _usable_peer_aircraft_type(at):
                continue
            key = normalized_make_model_key(row.get("make"), row.get("model"))
            if not key:
                continue
            type_counts[key][str(at).strip()] += 1
            peer_rows += 1

        if len(rows) < batch_size:
            break

    log.info("peer_pool rows_used=%s distinct_make_model_keys=%s", peer_rows, len(type_counts))

    consensus: dict[tuple[str, str], str] = {}
    dropped_low_n = 0
    dropped_low_ratio = 0
    dropped_bad_winner = 0

    for key, ctr in type_counts.items():
        total = sum(ctr.values())
        if total < min_samples:
            dropped_low_n += 1
            continue
        best_type, best_c = ctr.most_common(1)[0]
        if best_c / total < min_ratio:
            dropped_low_ratio += 1
            continue
        if not _usable_peer_aircraft_type(best_type):
            dropped_bad_winner += 1
            continue
        consensus[key] = best_type

    log.info(
        "consensus_keys=%s dropped_min_samples=%s dropped_low_ratio=%s dropped_bad_winner=%s",
        len(consensus),
        dropped_low_n,
        dropped_low_ratio,
        dropped_bad_winner,
    )
    return consensus


def run_peer_backfill(
    *,
    dry_run: bool,
    apply: bool,
    source_site: str | None,
    all_target_sources: bool,
    limit: int | None,
    batch_size: int,
    min_samples: int,
    min_ratio: float,
) -> None:
    supabase = get_supabase()
    site_filter = (source_site or "").strip().lower() or None
    if site_filter and not all_target_sources and site_filter not in DEFAULT_TARGET_SITES:
        raise SystemExit(f"--source-site must be one of: {', '.join(DEFAULT_TARGET_SITES)}")

    consensus = _build_consensus_map(
        supabase,
        batch_size=batch_size,
        min_samples=min_samples,
        min_ratio=min_ratio,
    )
    if not consensus:
        log.warning("No consensus keys built; nothing to do.")
        return

    scanned = 0
    inferred = 0
    updated = 0
    skipped_no_match = 0
    skipped_no_make_model = 0
    last_id: Any = None

    while True:
        if limit is not None and inferred >= limit:
            break
        q = supabase.table("aircraft_listings").select("id,make,model,aircraft_type,source_site")
        q = q.is_("aircraft_type", "null").order("id").limit(batch_size)
        if site_filter:
            q = q.eq("source_site", site_filter)
        elif not all_target_sources:
            q = q.in_("source_site", list(DEFAULT_TARGET_SITES))
        if last_id is not None:
            q = q.gt("id", last_id)
        resp = q.execute()
        rows = resp.data or []
        if not rows:
            break
        last_id = rows[-1].get("id")

        for row in rows:
            if limit is not None and inferred >= limit:
                break
            scanned += 1
            key = normalized_make_model_key(row.get("make"), row.get("model"))
            if not key:
                skipped_no_make_model += 1
                continue
            inferred_type = consensus.get(key)
            if not inferred_type or not _usable_peer_aircraft_type(inferred_type):
                skipped_no_match += 1
                continue

            inferred += 1
            if dry_run or not apply:
                log.info(
                    "would_set id=%s site=%s make/model=%s/%s -> %s",
                    row.get("id"),
                    row.get("source_site"),
                    row.get("make"),
                    row.get("model"),
                    inferred_type,
                )
                continue

            try:
                supabase.table("aircraft_listings").update({"aircraft_type": inferred_type}).eq("id", row["id"]).execute()
                updated += 1
            except Exception as exc:
                log.warning("update_failed id=%s: %s", row.get("id"), exc)

        if limit is not None and inferred >= limit:
            break
        if len(rows) < batch_size:
            break

    log.info(
        "done scanned=%s inferred=%s updated=%s skipped_no_match=%s skipped_no_make_model=%s dry_run=%s",
        scanned,
        inferred,
        updated,
        skipped_no_match,
        skipped_no_make_model,
        dry_run or not apply,
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Backfill aircraft_type from peer (make, model) consensus.",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--source-site",
        default="",
        help="Limit target null rows to one site (default: all of controller, globalair, trade_a_plane).",
    )
    parser.add_argument(
        "--all-target-sources",
        action="store_true",
        help="Target null rows from any source_site (not just the three bridge sites).",
    )
    parser.add_argument("--limit", type=int, default=None, help="Max rows to infer/update.")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH)
    parser.add_argument(
        "--min-samples",
        type=int,
        default=2,
        help="Min peer listings per make/model (default: 2).",
    )
    parser.add_argument(
        "--min-ratio",
        type=float,
        default=0.75,
        help="Winning aircraft_type must be at least this fraction of peer rows (default: 0.75).",
    )
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    setup_logging(verbose=args.verbose)
    if not args.apply and not args.dry_run:
        args.dry_run = True
        log.info("No --apply: running as --dry-run")

    run_peer_backfill(
        dry_run=args.dry_run,
        apply=args.apply,
        source_site=args.source_site or None,
        all_target_sources=args.all_target_sources,
        limit=args.limit,
        batch_size=max(100, args.batch_size),
        min_samples=max(1, args.min_samples),
        min_ratio=min(1.0, max(0.51, args.min_ratio)),
    )


if __name__ == "__main__":
    main()
