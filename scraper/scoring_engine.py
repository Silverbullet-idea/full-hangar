"""
Two-Layer Scoring: Listing Quality + Aircraft Intelligence
Full-Hangar.com — Run from project root or scraper/.
Reference data from Supabase (engine_tbo_reference, propeller_tbo_reference, life_limited_parts).
Loads .env from scraper/ when run from project root so Supabase is available.
"""

import json
import sys
from pathlib import Path

# Load env so reference_service can use Supabase when available
try:
    from dotenv import load_dotenv
    _script_dir = Path(__file__).resolve().parent
    load_dotenv(_script_dir / ".env")
    load_dotenv()  # cwd
except ImportError:
    pass

# Allow importing core when run from scraper/
_ROOT = Path(__file__).resolve().parent
if _ROOT.name == "scraper":
    sys.path.insert(0, str(_ROOT.parent))

from core.intelligence.listing_quality import listing_quality_score
from core.intelligence.aircraft_intelligence import aircraft_intelligence_score


def format_intelligence(intel: dict) -> str:
    """Single listing intelligence summary for console. Uses structured deferred breakdown."""
    d = intel["deferred_maintenance"]
    eng = intel["engine"]
    prop = intel["prop"]
    llp = intel["llp"]
    total = d.get("total", 0)
    breakdown = d.get("breakdown") or {}

    lines = [
        f"  Value Score: {intel['value_score']}",
        f"  Engine: {eng['score']} (remaining: {eng.get('hours_remaining')} hrs / {eng.get('tbo_hours')} TBO)"
        + (" OVER TBO!" if eng.get("over_tbo") else "")
        + (" Calendar exceeded" if eng.get("calendar_exceeded") else ""),
        f"  Prop: {prop['score']}"
        + (f" ({prop.get('hours_remaining')} hrs remaining)" if prop.get("hours_remaining") is not None else " (no data)")
        + (" Calendar overdue" if prop.get("calendar_overdue") else ""),
        f"  LLP: {llp['score']}" + (" (unairworthy item)" if llp.get("any_unairworthy") else ""),
        f"  Deferred Maintenance: ${total:,}",
    ]
    if any(breakdown.get(k) for k in ("engine_overhaul", "prop_overhaul", "annual_due", "elt_due", "caps_due", "magneto_500hr", "robinson_12yr")):
        parts = [f"{k}: ${v:,}" for k, v in breakdown.items() if v and isinstance(v, (int, float))]
        if parts:
            lines.append("    " + " | ".join(parts))
    lines.extend([
        f"  True Cost: ${d.get('true_cost', 0):,}",
        f"  Risk Level: {intel['risk_level']}",
    ])
    return "\n".join(lines)


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "sample_listings.json"
    layer = "both"
    for i, arg in enumerate(sys.argv):
        if arg == "--layer" and i + 1 < len(sys.argv):
            layer = sys.argv[i + 1]
            break

    path = Path(path)
    if not path.is_absolute() and (_ROOT / path).exists():
        path = _ROOT / path
    if not path.exists():
        print(f"File not found: {path}")
        sys.exit(1)

    with open(path, encoding="utf-8") as f:
        listings = json.load(f)

    if not isinstance(listings, list):
        print("Expected JSON array")
        sys.exit(1)

    results = []
    for L in listings:
        out = dict(L)
        if layer in ("quality", "both"):
            out["listing_quality"] = listing_quality_score(L)
        if layer in ("value", "both"):
            out["intelligence"] = aircraft_intelligence_score(L)
        results.append(out)

    # Console output
    print(f"Scoring {len(listings)} listings from {path}\n")
    if layer in ("quality", "both"):
        print("--- Layer 1: Listing Quality ---")
        print(f"{'Title':<32} {'Quality':>7}  Comp  Maint   Doc  Pres   Rec")
        print("-" * 72)
        for r in results:
            q = r.get("listing_quality", {})
            title = (r.get("title") or r.get("model") or "?")[:31]
            print(f"{title:<32} {q.get('total', 0):>7.1f}  {q.get('completeness', 0):>4.1f}  {q.get('maintenance', 0):>5.1f}  {q.get('documentation', 0):>3.1f}  {q.get('presentation', 0):>4.1f}  {q.get('recency', 0):>3.1f}")
        print()

    if layer in ("value", "both"):
        print("--- Layer 2: Aircraft Intelligence (Value Score) ---")
        for r in results:
            intel = r.get("intelligence")
            if not intel:
                continue
            title = (r.get("title") or r.get("model") or "?")[:50]
            print(f"\n{title}")
            print(format_intelligence(intel))
        print()

    # Summary table
    if layer in ("value", "both") and results and results[0].get("intelligence"):
        print("--- Summary ---")
        print(f"{'Title':<32} {'Value':>6}  Engine  Prop   LLP  Deferred      True Cost   Risk")
        print("-" * 85)
        for r in results:
            i = r.get("intelligence", {})
            d = i.get("deferred_maintenance", {})
            title = (r.get("title") or r.get("model") or "?")[:31]
            print(f"{title:<32} {i.get('value_score', 0):>6.1f}  {i.get('engine', {}).get('score', 0):>6.1f}  {i.get('prop', {}).get('score', 0):>5.1f}  {i.get('llp', {}).get('score', 0):>4.1f}  ${d.get('total', 0):>7,}  ${d.get('true_cost', 0):>10,}  {i.get('risk_level', '?'):>8}")

    # Write
    out_path = path.parent / (path.stem + "_scored" + path.suffix)
    def _serialize(obj):
        if hasattr(obj, "isoformat"):
            return obj.isoformat()
        raise TypeError(type(obj))

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, default=_serialize)
    print(f"\nWrote to {out_path}")


if __name__ == "__main__":
    main()
