from __future__ import annotations

import os
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import Client, create_client

OUTPUT_PATH = Path("scraper/FIELD_COVERAGE_REPORT.md")

COMPLETENESS_FIELDS: list[str] = [
    "year",
    "make",
    "model",
    "asking_price",
    "n_number",
    "description",
    "total_time_airframe",
    "time_since_overhaul",
    "time_since_prop_overhaul",
    "location_raw",
    "state",
    "seller_name",
    "seller_type",
    "primary_image_url",
    "aircraft_type",
]

FIELD_DEFINITIONS: dict[str, str] = {
    "year": "Aircraft model year.",
    "make": "Aircraft manufacturer/brand.",
    "model": "Aircraft model/variant.",
    "asking_price": "Current asking price for the listing.",
    "n_number": "FAA registration tail number (N-number).",
    "description": "Listing narrative text/marketing description.",
    "total_time_airframe": "Total Time Airframe (TTAF) hours.",
    "time_since_overhaul": "Engine time since major overhaul (SMOH/TSOH).",
    "time_since_prop_overhaul": "Propeller time since overhaul.",
    "location_raw": "Raw city/state or location string.",
    "state": "Normalized U.S. state/province derived from location.",
    "seller_name": "Seller/dealer display name.",
    "seller_type": "Seller classification (dealer/private/broker).",
    "primary_image_url": "Primary hero image URL for the listing.",
    "aircraft_type": "High-level aircraft class/type.",
}

SOURCE_CONTEXT: dict[str, dict[str, str]] = {
    "trade_a_plane": {
        "n_number": "the specs/details grid and often in the title header.",
        "seller_type": "the seller contact panel where dealer/private labels may appear near the seller name.",
        "seller_name": "the right-side or lower contact card for the advertiser.",
        "location_raw": "the seller/contact location line near the seller card.",
        "state": "the location line near city/state in seller details.",
    },
    "controller": {
        "n_number": "the aircraft details/specifications section.",
        "seller_type": "the seller card or advertiser badge near contact info.",
        "seller_name": "the dealer/seller info panel on listing detail.",
        "location_raw": "the seller location row in the detail/contact area.",
        "state": "the state abbreviation in seller location text.",
    },
    "barnstormers": {
        "description": "the ad body text block (often long-form free text).",
        "n_number": "the ad text/spec text when explicitly listed as registration.",
        "seller_name": "the contact/advertiser block near phone/email.",
        "seller_type": "seller wording in the contact block; often implied rather than explicit.",
    },
    "aerotrader": {
        "seller_name": "the dealer card/contact section under or beside listing media.",
        "seller_type": "dealer/business labels in the seller card.",
        "location_raw": "dealer city/state in the seller summary panel.",
        "state": "state value in dealer location text.",
    },
    "avbuyer": {
        "seller_name": "broker/dealer section on the listing page.",
        "seller_type": "broker/dealer wording in advertiser details.",
        "location_raw": "seller location line in advertiser box.",
    },
    "globalair": {
        "n_number": "the aircraft facts/specification rows.",
        "total_time_airframe": "specification rows for TTAF/airframe time.",
        "time_since_overhaul": "engine section values (SMOH/TSOH style fields).",
        "seller_name": "contact details panel.",
    },
    "aso": {
        "seller_name": "seller/dealer details near listing contact information.",
        "location_raw": "seller location/contact rows.",
        "seller_type": "dealer/private wording around seller profile.",
    },
    "afs": {
        "seller_name": "contact/seller card or profile section.",
        "location_raw": "location line in seller details.",
    },
}

GENERIC_FIELD_LOCATION: dict[str, str] = {
    "year": "the title block or specs table near make/model.",
    "make": "the title/spec section near model/year.",
    "model": "the title/spec section near make/year.",
    "asking_price": "the top pricing banner/header near the listing title.",
    "n_number": "the specifications/details section (registration/tail number row).",
    "description": "the main listing description/body content area.",
    "total_time_airframe": "the airframe/specifications section (TTAF row).",
    "time_since_overhaul": "engine details/spec rows (SMOH/TSOH wording).",
    "time_since_prop_overhaul": "propeller/spec rows (prop overhaul/prop time wording).",
    "location_raw": "the seller contact/location block.",
    "state": "city/state text in seller location/contact details.",
    "seller_name": "seller or dealer contact card/header.",
    "seller_type": "seller identity labels (dealer/private/broker) near seller info.",
    "primary_image_url": "the main gallery hero image on listing detail.",
    "aircraft_type": "category breadcrumbs, listing taxonomy chips, or type metadata near title/specs.",
}


@dataclass
class FieldCounts:
    present: int = 0
    missing: int = 0

    @property
    def total(self) -> int:
        return self.present + self.missing

    @property
    def fill_rate(self) -> float:
        if self.total == 0:
            return 0.0
        return (self.present / self.total) * 100.0


def _get_supabase_client() -> Client:
    env_path = Path(__file__).resolve().parent / ".env"
    load_dotenv(dotenv_path=env_path)
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in scraper/.env")
    return create_client(url, key)


def _normalize_source(value: Any) -> str:
    text = str(value or "").strip().lower()
    return text if text else "unknown"


def _is_present(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return value.strip() != ""
    if isinstance(value, (list, dict, tuple, set)):
        return len(value) > 0
    return True


def _load_active_rows(sb: Client, batch_size: int = 1000) -> list[dict[str, Any]]:
    columns = ["source_site", *COMPLETENESS_FIELDS]
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        chunk = (
            sb.table("aircraft_listings")
            .select(",".join(columns))
            .eq("is_active", True)
            .order("source_site")
            .range(offset, offset + batch_size - 1)
            .execute()
            .data
            or []
        )
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < batch_size:
            break
        offset += batch_size
    return rows


def _note_for(source: str, field: str, fill_rate: float) -> str:
    source_map = SOURCE_CONTEXT.get(source, {})
    location_hint = source_map.get(field) or GENERIC_FIELD_LOCATION[field]
    field_definition = FIELD_DEFINITIONS[field]
    return (
        f"- `{source}` / `{field}` ({fill_rate:.1f}%): {field_definition} "
        f"On this source, this typically appears in {location_hint}"
    )


def _compute_coverage(rows: list[dict[str, Any]]) -> dict[str, dict[str, FieldCounts]]:
    coverage: dict[str, dict[str, FieldCounts]] = defaultdict(lambda: {f: FieldCounts() for f in COMPLETENESS_FIELDS})
    for row in rows:
        source = _normalize_source(row.get("source_site"))
        for field in COMPLETENESS_FIELDS:
            if _is_present(row.get(field)):
                coverage[source][field].present += 1
            else:
                coverage[source][field].missing += 1
    return coverage


def _to_markdown(rows_scanned: int, coverage: dict[str, dict[str, FieldCounts]]) -> str:
    lines: list[str] = [
        "# Field Coverage Report",
        "",
        f"- Generated (UTC): {datetime.now(timezone.utc).isoformat()}",
        f"- Active listings scanned: {rows_scanned}",
        "",
        "## Source × Field Coverage",
        "",
        "| Source | Field | Present | Missing | Fill % |",
        "|---|---|---:|---:|---:|",
    ]

    sources = sorted(coverage.keys())
    for source in sources:
        for field in COMPLETENESS_FIELDS:
            counts = coverage[source][field]
            lines.append(
                f"| {source} | {field} | {counts.present} | {counts.missing} | {counts.fill_rate:.1f}% |"
            )

    lines.extend(
        [
            "",
            "## Bottom 5 Fields Per Source (Priority Fix Targets)",
            "",
            "| Source | Field | Present | Missing | Fill % |",
            "|---|---|---:|---:|---:|",
        ]
    )
    for source in sources:
        ranked = sorted(
            ((field, coverage[source][field]) for field in COMPLETENESS_FIELDS),
            key=lambda item: (item[1].fill_rate, -item[1].missing, item[0]),
        )
        for field, counts in ranked[:5]:
            lines.append(
                f"| {source} | {field} | {counts.present} | {counts.missing} | {counts.fill_rate:.1f}% |"
            )

    lines.extend(["", "## Fields Below 70% Fill Rate (Diagnostic Notes)", ""])
    low_fill_notes: list[str] = []
    for source in sources:
        for field in COMPLETENESS_FIELDS:
            counts = coverage[source][field]
            if counts.fill_rate < 70.0:
                low_fill_notes.append(_note_for(source, field, counts.fill_rate))
    if low_fill_notes:
        lines.extend(low_fill_notes)
    else:
        lines.append("- No source/field combinations are below 70% fill.")

    lines.extend(
        [
            "",
            "## Unknown Source Bucket Check",
            "",
            "- `unknown` in this report means `source_site` is null/empty after normalization.",
        ]
    )
    if "unknown" in coverage:
        unknown_total = coverage["unknown"][COMPLETENESS_FIELDS[0]].total
        lines.append(f"- Active listings in `unknown`: {unknown_total}")
    else:
        lines.append("- Active listings in `unknown`: 0")

    return "\n".join(lines).strip() + "\n"


def main() -> None:
    sb = _get_supabase_client()
    rows = _load_active_rows(sb)
    coverage = _compute_coverage(rows)
    output = _to_markdown(len(rows), coverage)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(output, encoding="utf-8")
    print("")
    print("Field coverage audit complete")
    print(f"- Active rows scanned: {len(rows)}")
    print(f"- Report: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
