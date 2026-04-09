# Flip tier snapshot

- active_rows_scanned: 10536
- rows_with_flip_tier: 5853
- rows_with_flip_score: 5853
- rows_without_flip_tier: 4683

## flip_tier counts

| tier | count | pct |
|------|------:|-----|
| PASS | 5160 | 88.16% |
| FAIR | 451 | 7.71% |
| GOOD | 242 | 4.13% |

## Implied band from flip_score (80/65/50 thresholds)

| band | count |
|------|------:|
| PASS_band_lt_50 | 5160 |
| FAIR_band_ge_50 | 451 |
| GOOD_band_ge_65 | 242 |
