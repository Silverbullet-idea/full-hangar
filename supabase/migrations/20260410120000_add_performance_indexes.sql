-- Run via: npx supabase db push
--
-- Performance indexes for listings browse and upsert paths.
-- CREATE INDEX IF NOT EXISTS is safe to re-run; some flip_tier/flip_score indexes may overlap
-- prior migrations (e.g. 20260409220000) under different names — review in production if redundant.

-- Primary filter: active listings
CREATE INDEX IF NOT EXISTS idx_listings_is_active
  ON aircraft_listings(is_active)
  WHERE is_active = true;

-- Deal tier filter (legacy column; browse also uses flip_tier — indexed in scoring migrations)
CREATE INDEX IF NOT EXISTS idx_listings_deal_tier
  ON aircraft_listings(deal_tier)
  WHERE is_active = true;

-- Score ordering (default sort)
CREATE INDEX IF NOT EXISTS idx_listings_flip_score
  ON aircraft_listings(flip_score DESC NULLS LAST)
  WHERE is_active = true;

-- Make filter
CREATE INDEX IF NOT EXISTS idx_listings_make
  ON aircraft_listings(make)
  WHERE is_active = true;

-- Price range filter
CREATE INDEX IF NOT EXISTS idx_listings_asking_price
  ON aircraft_listings(asking_price)
  WHERE is_active = true AND asking_price IS NOT NULL;

-- Composite for common browse pattern
CREATE INDEX IF NOT EXISTS idx_listings_active_tier_score
  ON aircraft_listings(is_active, deal_tier, flip_score DESC NULLS LAST)
  WHERE is_active = true;

-- Source upsert / dedupe
CREATE INDEX IF NOT EXISTS idx_listings_source
  ON aircraft_listings(source_site, source_listing_id);
