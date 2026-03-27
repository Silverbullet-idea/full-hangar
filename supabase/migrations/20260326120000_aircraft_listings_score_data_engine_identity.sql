-- Persist scoring JSON and listing-level engine identity fields expected by backfill_scores / PostgREST.
-- Fixes "column not found" retries when score_data, engine_manufacturer, or engine_make were missing.

ALTER TABLE public.aircraft_listings
  ADD COLUMN IF NOT EXISTS score_data JSONB;

ALTER TABLE public.aircraft_listings
  ADD COLUMN IF NOT EXISTS engine_manufacturer TEXT;

ALTER TABLE public.aircraft_listings
  ADD COLUMN IF NOT EXISTS engine_make TEXT;

COMMENT ON COLUMN public.aircraft_listings.score_data IS
  'Structured scoring payload (engine_reference, engine_value block, etc.) merged during backfill_scores.';

COMMENT ON COLUMN public.aircraft_listings.engine_manufacturer IS
  'Normalized engine OEM label when distinct from FAA/registry text.';

COMMENT ON COLUMN public.aircraft_listings.engine_make IS
  'Alternate engine make field for listings that split OEM vs model sources.';
