-- Conservative turbine exchange anchors for engine-value scoring (coverage_seed_turbine_wave).
-- Prices are rough planning defaults; replace with sourced quotes when available.
-- Skips rows that already exist for the same (engine_model, source).

INSERT INTO public.engine_overhaul_pricing (
  manufacturer,
  engine_model,
  engine_model_normalized,
  engine_family,
  product_type,
  exchange_price,
  source
)
SELECT v.manufacturer, v.engine_model, v.engine_model_normalized, v.engine_family, v.product_type, v.exchange_price, v.source
FROM (
  VALUES
    ('Pratt & Whitney'::text, 'JT15D'::text, 'JT15D'::text, 'JT15D'::text, 'exchange'::text, 285000::numeric, 'coverage_seed_turbine_wave'::text),
    ('Pratt & Whitney Canada', 'PT6A-42', 'PT6A-42', 'PT6A', 'exchange', 450000, 'coverage_seed_turbine_wave'),
    ('Pratt & Whitney Canada', 'PT6A-52', 'PT6A-52', 'PT6A', 'exchange', 480000, 'coverage_seed_turbine_wave'),
    ('Honeywell', 'AS907', 'AS907', 'AS907', 'exchange', 550000, 'coverage_seed_turbine_wave'),
    ('Honeywell', 'HTF7700', 'HTF7700', 'HTF7700', 'exchange', 650000, 'coverage_seed_turbine_wave')
) AS v(manufacturer, engine_model, engine_model_normalized, engine_family, product_type, exchange_price, source)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.engine_overhaul_pricing e
  WHERE e.engine_model = v.engine_model
    AND e.source = v.source
);
