CREATE TABLE IF NOT EXISTS deal_desk_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'Base Case',

  -- Pre-populated inputs (pulled from listing at creation, editable)
  asking_price NUMERIC,
  deferred_maintenance NUMERIC DEFAULT 0,

  -- User-entered cost inputs
  avionics_upgrade_budget NUMERIC DEFAULT 0,
  paint_interior_budget NUMERIC DEFAULT 0,
  ferry_flight_cost NUMERIC DEFAULT 0,
  hold_period_months INTEGER DEFAULT 3,
  title_escrow_fees NUMERIC DEFAULT 800,

  -- Derived (computed client-side, stored for persistence)
  insurance_estimate NUMERIC DEFAULT 0,
  total_acquisition_cost NUMERIC,
  estimated_resale_price NUMERIC,
  profit_at_ask NUMERIC,
  profit_percent_at_ask NUMERIC,

  -- Target return (user-set dial)
  target_profit_dollars NUMERIC DEFAULT 8000,

  -- Computed max offer given target
  max_offer_price NUMERIC,

  -- Metadata
  source_listing_url TEXT,
  aircraft_label TEXT, -- e.g. "2001 Cessna 172S N12345"
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_desk_listing_id
  ON deal_desk_scenarios(listing_id);

CREATE INDEX IF NOT EXISTS idx_deal_desk_created_at
  ON deal_desk_scenarios(created_at DESC);
