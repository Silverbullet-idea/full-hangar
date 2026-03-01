# Full-Hangar Intelligence Layer

Aviation logic lives here. **Scrapers can change; this should not.**

## Reference Data (Supabase)

Reference data is **Supabase-backed** via `reference_service.py`. In-code fallbacks in `reference.py` when DB is unavailable or returns no match.

- **`reference_service.py`**: `get_engine_reference(normalized_engine)`, `get_prop_reference(normalized_prop, raw_text?)`, `get_llp_rules(make, model)`. Lazy Supabase client from `SUPABASE_URL` / `SUPABASE_SERVICE_KEY`.
- **`model_normalizer.py`**: `normalize_engine_model()`, `normalize_prop_model()`, `extract_engine_canonical_from_listing()`, `extract_prop_canonical_from_listing()` for deterministic matching (e.g. O-320-D2J → O320D2J).
- **Tables**: `engine_tbo_reference`, `propeller_tbo_reference`, `life_limited_parts`. See `supabase/migrations/20250301000001_reference_tables.sql`.

## Two-Layer Architecture

### Layer 1: Listing Quality Score
- **Module:** `listing_quality.py`
- **Use:** Sort search results, rank cards, filter junk.
- **Inputs:** Raw listing dict (no reference tables).
- **Outputs:** `completeness`, `maintenance`, `documentation`, `presentation`, `recency`, `total` (0–100).

### Layer 2: Aircraft Intelligence Score (Value Score)
- **Module:** `aircraft_intelligence.py`
- **Use:** What investors and buyers care about. The "Carfax moment."
- **Inputs:** Listing dict + reference data (`reference.py` or future Supabase tables).
- **Outputs:**
  - **Value Score** (0–100)
  - **Engine:** remaining %, hours remaining, TBO, over-TBO, calendar exceeded, score
  - **Prop:** hours remaining, calendar overdue, score
  - **LLP:** items (annual, ELT, CAPS, Robinson 12-yr, mag), any unairworthy, score
  - **Deferred maintenance:** structured **breakdown** (engine_overhaul, prop_overhaul, annual_due, elt_due, caps_due, magneto_500hr, robinson_12yr), **total**, **true_cost** (asking + total), plus **deferred_items** list for detail. Enables UI breakdown, charts, biggest-cost-driver insights.
  - **Risk level:** LOW | MODERATE | HIGH | CRITICAL

## Reference Data

- **`reference.py`:** In-code engine TBO, prop TBO, LLP intervals/costs. **Fallback only** when Supabase is unavailable or returns no match.
- **`reference_service.py`:** Primary. Queries Supabase `engine_tbo_reference`, `propeller_tbo_reference`, `life_limited_parts`. Uses longest-pattern match after normalization.

## Usage

From project root:

```bash
py -3 scraper/scoring_engine.py scraper/sample_listings.json
py -3 scraper/scoring_engine.py scraper/sample_listings.json --layer quality   # Layer 1 only
py -3 scraper/scoring_engine.py scraper/sample_listings.json --layer value     # Layer 2 only
```

From Python:

```python
from core.intelligence import listing_quality_score, aircraft_intelligence_score

q = listing_quality_score(listing)
intel = aircraft_intelligence_score(listing)
# intel["value_score"], intel["deferred_maintenance"]["true_cost"], intel["risk_level"]
```

## Deferred Cost Logic

- **Engine over TBO or calendar:** cost from `get_engine_reference()` (Supabase or fallback `cost_min`/`cost_max`).
- **Prop over TBO or calendar:** cost from `get_prop_reference()`.
- **LLP expired:** annual, ELT, CAPS, Robinson 12-yr, magneto from `get_llp_rules()`; cost from rule `cost_min`/`cost_max` mid-point.
- **Structured output:** `breakdown.engine_overhaul`, `breakdown.prop_overhaul`, `breakdown.annual_due`, `breakdown.elt_due`, `breakdown.caps_due`, `breakdown.magneto_500hr`, `breakdown.robinson_12yr` (0 when not applicable); `total`; `true_cost` = asking_price + total.

## Risk Level

- **CRITICAL:** value &lt; 40 with unairworthy LLP, or value &lt; 25.
- **HIGH:** unairworthy LLP and value &lt; 40, or value 25–50.
- **MODERATE:** value 50–75.
- **LOW:** value ≥ 75 and no unairworthy LLP.
