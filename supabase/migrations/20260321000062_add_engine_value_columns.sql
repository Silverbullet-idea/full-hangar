-- Add engine value output columns used by intelligence backfill + public view.
ALTER TABLE public.aircraft_listings
  ADD COLUMN IF NOT EXISTS engine_hours_smoh INTEGER,
  ADD COLUMN IF NOT EXISTS engine_remaining_value NUMERIC,
  ADD COLUMN IF NOT EXISTS engine_overrun_liability NUMERIC,
  ADD COLUMN IF NOT EXISTS engine_reserve_per_hour NUMERIC;

COMMENT ON COLUMN public.aircraft_listings.engine_hours_smoh IS
  'Engine hours since major overhaul used in engine value scoring.';

COMMENT ON COLUMN public.aircraft_listings.engine_remaining_value IS
  'Estimated remaining engine value from overhaul exchange pricing and life remaining.';

COMMENT ON COLUMN public.aircraft_listings.engine_overrun_liability IS
  'Estimated overrun liability for engines past TBO based on overhaul exchange pricing.';

COMMENT ON COLUMN public.aircraft_listings.engine_reserve_per_hour IS
  'Recommended reserve-per-hour based on overhaul exchange pricing and TBO.';
