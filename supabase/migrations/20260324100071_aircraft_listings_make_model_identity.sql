-- Provenance + FAA reference copy for make/model quality program (Phases 3–5).

ALTER TABLE public.aircraft_listings
  ADD COLUMN IF NOT EXISTS make_original text,
  ADD COLUMN IF NOT EXISTS model_original text,
  ADD COLUMN IF NOT EXISTS identity_corrected_at timestamptz,
  ADD COLUMN IF NOT EXISTS identity_correction jsonb,
  ADD COLUMN IF NOT EXISTS faa_ref_make text,
  ADD COLUMN IF NOT EXISTS faa_ref_model text;

COMMENT ON COLUMN public.aircraft_listings.make_original IS
  'Scraper make before identity backfill (set once on first correction).';

COMMENT ON COLUMN public.aircraft_listings.model_original IS
  'Scraper model before identity backfill (set once on first correction).';

COMMENT ON COLUMN public.aircraft_listings.identity_corrected_at IS
  'When make/model/title were last normalized by audit backfill or manual process.';

COMMENT ON COLUMN public.aircraft_listings.identity_correction IS
  'JSON audit: rule id, FAA mfr_mdl_code, prior values, source (faa_ref|curated_rule).';

COMMENT ON COLUMN public.aircraft_listings.faa_ref_make IS
  'FAA ACFTREF mfr_name for matched N-number (informational; enrich_faa).';

COMMENT ON COLUMN public.aircraft_listings.faa_ref_model IS
  'FAA ACFTREF model_name for matched N-number (informational; enrich_faa).';
