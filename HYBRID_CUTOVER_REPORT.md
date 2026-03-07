# Hybrid Scoring Cutover Report

Date: March 6-7, 2026  
Owner: BACKEND  
Scope: Hybrid scoring reset (fast cutover) for `core/intelligence/aircraft_intelligence.py`

## Cutover Summary

- Replaced the prior default-heavy score path with a hybrid-calibrated scoring composition.
- Preserved hard safety overrides (FAA registration alerts, LLP unairworthy conditions, NTSB severe damage rules).
- Added sparse-data fallback bands to reduce single-score clustering.
- Added calibration diagnostics in backfill runs for:
  - deal comparison source mix,
  - data confidence mix,
  - avionics value-source mix.

## What Changed

- Hybrid profile and calibrated score assembly implemented in:
  - `core/intelligence/aircraft_intelligence.py`
- Backfill diagnostics added in:
  - `scraper/backfill_scores.py`
- Intelligence version bump:
  - `INTELLIGENCE_VERSION: 1.7.0 -> 1.8.0`

## Validation Results

### Test Gates

- `python -m pytest scraper/tests/test_description_parser.py -v`
  - Result: 18/18 passed
- `python scraper/tests/test_intelligence.py`
  - Result: all test cases passed after hybrid-profile tuning

### Bounded Validation Runs

- Baseline before bounded hybrid validation (v1.7.0 population snapshot):
  - rows: 999
  - `value_score = 58.0`: 426
  - `value_score = 58.0` with `avionics_value_source_primary=none`: 426
  - `value_score IS NULL`: 0
  - risk mix: LOW 0 / MODERATE 962 / HIGH 3 / CRITICAL 34

- Bounded run #1 (`--all --limit 500 --compute-comps`):
  - attempted/scored/updated/failed: 500/500/500/0
  - `value_score = 58.0`: 210
  - risk mix: LOW 0 / MODERATE 928 / HIGH 39 / CRITICAL 32

- Bounded run #2 (`--all --limit 500 --compute-comps`):
  - attempted/scored/updated/failed: 500/500/500/0
  - `value_score = 58.0`: 210 (stable)
  - `value_score IS NULL`: 0 (maintained)

### Full Cutover State (v1.8.0)

- All listings now on new version:
  - total listings: 999
  - `intelligence_version=1.8.0`: 999
- Market comps recompute:
  - `python scraper/compute_market_comps.py`
  - Result: `computed_groups=30`, `upserted=30`
- Full validator:
  - `python scraper/validate_scores.py`
  - Result highlights:
    - total scored: 999
    - unique score values: 181
    - most common score: 51.70 (28.6%)
    - risk mix: LOW 0 / MODERATE 883 / HIGH 87 / CRITICAL 29
    - `value_score IS NULL`: 0

## Operational Notes

- Full unbounded backfill initially stalled twice during long execution windows.
- Resume-from-checkpoint path was used successfully to continue progress:
  - `scraper/backfill_scores.py --all --compute-comps --resume-from-checkpoint`
- Final version audit + market comps recompute confirm cutover completion.

## Rollback Commands (If Needed)

Use these only if business review rejects v1.8.0 behavior.

1) Revert scorer version constant in `core/intelligence/aircraft_intelligence.py`:
- `INTELLIGENCE_VERSION = "1.8.0"` -> `INTELLIGENCE_VERSION = "1.7.0"`

2) Re-run full score backfill:
- `.venv312\Scripts\python.exe scraper\backfill_scores.py --all --compute-comps`

3) Recompute market comps (explicit pass):
- `.venv312\Scripts\python.exe scraper\compute_market_comps.py`

4) Validate rollback state:
- `.venv312\Scripts\python.exe scraper\validate_scores.py`

5) Confirm version distribution:
- verify all rows report `intelligence_version=1.7.0` before reopening normal operations.
