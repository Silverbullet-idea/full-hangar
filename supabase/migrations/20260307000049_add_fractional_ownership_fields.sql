ALTER TABLE public.aircraft_listings
ADD COLUMN IF NOT EXISTS is_fractional_ownership BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS fractional_share_numerator INTEGER,
ADD COLUMN IF NOT EXISTS fractional_share_denominator INTEGER,
ADD COLUMN IF NOT EXISTS fractional_share_percent NUMERIC,
ADD COLUMN IF NOT EXISTS fractional_share_price NUMERIC,
ADD COLUMN IF NOT EXISTS fractional_full_price_estimate NUMERIC,
ADD COLUMN IF NOT EXISTS fractional_review_needed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS fractional_pricing_evidence JSONB;

CREATE INDEX IF NOT EXISTS idx_aircraft_listings_fractional_ownership
  ON public.aircraft_listings (is_fractional_ownership);

