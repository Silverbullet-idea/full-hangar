-- Case-insensitive ordering for filter dropdowns (Cessna vs CESSNA adjacent after data cleanup).

CREATE OR REPLACE FUNCTION public.get_listing_filter_options_payload()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
WITH active AS MATERIALIZED (
  SELECT
    NULLIF(btrim(al.make), '') AS make,
    NULLIF(btrim(al.model), '') AS model,
    NULLIF(
      upper(btrim(COALESCE(NULLIF(al.location_state, ''), NULLIF(al.state, '')))),
      ''
    ) AS state,
    COALESCE(NULLIF(btrim(al.source), ''), NULLIF(btrim(al.source_site), ''), '') AS source_raw,
    NULLIF(upper(btrim(al.deal_tier)), '') AS deal_tier,
    CASE
      WHEN al.value_score IS NULL THEN NULL
      WHEN btrim(al.value_score::text) ~ '^-?\d+(\.\d+)?$' THEN btrim(al.value_score::text)::numeric
      ELSE NULL
    END AS value_score
  FROM public.aircraft_listings al
  WHERE al.is_active IS TRUE
),
norm AS MATERIALIZED (
  SELECT
    make,
    model,
    state,
    public._normalize_listing_source_key(source_raw) AS source,
    deal_tier,
    value_score,
    (
      make IS NOT NULL
      AND length(make) > 0
      AND upper(make) NOT IN ('-', 'N/A', 'UNKNOWN')
    ) AS valid_make
  FROM active
),
counts AS (
  SELECT
    (SELECT count(*)::int FROM norm) AS all_count,
    (SELECT count(*)::int FROM norm WHERE value_score IS NOT NULL AND value_score >= 60) AS score60,
    (SELECT count(*)::int FROM norm WHERE value_score IS NOT NULL AND value_score >= 80) AS score80
)
SELECT jsonb_build_object(
  'makes',
  (
    SELECT COALESCE(jsonb_agg(q.make ORDER BY lower(q.make), q.make), '[]'::jsonb)
    FROM (SELECT DISTINCT make AS make FROM norm WHERE valid_make) q
  ),
  'models',
  (
    SELECT COALESCE(jsonb_agg(q.model ORDER BY lower(q.model), q.model), '[]'::jsonb)
    FROM (SELECT DISTINCT model AS model FROM norm WHERE model IS NOT NULL) q
  ),
  'states',
  (
    SELECT COALESCE(jsonb_agg(q.state ORDER BY q.state), '[]'::jsonb)
    FROM (SELECT DISTINCT state AS state FROM norm WHERE state IS NOT NULL) q
  ),
  'modelPairs',
  (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object('make', q.make, 'model', q.model)
        ORDER BY lower(q.make), q.make, lower(q.model), q.model
      ),
      '[]'::jsonb
    )
    FROM (SELECT make, model FROM norm WHERE valid_make AND model IS NOT NULL GROUP BY make, model) q
  ),
  'makeCounts',
  (
    SELECT COALESCE(jsonb_object_agg(make, cnt), '{}'::jsonb)
    FROM (SELECT make, count(*)::int AS cnt FROM norm WHERE valid_make GROUP BY make) q
  ),
  'modelCounts',
  (
    SELECT COALESCE(jsonb_object_agg(model, cnt), '{}'::jsonb)
    FROM (SELECT model, count(*)::int AS cnt FROM norm WHERE model IS NOT NULL GROUP BY model) q
  ),
  'modelPairCounts',
  (
    SELECT COALESCE(jsonb_object_agg(k, cnt), '{}'::jsonb)
    FROM (
      SELECT (make || '|||' || model) AS k, count(*)::int AS cnt
      FROM norm
      WHERE valid_make AND model IS NOT NULL
      GROUP BY make, model
    ) q
  ),
  'sourceCounts',
  (
    SELECT COALESCE(jsonb_object_agg(source, cnt), '{}'::jsonb)
    FROM (SELECT source, count(*)::int AS cnt FROM norm GROUP BY source) q
  ),
  'dealTierCounts',
  jsonb_build_object(
    'all',
    (SELECT all_count FROM counts),
    'TOP_DEALS',
    (SELECT count(*)::int FROM norm WHERE deal_tier IN ('EXCEPTIONAL_DEAL', 'GOOD_DEAL')),
    'EXCEPTIONAL_DEAL',
    (SELECT count(*)::int FROM norm WHERE deal_tier = 'EXCEPTIONAL_DEAL'),
    'GOOD_DEAL',
    (SELECT count(*)::int FROM norm WHERE deal_tier = 'GOOD_DEAL'),
    'FAIR_MARKET',
    (SELECT count(*)::int FROM norm WHERE deal_tier = 'FAIR_MARKET'),
    'ABOVE_MARKET',
    (SELECT count(*)::int FROM norm WHERE deal_tier = 'ABOVE_MARKET'),
    'OVERPRICED',
    (SELECT count(*)::int FROM norm WHERE deal_tier = 'OVERPRICED')
  ),
  'minimumValueScoreCounts',
  jsonb_build_object(
    'any',
    (SELECT all_count FROM counts),
    '60',
    (SELECT score60 FROM counts),
    '80',
    (SELECT score80 FROM counts)
  )
);
$$;

REVOKE ALL ON FUNCTION public.get_listing_filter_options_payload() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_listing_filter_options_payload() TO service_role;
