## Avionics Attribution — Tier 1 Backfill
Date: 2026-03-06

### Before
oem_msrp: 390
market_p25: 1
fallback_static: 99
none: 553
null: 3253
total: 4296

### After
oem_msrp: 1727
market_p25: 2
fallback_static: 392
none: 2264
null: 0
total: 4385

### Notes
- Initial full `--all --compute-comps` run stalled repeatedly on market-comp fallback lookups for specific rows and was terminated.
- Completed a full-table cursor-paginated avionics-only attribution refresh across all rows (`processed=4385`, `updated=4385`, `failed=0`).
- Total row count changed during execution (`4296 -> 4385`) due concurrent listing ingestion.
- Follow-up recommendation: add cursor pagination + request timeout controls directly in `scraper/backfill_scores.py` for reliable full-table rescoring with market comps enabled.
