-- Public-safe read model for frontend browsing.
-- Keeps raw table private while exposing only curated fields.

ALTER TABLE public.aircraft_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aircraft_listings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_full_access_aircraft_listings ON public.aircraft_listings;
CREATE POLICY service_role_full_access_aircraft_listings
ON public.aircraft_listings
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS no_client_direct_reads_aircraft_listings ON public.aircraft_listings;
CREATE POLICY no_client_direct_reads_aircraft_listings
ON public.aircraft_listings
FOR SELECT
TO anon, authenticated
USING (false);

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
  COALESCE(NULLIF(j ->> 'source_url', ''), NULLIF(j ->> 'url', '')) AS listing_url,
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
  UPPER(NULLIF(j ->> 'risk_level', '')) AS risk_level,
  CASE
    WHEN NULLIF(j ->> 'deferred_total', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'deferred_total')::numeric
    ELSE NULL
  END AS deferred_total,
  CASE
    WHEN NULLIF(j ->> 'true_cost', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'true_cost')::numeric
    ELSE NULL
  END AS true_cost,
  NULLIF(j ->> 'intelligence_version', '') AS intelligence_version,
  COALESCE(
    NULLIF(j ->> 'location_raw', ''),
    NULLIF(j ->> 'location_label', ''),
    NULLIF(CONCAT_WS(', ', NULLIF(j ->> 'location_city', ''), NULLIF(j ->> 'location_state', '')), '')
  ) AS location_label,
  NULLIF(j ->> 'n_number', '') AS n_number,
  NULLIF(j ->> 'primary_image_url', '') AS primary_image_url,
  NULLIF(j ->> 'description', '') AS description,
  NULLIF(j ->> 'description_full', '') AS description_full,
  CASE
    WHEN NULLIF(j ->> 'total_time_airframe', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'total_time_airframe')::numeric
    ELSE NULL
  END AS total_time_airframe,
  CASE
    WHEN NULLIF(j ->> 'time_since_overhaul', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'time_since_overhaul')::numeric
    ELSE NULL
  END AS time_since_overhaul,
  CASE
    WHEN NULLIF(j ->> 'time_since_new_engine', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'time_since_new_engine')::numeric
    ELSE NULL
  END AS time_since_new_engine,
  CASE
    WHEN NULLIF(j ->> 'time_since_prop_overhaul', '') ~ '^-?\d+(\.\d+)?$' THEN (j ->> 'time_since_prop_overhaul')::numeric
    ELSE NULL
  END AS time_since_prop_overhaul
FROM base
WHERE
  NULLIF(j ->> 'value_score', '') ~ '^-?\d+(\.\d+)?$';

REVOKE ALL ON TABLE public.aircraft_listings FROM anon, authenticated;
GRANT SELECT ON TABLE public.public_listings TO anon, authenticated;
