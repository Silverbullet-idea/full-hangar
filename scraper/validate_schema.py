"""
Listing Schema Validation
Validates scraped listing shape against expected schema.
Run: python validate_schema.py [sample_listings.json]
"""

import json
import sys
from pathlib import Path

# Canonical schema from scraper parse_listing_card + parse_detail_page
REQUIRED_FIELDS = {"source", "source_id", "source_url"}
OPTIONAL_FIELDS = {
    "year", "make", "model", "title", "condition",
    "n_number", "asking_price", "description", "description_full",
    "total_time_airframe", "time_since_overhaul", "time_since_new_engine",
    "time_since_prop_overhaul", "time_since_top_overhaul",
    "aircraft_type", "location_raw", "state",
    "seller_name", "seller_type",
    "primary_image_url", "photos",
    "avionics_notes", "engine_model", "serial_number",
    "paint_condition", "interior_condition",
    "scraped_at", "listing_date",
}
ALLOWED_FIELDS = REQUIRED_FIELDS | OPTIONAL_FIELDS

TYPE_EXPECTATIONS = {
    "year": int,
    "asking_price": int,
    "total_time_airframe": int,
    "time_since_overhaul": (int, type(None)),
    "time_since_new_engine": (int, type(None)),
    "time_since_prop_overhaul": (int, type(None)),
    "time_since_top_overhaul": (int, type(None)),
    "paint_condition": (int, type(None)),
    "interior_condition": (int, type(None)),
}


def validate_listing(listing: dict, idx: int) -> list[str]:
    """Return list of validation errors for a single listing."""
    errors = []
    for field in REQUIRED_FIELDS:
        if field not in listing or listing[field] is None:
            errors.append(f"[{idx}] Missing required field: {field}")

    for key in listing:
        if key not in ALLOWED_FIELDS:
            errors.append(f"[{idx}] Unknown field: {key}")

    for field, expected_type in TYPE_EXPECTATIONS.items():
        val = listing.get(field)
        if val is None:
            continue
        if not isinstance(val, expected_type):
            errors.append(f"[{idx}] {field}: expected {expected_type}, got {type(val)}")

    return errors


def validate_file(path: str) -> tuple[bool, list[str], dict]:
    """Validate all listings in a JSON file. Returns (ok, errors, stats)."""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        return False, ["Root must be a JSON array"], {}

    errors = []
    for i, listing in enumerate(data):
        if not isinstance(listing, dict):
            errors.append(f"[{i}] Listing must be an object")
            continue
        errors.extend(validate_listing(listing, i))

    # Stats
    if data and isinstance(data[0], dict):
        all_keys = set()
        for L in data:
            all_keys.update(L.keys())
        stats = {
            "count": len(data),
            "fields_seen": sorted(all_keys),
            "field_coverage": {k: sum(1 for L in data if L.get(k) is not None) for k in all_keys},
        }
    else:
        stats = {"count": len(data)}

    return len(errors) == 0, errors, stats


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "sample_listings.json"
    if not Path(path).exists():
        print(f"File not found: {path}")
        sys.exit(1)

    ok, errors, stats = validate_file(path)
    print(f"Validated {path}")
    print(f"  Listings: {stats.get('count', 0)}")
    if "fields_seen" in stats:
        print(f"  Fields: {', '.join(stats['fields_seen'])}")
    if "field_coverage" in stats:
        print("  Coverage:")
        for k, v in sorted(stats["field_coverage"].items(), key=lambda x: -x[1]):
            pct = 100 * v / stats["count"]
            print(f"    {k}: {v}/{stats['count']} ({pct:.0f}%)")

    if errors:
        print("\nErrors:")
        for e in errors[:20]:
            print(f"  {e}")
        if len(errors) > 20:
            print(f"  ... and {len(errors) - 20} more")
        sys.exit(1)
    print("\n[OK] Schema valid")


if __name__ == "__main__":
    main()
