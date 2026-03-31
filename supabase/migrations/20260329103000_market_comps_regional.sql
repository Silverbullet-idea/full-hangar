-- Pre-aggregated median price by make/model/US state for regional pricing signals.
-- Populated by scraper/compute_market_comps.py

CREATE TABLE IF NOT EXISTS public.market_comps_regional (
  make text NOT NULL,
  model text NOT NULL,
  state text NOT NULL CHECK (char_length(state) = 2 AND state = upper(state)),
  sample_size integer NOT NULL CHECK (sample_size > 0),
  median_price numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (make, model, state)
);

CREATE INDEX IF NOT EXISTS idx_market_comps_regional_state ON public.market_comps_regional (state);

COMMENT ON TABLE public.market_comps_regional IS
  'Median asking price (plus deferred_total) per make/model/state from active listings; used for regional_price_index in scoring.';
