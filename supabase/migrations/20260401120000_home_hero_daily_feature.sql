-- One row per UTC calendar day: which listing was featured on the marketing home hero.
-- Used to rotate the hero and avoid repeating the same aircraft for 30 days.

CREATE TABLE IF NOT EXISTS public.home_hero_daily_feature (
  featured_date date PRIMARY KEY,
  listing_id uuid NOT NULL REFERENCES public.aircraft_listings (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_home_hero_daily_feature_listing
  ON public.home_hero_daily_feature (listing_id);

ALTER TABLE public.home_hero_daily_feature ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.home_hero_daily_feature IS
  'Marketing home hero: chosen listing per UTC day; 30-day lookback excludes repeats. Written by Next.js (service role).';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_hero_daily_feature TO service_role;
