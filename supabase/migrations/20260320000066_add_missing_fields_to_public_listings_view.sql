-- Added columns by group:
-- Group 1 (Accident / NTSB): accident_count, most_recent_accident_date, most_severe_damage, has_accident_history
-- Group 2 (FAA panel): faa_matched, faa_owner, faa_status, faa_cert_date, faa_type_aircraft
-- Group 3 (Scoring): investment_score, market_opportunity_score, execution_score, condition_score,
--                    pricing_confidence, comp_selection_tier, comp_universe_size, comp_exact_count,
--                    comp_family_count, comp_make_count, comp_median_price, comp_p25_price,
--                    comp_p75_price, mispricing_zscore
-- Group 4 (Attribution): deal_comparison_source, manufacturer_tier
-- SKIPPED: none (all requested columns exist on aircraft_listings)
-- Column existence check output:
-- [group1] existing: accident_count, most_recent_accident_date, most_severe_damage, has_accident_history
-- [group2] existing: faa_matched, faa_owner, faa_status, faa_cert_date, faa_type_aircraft
-- [group3] existing: investment_score, market_opportunity_score, execution_score, condition_score, pricing_confidence, comp_selection_tier, comp_universe_size, comp_exact_count, comp_family_count, comp_make_count, comp_median_price, comp_p25_price, comp_p75_price, mispricing_zscore
-- [group4] existing: deal_comparison_source, manufacturer_tier

CREATE OR REPLACE VIEW public.public_listings AS
WITH base AS (
  SELECT
    id,
    to_jsonb(al) AS j
  FROM public.aircraft_listings AS al
)
SELECT
  id::text AS id,
  NULLIF(j ->> 'title', '') AS title,
  CASE
    WHEN NULLIF(j ->> 'year', '') ~ '^\d{4}$' THEN (j ->> 'year')::integer
    ELSE NULL
  END AS year,
  NULLIF(j ->> 'make', '') AS make,
  NULLIF(j ->> 'model', '') AS model,
  COALESCE(NULLIF(j ->> 'source', ''), NULLIF(j ->> 'source_site', '')) AS source,
  NULLIF(j ->> 'source_id', '') AS source_id,
  COALESCE(NULLIF(j ->> 'source_url', ''), NULLIF(j ->> 'url', '')) AS url,
  COALESCE(NULLIF(j ->> 'source_url', ''), NULLIF(j ->> 'url', '')) AS listing_url,
  CASE
    WHEN COALESCE(NULLIF(j ->> 'asking_price', ''), NULLIF(j ->> 'price_asking', '')) ~ '^-?\d+(\.\d+)?$'
      THEN COALESCE(NULLIF(j ->> 'asking_price', ''), NULLIF(j ->> 'price_asking', ''))::numeric
    ELSE NULL
  END AS price_asking,
  CASE
    WHEN COALESCE(NULLIF(j ->> 'asking_price', ''), NULLIF(j ->> 'price_asking', '')) ~ '^-?\d+(\.\d+)?$'
      THEN COALESCE(NULLIF(j ->> 'asking_price', ''), NULLIF(j ->> 'price_asking', ''))::numeric
    ELSE NULL
  END AS asking_price,
  CASE
    WHEN NULLIF(j ->> 'value_score', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'value_score')::numeric
    ELSE NULL
  END AS value_score,
  CASE
    WHEN NULLIF(j ->> 'engine_score', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'engine_score')::numeric
    ELSE NULL
  END AS engine_score,
  CASE
    WHEN NULLIF(j ->> 'prop_score', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'prop_score')::numeric
    ELSE NULL
  END AS prop_score,
  CASE
    WHEN NULLIF(j ->> 'llp_score', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'llp_score')::numeric
    ELSE NULL
  END AS llp_score,
  CASE
    WHEN NULLIF(j ->> 'avionics_score', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'avionics_score')::numeric
    ELSE NULL
  END AS avionics_score,
  CASE
    WHEN NULLIF(j ->> 'avionics_installed_value', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'avionics_installed_value')::numeric
    ELSE NULL
  END AS avionics_installed_value,
  CASE
    WHEN NULLIF(j ->> 'total_modification_value', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'total_modification_value')::numeric
    ELSE NULL
  END AS total_modification_value,
  CASE
    WHEN NULLIF(j ->> 'stc_market_value_premium_total', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'stc_market_value_premium_total')::numeric
    ELSE NULL
  END AS stc_market_value_premium_total,
  CASE
    WHEN LOWER(NULLIF(j ->> 'has_glass_cockpit', '')) IN ('true', 'false') THEN (j ->> 'has_glass_cockpit')::boolean
    ELSE NULL
  END AS has_glass_cockpit,
  CASE
    WHEN LOWER(NULLIF(j ->> 'is_steam_gauge', '')) IN ('true', 'false') THEN (j ->> 'is_steam_gauge')::boolean
    ELSE NULL
  END AS is_steam_gauge,
  CASE
    WHEN jsonb_typeof(j -> 'avionics_matched_items') = 'array' THEN (j -> 'avionics_matched_items')
    ELSE '[]'::jsonb
  END AS avionics_matched_items,
  CASE
    WHEN jsonb_typeof(j -> 'stc_modifications') = 'array' THEN (j -> 'stc_modifications')
    ELSE '[]'::jsonb
  END AS stc_modifications,
  UPPER(NULLIF(j ->> 'risk_level', '')) AS risk_level,
  CASE
    WHEN NULLIF(j ->> 'deal_rating', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'deal_rating')::numeric
    ELSE NULL
  END AS deal_rating,
  UPPER(NULLIF(j ->> 'deal_tier', '')) AS deal_tier,
  CASE
    WHEN NULLIF(j ->> 'vs_median_price', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'vs_median_price')::numeric
    ELSE NULL
  END AS vs_median_price,
  CASE
    WHEN NULLIF(j ->> 'comps_sample_size', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'comps_sample_size')::integer
    ELSE NULL
  END AS comps_sample_size,
  CASE
    WHEN NULLIF(j ->> 'deferred_total', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'deferred_total')::numeric
    ELSE NULL
  END AS deferred_total,
  CASE
    WHEN NULLIF(j ->> 'true_cost', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'true_cost')::numeric
    ELSE NULL
  END AS true_cost,
  NULLIF(j ->> 'intelligence_version', '') AS intelligence_version,
  NULLIF(j ->> 'location_city', '') AS location_city,
  NULLIF(j ->> 'location_state', '') AS location_state,
  COALESCE(
    NULLIF(j ->> 'location_raw', ''),
    NULLIF(j ->> 'location_label', ''),
    NULLIF(CONCAT_WS(', ', NULLIF(j ->> 'location_city', ''), NULLIF(j ->> 'location_state', '')), '')
  ) AS location_label,
  NULLIF(j ->> 'n_number', '') AS n_number,
  CASE
    WHEN LOWER(NULLIF(j ->> 'is_active', '')) IN ('true', 'false') THEN (j ->> 'is_active')::boolean
    ELSE NULL
  END AS is_active,
  CASE
    WHEN NULLIF(j ->> 'days_on_market', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'days_on_market')::integer
    ELSE NULL
  END AS days_on_market,
  CASE
    WHEN LOWER(NULLIF(j ->> 'price_reduced', '')) IN ('true', 'false') THEN (j ->> 'price_reduced')::boolean
    ELSE NULL
  END AS price_reduced,
  CASE
    WHEN NULLIF(j ->> 'price_reduced_date', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN (j ->> 'price_reduced_date')::date
    ELSE NULL
  END AS price_reduced_date,
  CASE
    WHEN NULLIF(j ->> 'price_reduction_amount', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'price_reduction_amount')::integer
    ELSE NULL
  END AS price_reduction_amount,
  CASE
    WHEN NULLIF(j ->> 'first_seen_date', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN (j ->> 'first_seen_date')::date
    ELSE NULL
  END AS first_seen_date,
  CASE
    WHEN NULLIF(j ->> 'last_seen_date', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN (j ->> 'last_seen_date')::date
    ELSE NULL
  END AS last_seen_date,
  NULLIF(j ->> 'serial_number', '') AS serial_number,
  NULLIF(j ->> 'primary_image_url', '') AS primary_image_url,
  CASE
    WHEN jsonb_typeof(j -> 'image_urls') = 'array' THEN (j -> 'image_urls')
    ELSE '[]'::jsonb
  END AS image_urls,
  CASE
    WHEN jsonb_typeof(j -> 'logbook_urls') = 'array' THEN (j -> 'logbook_urls')
    ELSE '[]'::jsonb
  END AS logbook_urls,
  NULLIF(j ->> 'listing_fingerprint', '') AS listing_fingerprint,
  NULLIF(j ->> 'faa_registration_alert', '') AS faa_registration_alert,
  NULLIF(j ->> 'description', '') AS description,
  NULLIF(j ->> 'description_full', '') AS description_full,
  CASE
    WHEN NULLIF(j ->> 'total_time_airframe', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'total_time_airframe')::numeric
    ELSE NULL
  END AS total_time_airframe,
  CASE
    WHEN COALESCE(NULLIF(j ->> 'engine_time_since_overhaul', ''), NULLIF(j ->> 'time_since_overhaul', '')) ~ '^-?\d+(\.\d+)?$'
      THEN COALESCE(NULLIF(j ->> 'engine_time_since_overhaul', ''), NULLIF(j ->> 'time_since_overhaul', ''))::numeric
    ELSE NULL
  END AS engine_time_since_overhaul,
  CASE
    WHEN COALESCE(NULLIF(j ->> 'engine_time_since_overhaul', ''), NULLIF(j ->> 'time_since_overhaul', '')) ~ '^-?\d+(\.\d+)?$'
      THEN COALESCE(NULLIF(j ->> 'engine_time_since_overhaul', ''), NULLIF(j ->> 'time_since_overhaul', ''))::numeric
    ELSE NULL
  END AS time_since_overhaul,
  CASE
    WHEN NULLIF(j ->> 'engine_tbo_hours', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'engine_tbo_hours')::numeric
    ELSE NULL
  END AS engine_tbo_hours,
  CASE
    WHEN NULLIF(j ->> 'time_since_new_engine', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'time_since_new_engine')::numeric
    ELSE NULL
  END AS time_since_new_engine,
  CASE
    WHEN NULLIF(j ->> 'time_since_prop_overhaul', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'time_since_prop_overhaul')::numeric
    ELSE NULL
  END AS time_since_prop_overhaul,
  NULLIF(j ->> 'registration_raw', '') AS registration_raw,
  NULLIF(j ->> 'registration_normalized', '') AS registration_normalized,
  UPPER(NULLIF(j ->> 'registration_scheme', '')) AS registration_scheme,
  UPPER(NULLIF(j ->> 'registration_country_code', '')) AS registration_country_code,
  LOWER(NULLIF(j ->> 'registration_confidence', '')) AS registration_confidence,
  CASE
    WHEN COALESCE(NULLIF(j ->> 'engine_hours_smoh', ''), NULLIF(j ->> 'engine_time_since_overhaul', ''), NULLIF(j ->> 'time_since_overhaul', '')) ~ '^-?\d+(\.\d+)?$'
      THEN COALESCE(NULLIF(j ->> 'engine_hours_smoh', ''), NULLIF(j ->> 'engine_time_since_overhaul', ''), NULLIF(j ->> 'time_since_overhaul', ''))::integer
    ELSE NULL
  END AS engine_hours_smoh,
  CASE
    WHEN NULLIF(j ->> 'engine_remaining_value', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'engine_remaining_value')::numeric
    ELSE NULL
  END AS engine_remaining_value,
  CASE
    WHEN NULLIF(j ->> 'engine_overrun_liability', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'engine_overrun_liability')::numeric
    ELSE NULL
  END AS engine_overrun_liability,
  CASE
    WHEN NULLIF(j ->> 'engine_reserve_per_hour', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'engine_reserve_per_hour')::numeric
    ELSE NULL
  END AS engine_reserve_per_hour,
  CASE
    WHEN NULLIF(j #>> '{score_data,engine_value,engine_hours_smoh}', '') ~ '^-?\d+(\.\d+)?$'
      THEN (j #>> '{score_data,engine_value,engine_hours_smoh}')::integer
    ELSE NULL
  END AS ev_hours_smoh,
  CASE
    WHEN NULLIF(j #>> '{score_data,engine_value,tbo_hours}', '') ~ '^-?\d+(\.\d+)?$'
      THEN (j #>> '{score_data,engine_value,tbo_hours}')::integer
    ELSE NULL
  END AS ev_tbo_hours,
  CASE
    WHEN NULLIF(j #>> '{score_data,engine_value,hours_remaining}', '') ~ '^-?\d+(\.\d+)?$'
      THEN (j #>> '{score_data,engine_value,hours_remaining}')::integer
    ELSE NULL
  END AS ev_hours_remaining,
  CASE
    WHEN NULLIF(j #>> '{score_data,engine_value,pct_life_remaining}', '') ~ '^-?\d+(\.\d+)?$'
      THEN (j #>> '{score_data,engine_value,pct_life_remaining}')::numeric
    ELSE NULL
  END AS ev_pct_life_remaining,
  CASE
    WHEN NULLIF(j #>> '{score_data,engine_value,exchange_price}', '') ~ '^-?\d+(\.\d+)?$'
      THEN (j #>> '{score_data,engine_value,exchange_price}')::numeric
    ELSE NULL
  END AS ev_exchange_price,
  CASE
    WHEN NULLIF(j #>> '{score_data,engine_value,engine_remaining_value}', '') ~ '^-?\d+(\.\d+)?$'
      THEN (j #>> '{score_data,engine_value,engine_remaining_value}')::numeric
    ELSE NULL
  END AS ev_engine_remaining_value,
  CASE
    WHEN NULLIF(j #>> '{score_data,engine_value,engine_overrun_liability}', '') ~ '^-?\d+(\.\d+)?$'
      THEN (j #>> '{score_data,engine_value,engine_overrun_liability}')::numeric
    ELSE NULL
  END AS ev_engine_overrun_liability,
  CASE
    WHEN NULLIF(j #>> '{score_data,engine_value,engine_reserve_per_hour}', '') ~ '^-?\d+(\.\d+)?$'
      THEN (j #>> '{score_data,engine_value,engine_reserve_per_hour}')::numeric
    ELSE NULL
  END AS ev_engine_reserve_per_hour,
  CASE
    WHEN NULLIF(j #>> '{score_data,engine_value,score_contribution}', '') ~ '^-?\d+(\.\d+)?$'
      THEN (j #>> '{score_data,engine_value,score_contribution}')::integer
    ELSE NULL
  END AS ev_score_contribution,
  NULLIF(j #>> '{score_data,engine_value,data_quality}', '') AS ev_data_quality,
  NULLIF(j #>> '{score_data,engine_value,explanation}', '') AS ev_explanation,
  CASE
    WHEN NULLIF(j ->> 'accident_count', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'accident_count')::integer
    ELSE NULL
  END AS accident_count,
  CASE
    WHEN NULLIF(j ->> 'most_recent_accident_date', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN (j ->> 'most_recent_accident_date')::date
    ELSE NULL
  END AS most_recent_accident_date,
  NULLIF(j ->> 'most_severe_damage', '') AS most_severe_damage,
  CASE
    WHEN LOWER(NULLIF(j ->> 'has_accident_history', '')) IN ('true', 'false') THEN (j ->> 'has_accident_history')::boolean
    ELSE NULL
  END AS has_accident_history,
  CASE
    WHEN LOWER(NULLIF(j ->> 'faa_matched', '')) IN ('true', 'false') THEN (j ->> 'faa_matched')::boolean
    ELSE NULL
  END AS faa_matched,
  NULLIF(j ->> 'faa_owner', '') AS faa_owner,
  NULLIF(j ->> 'faa_status', '') AS faa_status,
  CASE
    WHEN NULLIF(j ->> 'faa_cert_date', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN (j ->> 'faa_cert_date')::date
    ELSE NULL
  END AS faa_cert_date,
  NULLIF(j ->> 'faa_type_aircraft', '') AS faa_type_aircraft,
  CASE
    WHEN NULLIF(j ->> 'investment_score', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'investment_score')::numeric
    ELSE NULL
  END AS investment_score,
  CASE
    WHEN NULLIF(j ->> 'market_opportunity_score', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'market_opportunity_score')::numeric
    ELSE NULL
  END AS market_opportunity_score,
  CASE
    WHEN NULLIF(j ->> 'execution_score', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'execution_score')::numeric
    ELSE NULL
  END AS execution_score,
  CASE
    WHEN NULLIF(j ->> 'condition_score', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'condition_score')::numeric
    ELSE NULL
  END AS condition_score,
  NULLIF(j ->> 'pricing_confidence', '') AS pricing_confidence,
  NULLIF(j ->> 'comp_selection_tier', '') AS comp_selection_tier,
  CASE
    WHEN NULLIF(j ->> 'comp_universe_size', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'comp_universe_size')::integer
    ELSE NULL
  END AS comp_universe_size,
  CASE
    WHEN NULLIF(j ->> 'comp_exact_count', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'comp_exact_count')::integer
    ELSE NULL
  END AS comp_exact_count,
  CASE
    WHEN NULLIF(j ->> 'comp_family_count', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'comp_family_count')::integer
    ELSE NULL
  END AS comp_family_count,
  CASE
    WHEN NULLIF(j ->> 'comp_make_count', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'comp_make_count')::integer
    ELSE NULL
  END AS comp_make_count,
  CASE
    WHEN NULLIF(j ->> 'comp_median_price', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'comp_median_price')::numeric
    ELSE NULL
  END AS comp_median_price,
  CASE
    WHEN NULLIF(j ->> 'comp_p25_price', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'comp_p25_price')::numeric
    ELSE NULL
  END AS comp_p25_price,
  CASE
    WHEN NULLIF(j ->> 'comp_p75_price', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'comp_p75_price')::numeric
    ELSE NULL
  END AS comp_p75_price,
  CASE
    WHEN NULLIF(j ->> 'mispricing_zscore', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'mispricing_zscore')::numeric
    ELSE NULL
  END AS mispricing_zscore,
  NULLIF(j ->> 'deal_comparison_source', '') AS deal_comparison_source,
  NULLIF(j ->> 'manufacturer_tier', '') AS manufacturer_tier
FROM base
WHERE
  NULLIF(j ->> 'value_score', '') ~ '^-?\d+(\.\d+)?$';

GRANT SELECT ON public.public_listings TO anon, authenticated;
