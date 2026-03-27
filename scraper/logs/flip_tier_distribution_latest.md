# Flip tier snapshot

- active_rows_scanned: 10536
- rows_with_flip_tier: 5853
- rows_with_flip_score: 5853
- rows_without_flip_tier: 4683

## flip_tier counts

| tier | count | pct |
|------|------:|-----|
| PASS | 5444 | 93.01% |
| FAIR | 251 | 4.29% |
| GOOD | 158 | 2.70% |

## Implied band from flip_score (80/65/50 thresholds)

| band | count |
|------|------:|
| PASS_band_lt_50 | 5444 |
| FAIR_band_ge_50 | 251 |
| GOOD_band_ge_65 | 158 |
