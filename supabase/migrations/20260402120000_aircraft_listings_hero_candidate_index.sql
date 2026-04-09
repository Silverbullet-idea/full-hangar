-- Speed up home hero candidate scan: avoid scanning public_listings view for flip_score + price filters.

CREATE INDEX IF NOT EXISTS idx_aircraft_listings_hero_flip_price_active
  ON public.aircraft_listings (flip_score DESC NULLS LAST)
  WHERE is_active = TRUE
    AND flip_score IS NOT NULL
    AND flip_score > 60
    AND asking_price IS NOT NULL
    AND asking_price > 60000;

COMMENT ON INDEX public.idx_aircraft_listings_hero_flip_price_active IS
  'Partial index for marketing home hero: active, flip_score > 60, asking_price > 60k, ordered by flip_score.';
