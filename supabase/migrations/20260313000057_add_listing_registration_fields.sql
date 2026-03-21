ALTER TABLE public.aircraft_listings
  ADD COLUMN IF NOT EXISTS registration_raw text,
  ADD COLUMN IF NOT EXISTS registration_normalized text,
  ADD COLUMN IF NOT EXISTS registration_scheme text,
  ADD COLUMN IF NOT EXISTS registration_country_code text,
  ADD COLUMN IF NOT EXISTS registration_confidence text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'aircraft_listings_registration_confidence_check'
  ) THEN
    ALTER TABLE public.aircraft_listings
      ADD CONSTRAINT aircraft_listings_registration_confidence_check
      CHECK (
        registration_confidence IS NULL
        OR registration_confidence IN ('high', 'medium', 'low')
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_aircraft_listings_registration_normalized
  ON public.aircraft_listings (registration_normalized);

CREATE INDEX IF NOT EXISTS idx_aircraft_listings_registration_scheme_country
  ON public.aircraft_listings (registration_scheme, registration_country_code);

COMMENT ON COLUMN public.aircraft_listings.registration_raw IS
  'Raw registration/tail token captured from source listing text.';
COMMENT ON COLUMN public.aircraft_listings.registration_normalized IS
  'Canonical normalized registration for US and non-US aircraft.';
COMMENT ON COLUMN public.aircraft_listings.registration_scheme IS
  'Classification scheme (e.g. US_N, CA_C, UK_G, OTHER, UNKNOWN).';
COMMENT ON COLUMN public.aircraft_listings.registration_country_code IS
  'Inferred ISO alpha-2 country code for registration authority when known.';
COMMENT ON COLUMN public.aircraft_listings.registration_confidence IS
  'Parser confidence for registration classification (high|medium|low).';

