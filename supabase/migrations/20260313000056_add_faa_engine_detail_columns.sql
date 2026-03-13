-- Persist FAA engine detail fields used for powerplant enrichment and scoring fallback.

ALTER TABLE public.aircraft_listings
  ADD COLUMN IF NOT EXISTS faa_engine_model text,
  ADD COLUMN IF NOT EXISTS faa_engine_manufacturer text;

COMMENT ON COLUMN public.aircraft_listings.faa_engine_model IS
  'FAA registry/reference-derived engine model text for conservative enrichment fallback.';

COMMENT ON COLUMN public.aircraft_listings.faa_engine_manufacturer IS
  'FAA registry/reference-derived engine manufacturer text for detail display and audit.';
