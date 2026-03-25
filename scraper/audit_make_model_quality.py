"""
Phase 1: Make/model inventory + FAA cross-check + source attribution.

Writes JSON + Markdown summaries under scraper/data/identity/.

Usage:
  .venv312\\Scripts\\python.exe scraper\\audit_make_model_quality.py
  .venv312\\Scripts\\python.exe scraper\\audit_make_model_quality.py --limit-listings 5000
"""

from __future__ import annotations

import argparse
import json
import logging
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import Client, create_client

from enrich_faa import fetch_aircraft_ref_match, fetch_faa_match, get_supabase
from make_model_identity_lib import (
    apply_curated_rules,
    faa_identity_suggestion,
    load_rules,
    normalize_compare,
    rules_path,
    token_jaccard,
)
from registration_parser import normalize_us_n_number

load_dotenv()

log = logging.getLogger(__name__)
OUT_DIR = Path(__file__).resolve().parent / "data" / "identity"


def setup_logging(verbose: bool = False) -> None:
    logging.basicConfig(level=logging.DEBUG if verbose else logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


def normalize_source(row: dict[str, Any]) -> str:
    s = (row.get("source") or row.get("source_site") or "").strip().lower()
    return s or "unknown"


def iter_active_listings(supabase: Client, limit: int | None) -> list[dict[str, Any]]:
    page = 1000
    out: list[dict[str, Any]] = []
    start = 0
    while True:
        q = (
            supabase.table("aircraft_listings")
            .select(
                "id,make,model,source,source_site,n_number,serial_number,registration_scheme,is_active,year,title,faa_matched,identity_correction"
            )
            .eq("is_active", True)
            .order("id")
            .range(start, start + page - 1)
        )
        batch = q.execute().data or []
        out.extend(batch)
        if len(batch) < page:
            break
        start += page
        if limit is not None and len(out) >= limit:
            return out[:limit]
    return out[: limit or len(out)]


def run_audit(supabase: Client, *, limit_listings: int | None, rules_file: Path | None) -> dict[str, Any]:
    rules = load_rules(rules_file)
    rows = iter_active_listings(supabase, limit_listings)
    log.info("Loaded %s active listings", len(rows))

    make_counts: Counter[str] = Counter()
    make_lower_groups: dict[str, set[str]] = defaultdict(set)
    numeric_makes: Counter[str] = Counter()
    source_by_make: dict[str, Counter[str]] = defaultdict(Counter)

    faa_mismatch_samples: list[dict[str, Any]] = []
    curated_would_fix: list[dict[str, Any]] = []
    faa_would_fix: list[dict[str, Any]] = []

    for row in rows:
        mk = (row.get("make") or "").strip()
        md = (row.get("model") or "").strip()
        src = normalize_source(row)
        if mk:
            make_counts[mk] += 1
            make_lower_groups[mk.lower()].add(mk)
            source_by_make[mk][src] += 1
        if mk and mk.replace(" ", "").isdigit():
            numeric_makes[mk] += 1

        cr = apply_curated_rules(mk, md or None, rules)
        if cr:
            curated_would_fix.append(
                {
                    "id": row.get("id"),
                    "source": src,
                    "before": {"make": mk, "model": md},
                    "after": {"make": cr.make, "model": cr.model},
                    "rule": cr.rule_id,
                    "kind": cr.kind,
                }
            )

        scheme = str(row.get("registration_scheme") or "").strip().upper()
        if scheme and scheme != "US_N":
            continue
        n_raw = row.get("n_number")
        if not n_raw:
            continue
        nn = normalize_us_n_number(str(n_raw))
        if not nn:
            continue

        faa_row = fetch_faa_match(supabase, nn, serial_number=row.get("serial_number"))
        if not faa_row:
            continue
        code = faa_row.get("mfr_mdl_code") or faa_row.get("mfr_model_code")
        ref = fetch_aircraft_ref_match(supabase, str(code)) if code else None
        if not ref:
            continue
        faa_mfr = (ref.get("mfr_name") or "").strip()
        faa_mdl = (ref.get("model_name") or "").strip()
        if not faa_mfr or not faa_mdl:
            continue

        jm = token_jaccard(mk, faa_mfr)
        jd = token_jaccard(md, faa_mdl)
        if normalize_compare(mk) != normalize_compare(faa_mfr) or jd < 0.25:
            if len(faa_mismatch_samples) < 500:
                faa_mismatch_samples.append(
                    {
                        "id": row.get("id"),
                        "source": src,
                        "listing": {"make": mk, "model": md},
                        "faa": {"mfr_name": faa_mfr, "model_name": faa_mdl, "mfr_mdl_code": code},
                        "jaccard_make": round(jm, 3),
                        "jaccard_model": round(jd, 3),
                    }
                )

        sug = faa_identity_suggestion(mk, md or None, faa_mfr, faa_mdl, rules)
        if sug and (sug[0].lower() != mk.lower() or sug[1].lower() != (md or "").lower()):
            faa_would_fix.append(
                {
                    "id": row.get("id"),
                    "source": src,
                    "before": {"make": mk, "model": md},
                    "after": {"make": sug[0], "model": sug[1]},
                }
            )

    case_collision = {k: sorted(v) for k, v in make_lower_groups.items() if len(v) > 1}

    curated_by_source = Counter(str(x["source"]) for x in curated_would_fix)
    curated_by_kind = Counter(str(x["kind"]) for x in curated_would_fix)
    curated_top_rules = Counter(str(x["rule"]) for x in curated_would_fix).most_common(25)
    faa_fix_by_source = Counter(str(x["source"]) for x in faa_would_fix)

    bad_make_source_matrix: dict[str, dict[str, int]] = {}
    for mk, ctr in source_by_make.items():
        if len(mk.replace(" ", "")) <= 3 and mk.replace(" ", "").isdigit():
            bad_make_source_matrix[mk] = dict(ctr)
    for mk in numeric_makes:
        bad_make_source_matrix[mk] = dict(source_by_make[mk])

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "rules_file": str(rules_file or rules_path()),
        "listing_sample_limit": limit_listings,
        "active_listings_scanned": len(rows),
        "distinct_make_strings": len(make_counts),
        "distinct_make_casefold_groups": len(make_lower_groups),
        "case_collision_groups": dict(list(case_collision.items())[:200]),
        "case_collision_group_count": len(case_collision),
        "numeric_make_counts": dict(numeric_makes.most_common(50)),
        "top_makes": make_counts.most_common(80),
        "curated_rule_hits": len(curated_would_fix),
        "faa_suggestion_hits": len(faa_would_fix),
        "curated_fixes_by_source": dict(curated_by_source.most_common()),
        "curated_fixes_by_kind": dict(curated_by_kind.most_common()),
        "curated_top_rules": curated_top_rules,
        "faa_fixes_by_source": dict(faa_fix_by_source.most_common()),
        "faa_mismatch_sample_count": len(faa_mismatch_samples),
        "samples": {
            "faa_mismatches": faa_mismatch_samples[:120],
            "curated_would_fix": curated_would_fix[:200],
            "faa_would_fix": faa_would_fix[:200],
        },
        "source_attribution_numeric_makes": bad_make_source_matrix,
    }


def write_md(summary: dict[str, Any], path: Path) -> None:
    lines = [
        "# Make / model quality audit",
        "",
        f"- Generated: `{summary.get('generated_at')}`",
        f"- Active listings scanned: **{summary.get('active_listings_scanned')}**",
        f"- Distinct make strings: **{summary.get('distinct_make_strings')}**",
        f"- Case-collision groups (same make, different casing): **{summary.get('case_collision_group_count')}**",
        f"- Curated rule rows (would change): **{summary.get('curated_rule_hits')}**",
        f"- FAA suggestion rows (would change): **{summary.get('faa_suggestion_hits')}**",
        "",
        "## Curated-rule fixes by source (full row counts)",
        "",
        "Every source contributes bad make/model shapes — not just GlobalAir. "
        "The section below is the real attribution for **curated** corrections.",
        "",
    ]
    for src, cnt in sorted(
        (summary.get("curated_fixes_by_source") or {}).items(),
        key=lambda kv: (-kv[1], kv[0]),
    ):
        lines.append(f"- **{src}**: {cnt}")
    lines.extend(
        [
            "",
            "## Curated fixes by kind",
            "",
        ]
    )
    for kind, cnt in sorted(
        (summary.get("curated_fixes_by_kind") or {}).items(),
        key=lambda kv: (-kv[1], kv[0]),
    ):
        lines.append(f"- `{kind}`: {cnt}")
    lines.extend(["", "## Top curated rules (id / count)", ""])
    for rule_id, cnt in summary.get("curated_top_rules") or []:
        lines.append(f"- `{rule_id}`: {cnt}")
    lines.extend(
        [
            "",
            "## FAA auto-suggestion fixes by source (rows with US N-number + ACFTREF)",
            "",
        ]
    )
    for src, cnt in sorted(
        (summary.get("faa_fixes_by_source") or {}).items(),
        key=lambda kv: (-kv[1], kv[0]),
    ):
        lines.append(f"- **{src}**: {cnt}")
    lines.extend(
        [
            "",
            "## Digit-only / very short numeric makes → sources",
            "",
            "Narrow heuristic (make is all digits, length ≤ 3). "
            "Your `505` rows are here; this is **not** the full bad-source picture.",
            "",
        ]
    )
    src_map = summary.get("source_attribution_numeric_makes") or {}
    for mk, ctr in list(src_map.items())[:30]:
        lines.append(f"- `{mk}`: {ctr}")
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit listing make/model quality + FAA cross-check.")
    parser.add_argument("--limit-listings", type=int, default=None, help="Cap rows scanned (default: all active)")
    parser.add_argument("--rules", type=Path, default=None, help="Override make_model_rules.json path")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()
    setup_logging(args.verbose)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    supabase = get_supabase()
    summary = run_audit(supabase, limit_listings=args.limit_listings, rules_file=args.rules)
    json_path = OUT_DIR / "make_model_audit_latest.json"
    md_path = OUT_DIR / "make_model_audit_latest.md"
    json_path.write_text(json.dumps(summary, indent=2, ensure_ascii=True), encoding="utf-8")
    write_md(summary, md_path)
    log.info("Wrote %s and %s", json_path, md_path)


if __name__ == "__main__":
    main()
