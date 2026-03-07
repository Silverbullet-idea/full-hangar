r"""
Audit listing prices for likely outliers.

Usage:
    .venv312\Scripts\python.exe scraper\audit_listing_price_outliers.py
    .venv312\Scripts\python.exe scraper\audit_listing_price_outliers.py --model-ratio-threshold 4.0 --piston-hard-cap 1200000
    .venv312\Scripts\python.exe scraper\audit_listing_price_outliers.py --focus likely_currency --source-site avbuyer
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
from collections import defaultdict
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import create_client


DEFAULT_OUTPUT = Path("scraper/price_outliers_latest.json")
DEFAULT_MARKDOWN_OUTPUT = Path("scraper/price_outliers_latest.md")
HIGH_END_KEYWORDS = (
    "citation",
    "king air",
    "gulfstream",
    "learjet",
    "challenger",
    "falcon",
    "pc-12",
    "tbm",
    "global",
    "hondajet",
    "phenom",
    "hawker",
    "pilatus",
    "embraer",
    "bombardier",
)


def _normalized_price(row: dict[str, Any]) -> float | None:
    raw = row.get("asking_price")
    if raw is None:
        raw = row.get("price_asking")
    if isinstance(raw, (int, float)) and raw > 0:
        return float(raw)
    return None


def _load_active_rows(sb: Any, batch_size: int = 1000) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        batch = (
            sb.table("aircraft_listings")
            .select(
                "id,source_site,source_id,url,title,make,model,year,aircraft_type,is_active,asking_price,price_asking"
            )
            .eq("is_active", True)
            .range(offset, offset + batch_size - 1)
            .execute()
            .data
            or []
        )
        rows.extend(batch)
        if len(batch) < batch_size:
            break
        offset += batch_size
    return rows


def _is_piston(row: dict[str, Any]) -> bool:
    a_type = str(row.get("aircraft_type") or "").strip().lower()
    return a_type in {"single_engine_piston", "multi_engine_piston"}


def _score_suspicion(row: dict[str, Any], reasons: list[str]) -> int:
    score = 0
    source_site = str(row.get("source_site") or "").strip().lower()
    if source_site == "avbuyer":
        score += 2
    if _is_piston(row):
        score += 1
    if "model_ratio" in " ".join(reasons):
        score += 2
    if "make_ratio" in " ".join(reasons):
        score += 1
    if "piston_hard_cap" in reasons:
        score += 1
    return score


def _is_high_end_keyword_match(row: dict[str, Any]) -> bool:
    haystack = " ".join(
        [
            str(row.get("title") or ""),
            str(row.get("make") or ""),
            str(row.get("model") or ""),
            str(row.get("aircraft_type") or ""),
        ]
    ).lower()
    return any(keyword in haystack for keyword in HIGH_END_KEYWORDS)


def _classify_currency_risk(row: dict[str, Any]) -> str:
    reasons = row.get("reasons") or []
    model_ratio = float(row.get("model_ratio") or 0)
    make_ratio = float(row.get("make_ratio") or 0)
    source_site = str(row.get("source_site") or "").strip().lower()
    is_piston = _is_piston(row)
    high_end_keyword_match = _is_high_end_keyword_match(row)

    if source_site == "avbuyer" and is_piston and (model_ratio >= 3.0 or make_ratio >= 6.0 or "piston_hard_cap" in reasons):
        return "HIGH"
    if is_piston and not high_end_keyword_match and (model_ratio >= 6.0 or make_ratio >= 10.0):
        return "MEDIUM"
    if "piston_hard_cap" in reasons and high_end_keyword_match:
        return "LOW"
    return "LOW"


def _is_likely_currency_case(row: dict[str, Any]) -> bool:
    return _classify_currency_risk(row) in {"HIGH", "MEDIUM"}


def _write_markdown_report(path: Path, report: dict[str, Any], rows_for_console: list[dict[str, Any]]) -> None:
    lines: list[str] = []
    lines.append("# Price Outlier Audit")
    lines.append("")
    lines.append("## Summary")
    lines.append(f"- Active rows scanned: `{report['active_rows']}`")
    lines.append(f"- Priced rows scanned: `{report['priced_rows']}`")
    lines.append(f"- Flagged rows: `{report['flagged_count']}`")
    if report.get("currency_risk_counts"):
        lines.append(
            "- Currency risk counts: "
            + ", ".join(
                [
                    f"`{k}={v}`"
                    for k, v in sorted(
                        dict(report.get("currency_risk_counts") or {}).items(),
                        key=lambda item: item[0],
                    )
                ]
            )
        )
    if report.get("focus"):
        lines.append(f"- Focus mode: `{report['focus']}`")
    if report.get("source_site_filter"):
        lines.append(f"- Source filter: `{report['source_site_filter']}`")
    lines.append("")
    lines.append("## Top flagged rows")
    lines.append("")
    lines.append("| Source | Aircraft | Price | Ratios | Reasons |")
    lines.append("|---|---|---:|---|---|")
    for row in rows_for_console[:30]:
        aircraft = f"{row.get('year') or 'N/A'} {row.get('make') or 'N/A'} {row.get('model') or 'N/A'}"
        ratios = []
        if row.get("model_ratio"):
            ratios.append(f"model {row['model_ratio']}x")
        if row.get("make_ratio"):
            ratios.append(f"make {row['make_ratio']}x")
        ratio_text = ", ".join(ratios) if ratios else "-"
        reason_text = ", ".join(row.get("reasons") or [])
        lines.append(
            f"| {row.get('source_site') or 'N/A'} | {aircraft} | ${int(row.get('price') or 0):,} | {ratio_text} | {reason_text} ({row.get('currency_risk') or 'LOW'}) |"
        )
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit listing prices for outliers")
    parser.add_argument(
        "--focus",
        choices=["all", "likely_currency"],
        default="all",
        help="all = broad outliers, likely_currency = currency/parser-risk focused subset",
    )
    parser.add_argument(
        "--include-low-risk",
        action="store_true",
        help="Include LOW currency-risk rows in likely_currency mode (default hides them).",
    )
    parser.add_argument(
        "--source-site",
        default="",
        help="Optional source filter (example: avbuyer)",
    )
    parser.add_argument("--model-ratio-threshold", type=float, default=4.0, help="Flag if price >= this multiple of make/model median")
    parser.add_argument("--make-ratio-threshold", type=float, default=8.0, help="Flag if price >= this multiple of make median")
    parser.add_argument("--min-model-sample", type=int, default=4, help="Minimum sample size for make/model median")
    parser.add_argument("--min-make-sample", type=int, default=10, help="Minimum sample size for make median")
    parser.add_argument("--min-price", type=int, default=150000, help="Ignore rows below this price")
    parser.add_argument(
        "--piston-hard-cap",
        type=int,
        default=1200000,
        help="Flag piston aircraft priced above this cap (independent signal)",
    )
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="JSON report output path")
    parser.add_argument("--markdown-output", default=str(DEFAULT_MARKDOWN_OUTPUT), help="Markdown summary output path")
    args = parser.parse_args()

    load_dotenv(Path("scraper/.env"))
    supabase_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not supabase_url or not service_key:
        raise SystemExit("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in scraper/.env")

    sb = create_client(supabase_url, service_key)
    rows = _load_active_rows(sb)

    priced: list[dict[str, Any]] = []
    for row in rows:
        price = _normalized_price(row)
        if price is None:
            continue
        if args.source_site and str(row.get("source_site") or "").strip().lower() != args.source_site.strip().lower():
            continue
        row_copy = dict(row)
        row_copy["_price"] = price
        priced.append(row_copy)

    by_model: dict[tuple[str, str], list[float]] = defaultdict(list)
    by_make: dict[str, list[float]] = defaultdict(list)
    for row in priced:
        make = str(row.get("make") or "").strip().lower()
        model = str(row.get("model") or "").strip().lower()
        if make and model:
            by_model[(make, model)].append(row["_price"])
        if make:
            by_make[make].append(row["_price"])

    model_medians = {
        key: statistics.median(values)
        for key, values in by_model.items()
        if len(values) >= args.min_model_sample
    }
    make_medians = {
        key: statistics.median(values)
        for key, values in by_make.items()
        if len(values) >= args.min_make_sample
    }

    flagged: list[dict[str, Any]] = []
    for row in priced:
        price = float(row["_price"])
        if price < args.min_price:
            continue

        make = str(row.get("make") or "").strip().lower()
        model = str(row.get("model") or "").strip().lower()
        model_key = (make, model)

        reasons: list[str] = []
        model_median = model_medians.get(model_key)
        make_median = make_medians.get(make)
        model_ratio = None
        make_ratio = None

        if model_median and model_median > 0:
            model_ratio = price / model_median
            if model_ratio >= args.model_ratio_threshold:
                reasons.append(f"model_ratio={model_ratio:.2f}x")

        if make_median and make_median > 0:
            make_ratio = price / make_median
            if make_ratio >= args.make_ratio_threshold:
                reasons.append(f"make_ratio={make_ratio:.2f}x")

        if _is_piston(row) and price >= args.piston_hard_cap:
            reasons.append("piston_hard_cap")

        if not reasons:
            continue

        flagged.append(
            {
                "id": row.get("id"),
                "source_site": row.get("source_site"),
                "source_id": row.get("source_id"),
                "url": row.get("url"),
                "title": row.get("title"),
                "year": row.get("year"),
                "make": row.get("make"),
                "model": row.get("model"),
                "aircraft_type": row.get("aircraft_type"),
                "price": int(price),
                "model_median": int(model_median) if model_median else None,
                "model_ratio": round(model_ratio, 3) if model_ratio else None,
                "make_median": int(make_median) if make_median else None,
                "make_ratio": round(make_ratio, 3) if make_ratio else None,
                "reasons": reasons,
                "suspicion_score": _score_suspicion(row, reasons),
                "high_end_keyword_match": _is_high_end_keyword_match(row),
            }
        )

    for row in flagged:
        row["currency_risk"] = _classify_currency_risk(row)

    if args.focus == "likely_currency":
        flagged = [row for row in flagged if _is_likely_currency_case(row) or args.include_low_risk]
        flagged.sort(
            key=lambda item: (
                {"HIGH": 3, "MEDIUM": 2, "LOW": 1}.get(str(item.get("currency_risk") or "LOW"), 1),
                item.get("suspicion_score", 0),
                item.get("model_ratio") or 0,
                item["price"],
            ),
            reverse=True,
        )
    else:
        flagged.sort(
            key=lambda item: (
                {"HIGH": 3, "MEDIUM": 2, "LOW": 1}.get(str(item.get("currency_risk") or "LOW"), 1),
                item.get("suspicion_score", 0),
                item["price"],
            ),
            reverse=True,
        )

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    markdown_output_path = Path(args.markdown_output)
    markdown_output_path.parent.mkdir(parents=True, exist_ok=True)
    report = {
        "active_rows": len(rows),
        "priced_rows": len(priced),
        "model_groups_with_median": len(model_medians),
        "make_groups_with_median": len(make_medians),
        "flagged_count": len(flagged),
        "focus": args.focus,
        "source_site_filter": args.source_site.strip().lower() if args.source_site else None,
        "include_low_risk": bool(args.include_low_risk),
        "flagged": flagged,
    }
    risk_counts: dict[str, int] = defaultdict(int)
    for row in flagged:
        risk_counts[str(row.get("currency_risk") or "LOW")] += 1
    report["currency_risk_counts"] = dict(risk_counts)

    output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    _write_markdown_report(markdown_output_path, report, flagged)

    source_counts: dict[str, int] = defaultdict(int)
    for row in flagged:
        source_counts[str(row.get("source_site") or "unknown")] += 1

    print("")
    print("Price Outlier Audit Summary")
    print("===========================")
    print(f"Active rows scanned : {report['active_rows']}")
    print(f"Priced rows scanned : {report['priced_rows']}")
    print(f"Focus mode          : {args.focus}")
    print(f"Source filter       : {args.source_site or 'none'}")
    print(f"Include LOW risk    : {'yes' if args.include_low_risk else 'no'}")
    print(f"Flagged rows        : {report['flagged_count']}")
    print(f"JSON report         : {output_path}")
    print(f"Markdown report     : {markdown_output_path}")
    if source_counts:
        print("")
        print("Flagged rows by source:")
        for source, count in sorted(source_counts.items(), key=lambda item: item[1], reverse=True):
            print(f"- {source}: {count}")
    if risk_counts:
        print("")
        print("Flagged rows by currency risk:")
        for risk_label, count in sorted(risk_counts.items(), key=lambda item: {"HIGH": 3, "MEDIUM": 2, "LOW": 1}.get(item[0], 0), reverse=True):
            print(f"- {risk_label}: {count}")

    print("")
    print("Top flagged rows:")
    for row in flagged[:30]:
        aircraft = "{} {} {}".format(row.get("year") or "N/A", row.get("make") or "N/A", row.get("model") or "N/A")
        ratio_parts: list[str] = []
        if row.get("model_ratio"):
            ratio_parts.append(f"model {row['model_ratio']}x")
        if row.get("make_ratio"):
            ratio_parts.append(f"make {row['make_ratio']}x")
        ratio_text = ", ".join(ratio_parts) if ratio_parts else "n/a"
        print(
            "- [{}][{}] {} | ${:,} | {} | reasons={} | id={} | {}".format(
                row["source_site"],
                row.get("currency_risk") or "LOW",
                aircraft,
                row["price"],
                ratio_text,
                ",".join(row["reasons"]),
                row["id"],
                row["url"],
            )
        )


if __name__ == "__main__":
    main()
