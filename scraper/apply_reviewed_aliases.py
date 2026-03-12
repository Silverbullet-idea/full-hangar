from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data" / "avionics"
QUEUE_PATH = DATA_DIR / "top_medium_confidence_candidates.json"
REVIEW_PATH = DATA_DIR / "top_medium_confidence_reviewed.json"
CATALOG_PATH = DATA_DIR / "avionics_master_catalog.json"
REPORT_PATH = DATA_DIR / "top_medium_confidence_apply_report.json"


def utcnow() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def norm_text(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(str(value).upper().strip().split())


def compact_text(value: str | None) -> str:
    return re.sub(r"[^A-Z0-9]", "", norm_text(value))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Apply reviewed medium-confidence alias candidates to avionics catalog.")
    parser.add_argument("--queue", default=str(QUEUE_PATH), help="Input queue JSON from consolidator.")
    parser.add_argument("--review", default=str(REVIEW_PATH), help="Reviewer decisions JSON.")
    parser.add_argument("--catalog", default=str(CATALOG_PATH), help="Master catalog JSON to update.")
    parser.add_argument("--report", default=str(REPORT_PATH), help="Apply report output JSON.")
    parser.add_argument("--init", action="store_true", help="Initialize review file from queue if missing.")
    parser.add_argument("--apply", action="store_true", help="Apply reviewed decisions to catalog.")
    parser.add_argument(
        "--approve-suggested",
        action="store_true",
        help="Auto-set reviewer_action=approve_alias for rows suggested as approve_alias and currently pending.",
    )
    return parser.parse_args()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def init_review_file(queue_rows: list[dict[str, Any]], review_path: Path) -> list[dict[str, Any]]:
    review_rows: list[dict[str, Any]] = []
    for row in queue_rows:
        review_rows.append(
            {
                "unit_id": row.get("unit_id"),
                "canonical_name": row.get("canonical_name"),
                "alias_candidate": row.get("alias_candidate"),
                "alias_norm": row.get("alias_norm"),
                "observations": row.get("observations"),
                "source_counts": row.get("source_counts") or {},
                "suggested_action": row.get("suggested_action") or "review",
                "action_reason": row.get("action_reason") or "",
                "reviewer_action": "pending",  # approve_alias | reject_non_unit | pending
                "reviewer_notes": "",
                "updated_at": utcnow(),
            }
        )
    write_json(review_path, review_rows)
    return review_rows


def apply_suggested(review_rows: list[dict[str, Any]]) -> int:
    updated = 0
    for row in review_rows:
        if str(row.get("reviewer_action") or "").lower() != "pending":
            continue
        if str(row.get("suggested_action") or "").lower() == "approve_alias":
            row["reviewer_action"] = "approve_alias"
            row["reviewer_notes"] = "Auto-approved from suggested_action."
            row["updated_at"] = utcnow()
            updated += 1
    return updated


def apply_aliases(
    catalog_rows: list[dict[str, Any]],
    review_rows: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, int], list[dict[str, Any]]]:
    by_canonical: dict[str, dict[str, Any]] = {}
    for row in catalog_rows:
        canonical = norm_text(row.get("canonical_name"))
        if canonical:
            by_canonical[canonical] = row

    applied = 0
    rejected = 0
    skipped = 0
    details: list[dict[str, Any]] = []

    for rev in review_rows:
        action = str(rev.get("reviewer_action") or "").lower()
        canonical = norm_text(rev.get("canonical_name"))
        alias_candidate = " ".join(str(rev.get("alias_candidate") or "").split()).strip()
        if action == "pending":
            skipped += 1
            continue
        if action == "reject_non_unit":
            rejected += 1
            details.append(
                {
                    "canonical_name": rev.get("canonical_name"),
                    "alias_candidate": alias_candidate,
                    "result": "rejected",
                }
            )
            continue
        if action != "approve_alias":
            skipped += 1
            continue
        if not canonical or not alias_candidate:
            skipped += 1
            continue
        target = by_canonical.get(canonical)
        if not target:
            skipped += 1
            details.append(
                {
                    "canonical_name": rev.get("canonical_name"),
                    "alias_candidate": alias_candidate,
                    "result": "skipped_missing_canonical",
                }
            )
            continue

        aliases = target.get("aliases") or []
        if not isinstance(aliases, list):
            aliases = []
        existing_norms = {norm_text(a) for a in aliases if a}
        existing_compact = {compact_text(a) for a in aliases if a}
        cand_norm = norm_text(alias_candidate)
        cand_compact = compact_text(alias_candidate)
        if cand_norm in existing_norms or (cand_compact and cand_compact in existing_compact):
            details.append(
                {
                    "canonical_name": rev.get("canonical_name"),
                    "alias_candidate": alias_candidate,
                    "result": "already_present",
                }
            )
            continue
        aliases.append(alias_candidate)
        target["aliases"] = sorted(set(aliases), key=lambda x: norm_text(x))
        applied += 1
        details.append(
            {
                "canonical_name": rev.get("canonical_name"),
                "alias_candidate": alias_candidate,
                "result": "applied",
            }
        )

    stats = {"applied": applied, "rejected": rejected, "skipped": skipped}
    return catalog_rows, stats, details


def main() -> int:
    args = parse_args()
    queue_path = Path(args.queue)
    review_path = Path(args.review)
    catalog_path = Path(args.catalog)
    report_path = Path(args.report)

    if not queue_path.exists():
        raise FileNotFoundError(f"Queue file not found: {queue_path}")
    queue_rows = load_json(queue_path)
    if not isinstance(queue_rows, list):
        raise RuntimeError("Queue file must be a JSON array.")

    if not review_path.exists() or args.init:
        review_rows = init_review_file(queue_rows, review_path)
        print(f"Initialized review file: {review_path} ({len(review_rows)} rows)")
    else:
        review_rows = load_json(review_path)
        if not isinstance(review_rows, list):
            raise RuntimeError("Review file must be a JSON array.")

    auto_approved = 0
    if args.approve_suggested:
        auto_approved = apply_suggested(review_rows)
        write_json(review_path, review_rows)
        print(f"Auto-approved suggested aliases: {auto_approved}")

    if not args.apply:
        print("No apply step requested. Review decisions in:")
        print(f"  {review_path}")
        print("Set reviewer_action to approve_alias/reject_non_unit, then rerun with --apply.")
        return 0

    if not catalog_path.exists():
        raise FileNotFoundError(f"Catalog file not found: {catalog_path}")
    catalog_rows = load_json(catalog_path)
    if not isinstance(catalog_rows, list):
        raise RuntimeError("Catalog file must be a JSON array.")

    updated_catalog, stats, details = apply_aliases(catalog_rows, review_rows)
    write_json(catalog_path, updated_catalog)
    report = {
        "generated_at": utcnow(),
        "queue_path": str(queue_path),
        "review_path": str(review_path),
        "catalog_path": str(catalog_path),
        "auto_approved": auto_approved,
        "stats": stats,
        "details": details[:500],
    }
    write_json(report_path, report)
    print(
        f"Applied reviewed aliases: applied={stats['applied']} rejected={stats['rejected']} skipped={stats['skipped']}. "
        f"Report: {report_path}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
