# Score Distribution Fix - Deployment Runbook

## Status: DEPLOY IN PROGRESS — full backfill running; re-run audit after it finishes

> **Authoritative post-fix audit:** run `audit_score_distribution.py` only after
> `backfill_scores.py --all --compute-comps` completes. A snapshot taken mid-backfill
> will still show mostly the prior `intelligence_version` (e.g. 1.9.2) on most rows.

## Background
Intelligence v1.9.3 fixes score clustering (31.9% of listings at identical score
51.70 in pre-fix baseline, LOW risk nearly unreachable). Changes:
- Age-differentiated imputed component defaults break the single-cluster pattern
- Widened risk tier bands: LOW >= 78, MODERATE 45-77, HIGH 25-44, CRITICAL < 25
- days_on_market tiebreaker nudge (approx +/-2 pts)
- _components_measured tracking in score output

## Pre-deployment checks (Ryan runs these)
[ ] Current backfill (`scraper/backfill_scores.py --all --compute-comps`) has completed
[ ] Run dry-run validator and confirm distribution is spread:
    .venv312\Scripts\python.exe scraper\validate_score_distribution_fix.py
[ ] Confirm unique score count in 50-listing sample is healthy (not a single mass point).
    Note: the sample is **year-ascending (vintage-heavy)** — use the full-fleet audit for LOW-tier and tie-rate gates.
[ ] Optional: confirm at least one listing in the sample reaches LOW tier (>= 78); vintage samples may show none.

## Deployment
.venv312\Scripts\python.exe scraper\backfill_scores.py --all --compute-comps

## Post-deployment verification
One-shot (runs dry validator, writes audit file, then `validate_scores.py`):

```bash
npm run pipeline:score-dist:post-backfill
```

Or manually:

.venv312\Scripts\python.exe scraper\audit_score_distribution.py
-> Save output to: scraper/score_distribution_audit_post_fix.txt
-> Confirm: most common score < 5% of population (was 31.9%)
-> Confirm: LOW risk count > 0
-> Confirm: value_score IS NULL = 0

.venv312\Scripts\python.exe scraper\validate_scores.py

## Rollback (if distribution regresses)
1. In `core/intelligence/aircraft_intelligence.py`:
   Revert INTELLIGENCE_VERSION to prior value
   Revert the scoring assembly changes (use git diff to identify exact lines)
2. .venv312\Scripts\python.exe scraper\backfill_scores.py --all --compute-comps
3. .venv312\Scripts\python.exe scraper\audit_score_distribution.py
