-- Phase 4: Intelligence score columns on aircraft_listings
-- Run this in Supabase SQL Editor if your table doesn't have these columns yet.
-- Then run: python scraper/backfill_scores.py

ALTER TABLE aircraft_listings
  ADD COLUMN IF NOT EXISTS engine_score numeric,
  ADD COLUMN IF NOT EXISTS prop_score numeric,
  ADD COLUMN IF NOT EXISTS llp_score numeric,
  ADD COLUMN IF NOT EXISTS value_score numeric,
  ADD COLUMN IF NOT EXISTS deferred_total integer,
  ADD COLUMN IF NOT EXISTS true_cost integer,
  ADD COLUMN IF NOT EXISTS risk_level text;

COMMENT ON COLUMN aircraft_listings.engine_score IS '0-100 engine life score from aircraft intelligence';
COMMENT ON COLUMN aircraft_listings.prop_score IS '0-100 propeller life score';
COMMENT ON COLUMN aircraft_listings.llp_score IS '0-100 life-limited parts score';
COMMENT ON COLUMN aircraft_listings.value_score IS '0-100 full value score (engine, prop, llp, deferred impact)';
COMMENT ON COLUMN aircraft_listings.deferred_total IS 'Estimated deferred maintenance cost (USD)';
COMMENT ON COLUMN aircraft_listings.true_cost IS 'Asking price + deferred_total';
COMMENT ON COLUMN aircraft_listings.risk_level IS 'LOW | MODERATE | HIGH | CRITICAL';

-- Example queries for frontend:
-- Sort by highest deferred liability:
--   SELECT * FROM aircraft_listings WHERE deferred_total IS NOT NULL ORDER BY deferred_total DESC NULLS LAST;
-- Filter CRITICAL risk:
--   SELECT * FROM aircraft_listings WHERE risk_level = 'CRITICAL';
-- Filter engine under 25% life (score < 25):
--   SELECT * FROM aircraft_listings WHERE engine_score IS NOT NULL AND engine_score < 25;
-- Hidden deals (low asking, high value score):
--   SELECT * FROM aircraft_listings WHERE value_score >= 70 AND asking_price IS NOT NULL ORDER BY value_score DESC, asking_price ASC;
