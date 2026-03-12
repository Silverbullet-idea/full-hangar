# Full Hangar Avionics Expansion Plan

Last updated: March 5, 2026
Owner: BACKEND
Status: Ready to execute

## Objective

Expand backend avionics intelligence with two priorities:

1. Build a comprehensive avionics catalog to improve parser extraction accuracy.
2. Improve installed avionics valuation quality using conservative market logic.

## Locked Decisions (Ryan)

- Conservative anchor: `P25`
- Minimum sample floor: `sample_count >= 3, if not then 1`
- Override policy: prefer `OEM/MSRP` when conflicting with market comps
- Data policy: quality over quantity
- Segment rollout: piston singles first, then multi-piston, then broader fleet

## Scope and Non-Goals

### In Scope

- Avionics catalog and alias depth
- FAA/OEM-backed evidence capture
- Conservative valuation model upgrade
- Parser extraction quality for real listing text
- Explainable scoring outputs

### Out of Scope (for this phase)

- Frontend visualization redesign
- Full turboprop/jet/Part 25 coverage on first release
- Fully automated ingestion for every FAA source on day one

## Target Data Architecture

## Core Tables

### `avionics_units`

Canonical avionics unit records.

- `id` (bigint, PK)
- `manufacturer` (text)
- `model` (text)
- `canonical_name` (text, unique by manufacturer+model)
- `function_category` (text)
- `legacy_vs_glass` (text enum: `legacy`, `glass`, `hybrid`)
- `priority_family` (text enum: `piston_single`, `piston_multi`, `turboprop`, `rotorcraft`, `jet`)
- `is_active` (bool default true)
- `created_at`, `updated_at`

### `avionics_aliases`

Normalized aliases used by parser matching.

- `id` (bigint, PK)
- `unit_id` (fk -> avionics_units)
- `alias_text` (text)
- `alias_norm` (text, lowercase normalized form)
- `alias_source` (text enum: `faa`, `oem`, `listing`, `manual`)
- `confidence` (numeric 0-1)
- unique constraint on (`unit_id`, `alias_norm`)

### `avionics_certifications`

Certification and approval metadata.

- `id` (bigint, PK)
- `unit_id` (fk -> avionics_units)
- `authority` (text enum: `FAA`, `EASA`, `OTHER`)
- `approval_type` (text enum: `TSO`, `STC`, `AML_STC`, `TC`)
- `approval_ref` (text)
- `approval_notes` (text)
- `source_url` (text)

### `avionics_market_values`

Valuation snapshots by segment and category.

- `id` (bigint, PK)
- `unit_id` (fk -> avionics_units)
- `aircraft_segment` (text)
- `sample_count` (int)
- `price_min` (numeric)
- `price_p25` (numeric)
- `price_median` (numeric)
- `price_p75` (numeric)
- `price_max` (numeric)
- `oem_msrp_value` (numeric)
- `valuation_basis` (text enum: `oem_msrp`, `market_p25`, `blend`)
- `confidence_score` (numeric 0-1)
- `computed_at` (timestamptz)

### `avionics_listing_observations`

Per-listing extracted avionics evidence.

- `id` (bigint, PK)
- `listing_id` (uuid/text, align to existing listing key type)
- `unit_id` (nullable fk -> avionics_units)
- `raw_token` (text)
- `normalized_token` (text)
- `quantity` (int default 1)
- `extractor_version` (text)
- `match_confidence` (numeric 0-1)
- `match_type` (text enum: `exact_alias`, `fuzzy_alias`, `manual_override`, `unresolved`)
- `created_at` (timestamptz)

## Supporting Tables

### `avionics_bundle_rules`

Defines conservative bundle multipliers and stack rules.

- `bundle_code`
- `required_unit_set`
- `multiplier`
- `segment`
- `priority_order`

### `avionics_install_factors`

Installed-value adjustment factors.

- `function_category`
- `segment`
- `install_factor`
- `obsolescence_haircut`
- `confidence_discount_rule`

## Source Strategy (Quality-First)

## Tier A (Authoritative, ingest first)

1. FAA ADS-B Certified Equipment datasets
2. FAA TSO references relevant to GA avionics functions
3. FAA ADS-B search-by-aircraft outputs for common piston singles

## Tier B (High quality, ingest second)

1. OEM documentation and product support pages:
   - Garmin
   - Avidyne
   - Aspen
   - uAvionix
2. AML/STC references with explicit model applicability

## Tier C (Curated supplemental)

1. Large MRO capability lists
2. Structured avionics installer references

## Tier D (Pricing and noise capture only)

1. Existing `aircraft_component_sales` avionics records
2. Listing-derived observations and legacy text variants

## Parser and Matching Plan

## Parser Upgrade Goals

- Move from simple substring matching to alias dictionary + token normalization.
- Add quantity extraction (`dual`, `2x`, `pair`).
- Add suffix and variant handling (`Xi`, `W`, spacing/hyphen variants).
- Preserve unresolved high-frequency tokens for queue-based alias expansion.

## Parser Output Contract

Extend `description_intelligence` with:

- `avionics_detailed`: array of `{raw, normalized, canonical_unit_id, canonical_name, qty, confidence, source}`
- `avionics_unresolved`: array of unresolved normalized tokens
- `avionics_parser_version`: semantic version string

## Valuation Policy (Conservative)

## Unit-Level Value Selection Logic

Given a unit and segment:

1. If trustworthy `OEM/MSRP` exists, use it as primary basis.
2. Else if `sample_count >= 3`, use market `P25`.
3. Else use conservative fallback default table.

## Final Installed Value

`installed_value = base_value * quantity * install_factor * confidence_discount * obsolescence_haircut`

Apply bundle multipliers only after conservative unit values are computed.

## Risk Controls

- Cap extreme outliers using winsorization before percentile calculations.
- Avoid optimistic stacking for overlapping systems.
- For ambiguous matches, apply lower confidence discount.

## Segment Rollout Sequence

## Wave 1: Piston Singles (Immediate)

Prioritize:

- Garmin GTN/GNS/G3X/G5/GFC/GTX families
- Aspen Evolution families
- Avidyne IFD/Entegra families
- uAvionix ADS-B units
- BendixKing and S-TEC legacy autopilot stack

## Wave 2: Multi-Piston

Objective: graduate from piston-single bias into twin/multi mission stacks while keeping conservative value policy.

Coverage priorities:

- Garmin: GTN 650/750 (+Xi), G500/G600 TXi, GFC 600, GTX remote transponders
- Avidyne: IFD 440/540/550 multi-piston install variants
- BendixKing/Honeywell legacy: KFC/KAP/KAS family seen in Baron/Seneca/310 cohorts
- L3Harris surveillance: Lynx/NGT family variants common in retrofit twins
- High-frequency LRU companions (example: GIA/GDC/GMU class tokens) when they are repeatedly observed in multi-piston listings

Data/valuation policy for Wave 2:

- Keep per-unit values segment-scoped (`aircraft_segment='piston_multi'`) with fallback to `piston_single` only when multi-piston sample floor is not met.
- Preserve condition-aware valuation (`new`, `used`, `core`) and do not blend core inventory into primary market estimates.
- Require conservative confidence gating for ingest (`high` auto-ingest, `medium` review queue).

Wave 2 quality gates (must pass before Wave 3 default rollout):

- Multi-piston unresolved token rate <= 8% on 90-day cohort.
- Multi-piston matched-row rate >= 94%.
- At least 80% of top 50 multi-piston unresolved tokens closed or intentionally classified as non-avionics noise.
- No upward valuation drift > 15% p50 in shadow comparison without attributable source expansion.

## Wave 3: Turboprop, Rotorcraft, Jet

Objective: expand to higher-complexity platforms without destabilizing scoring reliability.

Rollout order:

1. Turboprop
2. Rotorcraft
3. Jet

Reasoning: turboprop inventory has the best overlap with existing GA avionics families and gives the safest bridge from Wave 2.

Coverage priorities by segment:

- Turboprop: integrated flight deck units, advanced autopilot controllers, weather/traffic modules, pressurization-adjacent panel components that frequently co-occur in listings.
- Rotorcraft: mission-specific navigation/communication combinations and legacy-to-modern retrofit pairs.
- Jet: Part 25 / transport-oriented avionics families and controller/display/LRU ecosystems, with explicit noise filtering for non-retail parts mentions.

Wave 3 controls:

- Segment-specific alias packs; no cross-segment alias promotion without evidence.
- Stronger ambiguity penalties for short tokens in jet/rotor listings.
- Segment-level shadow runs required before enabling score-impacting cutover.

Wave 3 quality gates (per segment):

- Matched-row rate >= 92%.
- Unresolved rate <= 10%.
- Price observation sample floor met for at least 60% of top recurring units before market value source is allowed to influence scoring.
- Manual review burn-down complete for medium-confidence queue generated during first full-pass ingest.

## Beyond Wave 1 Execution Sprint (Recommended Next 2 Weeks)

1. Seed/normalize missing multi-piston canonicals and aliases from current unresolved leaderboard.
2. Run segment-scoped backfill + observation refresh for `piston_multi`.
3. Recompute market values for `piston_multi` and validate condition-bucket distributions.
4. Publish a multi-piston audit snapshot and unresolved work queue.
5. Open turboprop shadow lane using same pipeline with ingest still gated by confidence threshold.

Definition of done for this sprint:

- `piston_multi` has its own stable audit baseline and work queue.
- Admin telemetry can report segment-level avionics metrics (not only global/piston-single blended views).
- Turboprop shadow data is collected and ready for threshold tuning, without production scoring cutover yet.

## Implementation Sequence

## Phase 0 - Planning and Baseline (1-2 days)

- Create baseline report of current avionics extraction coverage.
- Freeze current `avionics_intelligence.py` behavior for A/B comparison.
- Define acceptance metrics and test set.

## Phase 1 - Schema and Seed (3-4 days)

- Add migrations for new avionics tables.
- Seed initial piston-single catalog and aliases from Tier A/B sources.
- Create data ingestion stubs and provenance tracking.

## Phase 2 - Parser Upgrade (3-5 days)

- Build normalized alias resolver.
- Add quantity and variant extraction.
- Save per-listing observations and unresolved tokens.
- Add tests for real-world noisy listing snippets.

## Phase 3 - Valuation Engine Upgrade (3-5 days)

- Build unit-level value resolver (`OEM/MSRP` first, then `P25` if sample floor met).
- Add conservative install factors and bundle rule logic.
- Compute and store `avionics_market_values` snapshots.

## Phase 4 - Shadow Run and Tuning (3-4 days)

- Run old and new avionics scoring in parallel.
- Compare drift and confidence by listing cohort.
- Tune alias confidence and conservative discounts.

## Phase 5 - Production Cutover (1-2 days)

- Switch `avionics_intelligence.py` to DB-backed sources.
- Keep fallback behavior for sparse units.
- Re-run backfill and validate no score regressions.

## Deliverables

1. `supabase/migrations/20260305000045_add_avionics_catalog_tables.sql`
2. `supabase/migrations/20260305000046_add_avionics_market_value_tables.sql`
3. `supabase/migrations/20260305000047_add_avionics_listing_observations.sql`
4. `scraper/avionics_catalog_builder.py`
5. `scraper/avionics_market_ingest.py`
6. `scraper/audit_avionics_coverage.py`
7. Parser/scoring tests for new extraction and valuation behavior

## Acceptance Criteria

- Parser precision for piston-single gold set >= 92%
- Unresolved-token rate reduced by >= 40% from baseline
- At least 90% of high-frequency piston-single avionics tokens map to canonical units
- No optimistic valuation spikes after conservative policy enforcement
- Score explanations include valuation basis and confidence source

## Verification Commands

```bash
.venv312\Scripts\python.exe scraper\avionics_catalog_builder.py --segment piston_single --dry-run
.venv312\Scripts\python.exe scraper\avionics_market_ingest.py --segment piston_single --dry-run
.venv312\Scripts\python.exe -m pytest scraper\tests\test_avionics_intelligence.py -v
.venv312\Scripts\python.exe scraper\audit_avionics_coverage.py --segment piston_single
.venv312\Scripts\python.exe scraper\backfill_scores.py --all --compute-comps
```

## Open Items to Resolve During Execution

- Final authoritative source for OEM/MSRP normalization fields per manufacturer
- Unit identity strategy for families where model naming changes by generation
  - Decision (2026-03-11): keep generation-suffixed canonicals as distinct units when the market treats them separately (e.g., `GTN 650` vs `GTN 650Xi`), but map high-frequency non-specific tokens as aliases to the closest common family anchor.
  - Decision (2026-03-11): unresolved maintenance/LRU tokens that appear frequently (`GIA63`, `GDC74`) are promoted to canonical units with direct aliases rather than forced onto panel-level navigator units.
- Alias strategy update: shorthand unresolved queue tokens (`KAP150`, `STEC50`, `PMA7/8k`) are normalized via explicit aliases (`KAP150`, `STEC50`, `PMA7`, `PMA8K`) and attached to either a new canonical or the most specific existing canonical.
- Whether to persist one global value per unit or per aircraft segment/version

