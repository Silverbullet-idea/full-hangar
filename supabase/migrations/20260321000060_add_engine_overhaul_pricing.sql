-- Migration: Add engine overhaul pricing table
-- Source: AirPower Inc. (airpowerinc.com) exchange engine catalog
-- Purpose: Powers engine remaining value and overrun liability scoring

CREATE TABLE IF NOT EXISTS public.engine_overhaul_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Engine identity
  manufacturer TEXT NOT NULL,           -- 'Lycoming' | 'Continental'
  engine_model TEXT NOT NULL,           -- Exact model from listing e.g. 'IO-550-N43B'
  engine_model_normalized TEXT,         -- Normalized for TBO lookup joins e.g. 'IO-550'
  engine_family TEXT,                   -- Series grouping e.g. 'IO-550', 'O-360'
  horsepower INTEGER,                   -- Rated HP if parseable from description
  product_type TEXT DEFAULT 'exchange', -- 'factory_new' | 'rebuilt' | 'overhauled' | 'exchange'

  -- Source product info
  product_sku TEXT,                     -- AirPower part number e.g. 'ENPL-10077'
  product_name TEXT,                    -- Full product name from H1
  short_description TEXT,               -- Product short description

  -- Pricing (USD)
  exchange_price NUMERIC,               -- "Your Price" - cost with core trade-in
  core_charge NUMERIC,                  -- Refundable core deposit
  retail_price NUMERIC,                 -- exchange_price + core_charge (no trade)

  -- Derived
  net_replacement_cost NUMERIC GENERATED ALWAYS AS (exchange_price) STORED,
  -- Note: net_replacement_cost = exchange_price because core is refunded.
  -- Retail_price is the worst-case no-core scenario.

  -- Source tracking
  source TEXT NOT NULL DEFAULT 'airpower',
  source_url TEXT,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for scoring lookups
CREATE INDEX IF NOT EXISTS idx_engine_pricing_manufacturer
  ON public.engine_overhaul_pricing(manufacturer);

CREATE INDEX IF NOT EXISTS idx_engine_pricing_model
  ON public.engine_overhaul_pricing(engine_model);

CREATE INDEX IF NOT EXISTS idx_engine_pricing_normalized
  ON public.engine_overhaul_pricing(engine_model_normalized);

CREATE INDEX IF NOT EXISTS idx_engine_pricing_family
  ON public.engine_overhaul_pricing(engine_family);

-- Unique constraint: one price record per engine model per source
CREATE UNIQUE INDEX IF NOT EXISTS idx_engine_pricing_unique
  ON public.engine_overhaul_pricing(engine_model, source)
  WHERE engine_model IS NOT NULL;

COMMENT ON TABLE public.engine_overhaul_pricing IS
  'Exchange engine pricing from AirPower Inc. Used to calculate engine remaining value and overrun liability in aircraft scoring.';

COMMENT ON COLUMN public.engine_overhaul_pricing.exchange_price IS
  'Price paid with a core trade-in. This is the real replacement cost for most buyers.';

COMMENT ON COLUMN public.engine_overhaul_pricing.core_charge IS
  'Refundable deposit if buyer has no core to exchange. Returned when old engine is shipped.';

COMMENT ON COLUMN public.engine_overhaul_pricing.retail_price IS
  'Total price with no trade-in: exchange_price + core_charge. Worst-case replacement scenario.';
