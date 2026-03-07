# Avionics Expansion Cutover Report

Date: March 5, 2026
Owner: BACKEND
Scope: Task 11 (Avionics catalog + conservative valuation expansion) production cutover hardening

## Cutover Summary

- Completed parser/canonical catalog expansion for `piston_single` and `piston_multi`.
- Added capability-level units to reduce unresolved generic avionics phrases.
- Seeded conservative OEM/MSRP anchors and enforced source-priority logic in valuation ingest.
- Added and verified avionics attribution columns on `aircraft_listings`.
- Re-ran bounded production scoring pass with comparables and no warning/error signatures.

## Validation Results

- `scraper/backfill_scores.py --all --compute-comps --limit 200`
  - attempted: 200
  - scored: 200
  - updated: 200
  - failed: 0
  - archived log: `logs/avionics_cutover_backfill_retry_20260305_221710.log`
- Retry hardening:
  - Added transient update retry handling for intermittent Supabase 500/Cloudflare responses in `scraper/backfill_scores.py`.
  - Removed prior bounded-run row update failures (`failed=2` -> `failed=0`) without changing score logic.
- Coverage audit (`scraper/audit_avionics_coverage.py`)
  - matched_rate_pct: 100.0
  - unresolved_rows: 0
- Attribution shift after capability/OEM hardening:
  - `oem_msrp`: 364 listings (8.89%)
  - `fallback_static`: 121 listings (2.95%)

## Guardrail Verification

- Parser tests: pass (including dense alias variants)
- Avionics scoring tests: pass
- New guardrail test verifies capability aliases (`WAAS`, `ADS-B Out`, `Engine Monitor`) can resolve via OEM-seeded source mix and maintain `market_value_source_primary = oem_msrp`.

## Operational Readiness

- No inbox-driven pipeline dependencies are required for avionics scoring cutover.

## Remaining Human-Required Step

- None for the avionics cutover scope.
