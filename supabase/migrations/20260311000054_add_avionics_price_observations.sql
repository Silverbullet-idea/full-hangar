-- 2026-03-11: Add raw avionics price observations + summary view
-- Tracks multi-source pricing observations used for conservative P25/median valuation.

CREATE TABLE IF NOT EXISTS avionics_price_observations (
  id                  BIGSERIAL PRIMARY KEY,
  unit_id             BIGINT REFERENCES avionics_units(id) ON DELETE CASCADE,
  canonical_name      TEXT,
  manufacturer        TEXT,
  model               TEXT,
  part_number         TEXT,
  observed_price      NUMERIC,
  currency            TEXT DEFAULT 'USD',
  condition           TEXT,
  source_name         TEXT NOT NULL,
  source_url          TEXT,
  source_type         TEXT NOT NULL,
  listing_title       TEXT,
  raw_description     TEXT,
  scraped_at          TIMESTAMPTZ DEFAULT NOW(),
  is_active           BOOLEAN DEFAULT TRUE,
  notes               TEXT
);

CREATE INDEX IF NOT EXISTS idx_price_obs_unit_id      ON avionics_price_observations(unit_id);
CREATE INDEX IF NOT EXISTS idx_price_obs_source       ON avionics_price_observations(source_name);
CREATE INDEX IF NOT EXISTS idx_price_obs_manufacturer ON avionics_price_observations(manufacturer);
CREATE INDEX IF NOT EXISTS idx_price_obs_model        ON avionics_price_observations(model);
CREATE INDEX IF NOT EXISTS idx_price_obs_part_number  ON avionics_price_observations(part_number);

COMMENT ON TABLE avionics_price_observations IS
  'Raw price observations from used avionics dealers and capability lists. '
  'Used to compute conservative median/P25 values for avionics_market_values. '
  'Multiple rows per unit are expected and intentional.';

-- View: computed conservative values from multi-source observations
CREATE OR REPLACE VIEW avionics_price_summary AS
SELECT
  unit_id,
  canonical_name,
  manufacturer,
  model,
  source_type,
  COUNT(*)                                            AS sample_count,
  MIN(observed_price)                                 AS price_min,
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY observed_price) AS price_p25,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY observed_price) AS price_median,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY observed_price) AS price_p75,
  MAX(observed_price)                                 AS price_max,
  MAX(scraped_at)                                     AS last_observed
FROM avionics_price_observations
WHERE is_active = TRUE
  AND observed_price > 0
  AND observed_price < 500000
GROUP BY unit_id, canonical_name, manufacturer, model, source_type;

COMMENT ON VIEW avionics_price_summary IS
  'Computed price statistics per avionics unit. '
  'P25 is the conservative anchor per project valuation policy.';
