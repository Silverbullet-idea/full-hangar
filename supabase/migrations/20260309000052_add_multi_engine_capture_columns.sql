ALTER TABLE public.aircraft_listings
ADD COLUMN IF NOT EXISTS engine_count INTEGER,
ADD COLUMN IF NOT EXISTS second_engine_time_since_overhaul NUMERIC,
ADD COLUMN IF NOT EXISTS second_time_since_prop_overhaul NUMERIC,
ADD COLUMN IF NOT EXISTS engines_raw JSONB,
ADD COLUMN IF NOT EXISTS props_raw JSONB;

CREATE INDEX IF NOT EXISTS idx_aircraft_listings_engine_count
  ON public.aircraft_listings (engine_count);
