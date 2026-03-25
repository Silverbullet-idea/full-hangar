"""
Phase 3: Apply curated rules + conservative FAA identity suggestions to aircraft_listings.

Preserves first scraper values in make_original/model_original; stamps identity_correction JSON.

Usage:
  .venv312\\Scripts\\python.exe scraper\\backfill_make_model_identity.py --dry-run
  .venv312\\Scripts\\python.exe scraper\\backfill_make_model_identity.py --apply --limit 500
  .venv312\\Scripts\\python.exe scraper\\backfill_make_model_identity.py --apply --recompute-scores
"""

from __future__ import annotations

import argparse
import json
import logging
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from enrich_faa import fetch_aircraft_ref_match, fetch_faa_match, get_supabase
from make_model_identity_lib import (
    apply_curated_rules,
    build_listing_title,
    faa_identity_suggestion,
    load_rules,
    rules_path,
)
from registration_parser import normalize_us_n_number

load_dotenv()

log = logging.getLogger(__name__)


def setup_logging(verbose: bool = False) -> None:
    logging.basicConfig(level=logging.DEBUG if verbose else logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


def _parse_missing_columns(error: Exception) -> set[str]:
    import re

    msg = str(error).lower()
    found = set(re.findall(r"could not find the '([a-z0-9_]+)' column", msg))
    return found


def resolve_identity_update(
    row: dict[str, Any],
    supabase: Any,
    rules: dict[str, Any],
    prefer_faa_when_ambiguous: bool,
) -> tuple[dict[str, Any], str] | tuple[None, None]:
    """
    Returns (payload_slice, reason) where payload_slice includes make, model, title,
    identity fields; or (None, None) if no change.
    """
    mk = (row.get("make") or "").strip()
    md = (row.get("model") or "").strip()
    year = row.get("year")
    try:
        y_int = int(year) if year is not None and str(year).strip().isdigit() else None
    except Exception:
        y_int = None

    curated = apply_curated_rules(mk, md or None, rules)
    faa_payload: dict[str, Any] | None = None
    scheme = str(row.get("registration_scheme") or "").strip().upper()
    if (not scheme or scheme == "US_N") and row.get("n_number"):
        nn = normalize_us_n_number(str(row.get("n_number")))
        if nn:
            faa_row = fetch_faa_match(supabase, nn, serial_number=row.get("serial_number"))
            if faa_row:
                code = faa_row.get("mfr_mdl_code") or faa_row.get("mfr_model_code")
                ref = fetch_aircraft_ref_match(supabase, str(code)) if code else None
                if ref:
                    fm = (ref.get("mfr_name") or "").strip()
                    fmdl = (ref.get("model_name") or "").strip()
                    sug = faa_identity_suggestion(mk, md or None, fm, fmdl, rules)
                    if sug:
                        faa_payload = {
                            "make": sug[0],
                            "model": sug[1],
                            "source": "faa_ref",
                            "rule_id": "faa_identity_suggestion",
                            "faa_mfr_mdl_code": str(code) if code else None,
                            "faa_ref_make": fm,
                            "faa_ref_model": fmdl,
                        }

    chosen: dict[str, Any] | None = None
    reason = ""

    if curated:
        chosen = {
            "make": curated.make,
            "model": curated.model or "",
            "source": "curated_rule",
            "rule_id": curated.rule_id,
            "faa_mfr_mdl_code": None,
        }
        reason = curated.kind
        if faa_payload and prefer_faa_when_ambiguous:
            if curated.kind == "make_display_alias" and faa_payload["make"].lower() != curated.make.lower():
                chosen = faa_payload
                reason = "faa_over_alias"

    elif faa_payload:
        chosen = faa_payload
        reason = "faa_only"

    if not chosen:
        return None, None

    new_make = chosen["make"]
    new_model = (chosen.get("model") or "").strip()
    if new_make.lower() == mk.lower() and new_model.lower() == md.lower():
        return None, None

    title = build_listing_title(y_int, new_make, new_model or None)
    correction = {
        "version": 1,
        "source": chosen["source"],
        "rule_id": chosen.get("rule_id"),
        "faa_mfr_mdl_code": chosen.get("faa_mfr_mdl_code"),
        "before": {"make": mk, "model": md},
        "reason": reason,
        "corrected_at": datetime.now(timezone.utc).isoformat(),
    }

    update: dict[str, Any] = {
        "make": new_make,
        "model": new_model or None,
        "title": title,
        "identity_correction": correction,
        "identity_corrected_at": datetime.now(timezone.utc).isoformat(),
    }
    if chosen.get("faa_ref_make"):
        update["faa_ref_make"] = chosen["faa_ref_make"]
    if chosen.get("faa_ref_model"):
        update["faa_ref_model"] = chosen["faa_ref_model"]

    if row.get("make_original") in (None, ""):
        update["make_original"] = mk or None
    if row.get("model_original") in (None, ""):
        update["model_original"] = md or None

    return update, reason


def iter_listings(
    supabase: Any,
    *,
    limit: int | None,
    only_active: bool,
) -> list[dict[str, Any]]:
    page = 500
    out: list[dict[str, Any]] = []
    start = 0
    while True:
        q = (
            supabase.table("aircraft_listings")
            .select(
                "id,make,model,year,title,n_number,serial_number,registration_scheme,is_active,"
                "make_original,model_original,identity_correction,identity_corrected_at"
            )
            .order("id")
            .range(start, start + page - 1)
        )
        if only_active:
            q = q.eq("is_active", True)
        batch = q.execute().data or []
        out.extend(batch)
        if len(batch) < page:
            break
        start += page
        if limit is not None and len(out) >= limit:
            return out[:limit]
    return out[: limit or len(out)]


def run_backfill(
    *,
    dry_run: bool,
    apply: bool,
    limit: int | None,
    only_active: bool,
    skip_corrected: bool,
    prefer_faa: bool,
    rules_file: Path | None,
    recompute_scores: bool,
) -> None:
    rules = load_rules(rules_file)
    supabase = get_supabase()
    rows = iter_listings(supabase, limit=limit, only_active=only_active)
    log.info("Processing %s rows", len(rows))

    updated_ids: list[str] = []
    examined = 0
    for row in rows:
        examined += 1
        if skip_corrected and row.get("identity_corrected_at"):
            continue

        payload, reason = resolve_identity_update(row, supabase, rules, prefer_faa_when_ambiguous=prefer_faa)
        if not payload:
            continue

        lid = str(row.get("id") or "")
        if dry_run or not apply:
            log.info(
                "would_update id=%s reason=%s make %r -> %r model %r -> %r",
                lid,
                reason,
                row.get("make"),
                payload.get("make"),
                row.get("model"),
                payload.get("model"),
            )
            updated_ids.append(lid)
            continue

        retry = dict(payload)
        while retry:
            try:
                supabase.table("aircraft_listings").update(retry).eq("id", row["id"]).execute()
                log.info("updated id=%s reason=%s", lid, reason)
                updated_ids.append(lid)
                break
            except Exception as e:
                missing = _parse_missing_columns(e)
                if not missing:
                    log.exception("update failed id=%s", lid)
                    break
                for col in missing:
                    retry.pop(col, None)
                log.warning("retry without columns %s for id=%s", missing, lid)

    log.info("examined=%s updates=%s", examined, len(updated_ids))

    if recompute_scores and updated_ids and apply and not dry_run:
        py = Path(sys.executable)
        script = Path(__file__).resolve().parent / "backfill_scores.py"
        for lid in updated_ids:
            subprocess.run([str(py), str(script), "--id", lid], check=False)
        log.info("Queued score recomputation for %s ids", len(updated_ids))


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill make/model/title from rules + FAA.")
    parser.add_argument("--dry-run", action="store_true", help="Log intended updates only")
    parser.add_argument("--apply", action="store_true", help="Write updates")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--include-inactive", action="store_true", help="Also scan inactive rows")
    parser.add_argument("--no-skip-corrected", action="store_true", help="Re-process identity_corrected_at rows")
    parser.add_argument(
        "--prefer-faa-when-ambiguous",
        action="store_true",
        help="If both curated alias and FAA disagree, prefer FAA (default: curated wins)",
    )
    parser.add_argument("--rules", type=Path, default=None)
    parser.add_argument("--recompute-scores", action="store_true", help="Run backfill_scores.py --id per updated row")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()
    setup_logging(args.verbose)

    if not args.dry_run and not args.apply:
        log.error("Specify --dry-run or --apply")
        sys.exit(1)

    run_backfill(
        dry_run=args.dry_run,
        apply=args.apply,
        limit=args.limit,
        only_active=not args.include_inactive,
        skip_corrected=not args.no_skip_corrected,
        prefer_faa=args.prefer_faa_when_ambiguous,
        rules_file=args.rules,
        recompute_scores=args.recompute_scores,
    )


if __name__ == "__main__":
    main()
