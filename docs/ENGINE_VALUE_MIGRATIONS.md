# Engine value — DB / view alignment

These migrations wire `public_listings` and base columns so `ev_*` fields match `aircraft_listings` / `score_data.engine_value` where applicable.

## Apply on target Supabase (if not already applied)

Run in chronological order; **skip any file already in remote migration history**.

1. `20260321000062_add_engine_value_columns.sql` — adds engine-value columns on `aircraft_listings` (if missing).
2. `20260321000061_update_public_listings_engine_value.sql` — earlier `public_listings` view shape for engine value.
3. `20260322000065_public_listings_engine_value_fields.sql` — current `public_listings` view including `ev_*` extraction from `score_data`.

Verify with:

```sql
-- Expect columns on view when introspecting public_listings
SELECT ev_data_quality, ev_hours_smoh FROM public_listings LIMIT 1;
```

## App fallback (no migration required)

`lib/db/listingsRepository.ts` derives `ev_*` from top-level `engine_*` columns when the view still returns nulls (sync lag). Migrations remain the source of truth for long-term consistency.

## Related (separate tracks)

Engine overhaul pricing / TBO reference expansions use other migrations (e.g. `20260321000060_*`, `20260321000063_*`, `20260321000064_*`). Apply those per your scoring/backfill pipeline, not strictly required for the listings UI fallback path.
