# PUBLIC_LISTINGS_VIEW

## 1) Purpose

`public_listings` is the public-safe Supabase read model used by frontend listing flows (including API/repository consumers such as `listingsRepository.ts`) to browse aircraft inventory without exposing the full raw `aircraft_listings` table. It should include frontend-needed, user-safe listing/comparison fields, but should not include raw internal-only intermediates or service-role-only operational fields that are not needed for public read paths.

---

## 2) Current Column Inventory

Source of truth for this inventory is the latest view-touching migration in this repo:
`supabase/migrations/20260302000025_add_media_fields_to_public_listings_view.sql`.

### Identity & source

| Column | Source Table | Type | Notes |
|--------|--------------|------|-------|
| id | aircraft_listings | text | Cast from `id::text` |
| source | aircraft_listings | text | Coalesced from `source` / `source_site` |
| source_id | aircraft_listings | text | Source listing identifier |
| url | aircraft_listings | text | Coalesced from `source_url` / `url` |
| listing_url | aircraft_listings | text | Alias for source listing URL |
| title | aircraft_listings | text | Null-stripped |

### Aircraft specs

| Column | Source Table | Type | Notes |
|--------|--------------|------|-------|
| year | aircraft_listings | integer | 4-digit year validation |
| make | aircraft_listings | text | Null-stripped |
| model | aircraft_listings | text | Null-stripped |
| serial_number | aircraft_listings | text | Null-stripped |
| total_time_airframe | aircraft_listings | numeric | Parsed numeric |
| engine_time_since_overhaul | aircraft_listings | numeric | Coalesced from `engine_time_since_overhaul` / `time_since_overhaul` |
| time_since_overhaul | aircraft_listings | numeric | Alias of same coalesced value |
| engine_tbo_hours | aircraft_listings | numeric | Parsed numeric |
| time_since_new_engine | aircraft_listings | numeric | Parsed numeric |
| time_since_prop_overhaul | aircraft_listings | numeric | Parsed numeric |
| description | aircraft_listings | text | Null-stripped |
| description_full | aircraft_listings | text | Null-stripped |

### Pricing

| Column | Source Table | Type | Notes |
|--------|--------------|------|-------|
| price_asking | aircraft_listings | numeric | Coalesced from `asking_price` / `price_asking` |
| asking_price | aircraft_listings | numeric | Same value as `price_asking` |
| deferred_total | aircraft_listings | numeric | Parsed numeric |
| true_cost | aircraft_listings | numeric | Parsed numeric |
| vs_median_price | aircraft_listings | numeric | Parsed numeric |
| price_reduced | aircraft_listings | boolean | True/false parsed from text |
| price_reduced_date | aircraft_listings | date | ISO date validation |
| price_reduction_amount | aircraft_listings | integer | Parsed numeric |

### Scoring

| Column | Source Table | Type | Notes |
|--------|--------------|------|-------|
| value_score | aircraft_listings | numeric | Required by view WHERE clause |
| engine_score | aircraft_listings | numeric | Parsed numeric |
| prop_score | aircraft_listings | numeric | Parsed numeric |
| llp_score | aircraft_listings | numeric | Parsed numeric |
| avionics_score | aircraft_listings | numeric | Parsed numeric |
| risk_level | aircraft_listings | text | Upper-cased |
| deal_rating | aircraft_listings | numeric | Parsed numeric |
| deal_tier | aircraft_listings | text | Upper-cased |
| comps_sample_size | aircraft_listings | integer | Parsed numeric |
| intelligence_version | aircraft_listings | text | Null-stripped |

### Avionics & modifications

| Column | Source Table | Type | Notes |
|--------|--------------|------|-------|
| avionics_installed_value | aircraft_listings | numeric | Parsed numeric |
| total_modification_value | aircraft_listings | numeric | Parsed numeric |
| stc_market_value_premium_total | aircraft_listings | numeric | Parsed numeric |
| has_glass_cockpit | aircraft_listings | boolean | True/false parsed from text |
| is_steam_gauge | aircraft_listings | boolean | True/false parsed from text |
| avionics_matched_items | aircraft_listings | jsonb | Array fallback to `[]` |
| stc_modifications | aircraft_listings | jsonb | Array fallback to `[]` |

### Intelligence metadata / location

| Column | Source Table | Type | Notes |
|--------|--------------|------|-------|
| location_city | aircraft_listings | text | Null-stripped |
| location_state | aircraft_listings | text | Null-stripped |
| location_label | aircraft_listings | text | Coalesced display location |
| n_number | aircraft_listings | text | Null-stripped |

### FAA & safety

| Column | Source Table | Type | Notes |
|--------|--------------|------|-------|
| faa_registration_alert | aircraft_listings | text | Null-stripped |

### Lifecycle

| Column | Source Table | Type | Notes |
|--------|--------------|------|-------|
| is_active | aircraft_listings | boolean | True/false parsed from text |
| first_seen_date | aircraft_listings | date | ISO date validation |
| last_seen_date | aircraft_listings | date | ISO date validation |
| days_on_market | aircraft_listings | integer | Parsed numeric |

### Media

| Column | Source Table | Type | Notes |
|--------|--------------|------|-------|
| primary_image_url | aircraft_listings | text | Null-stripped |
| image_urls | aircraft_listings | jsonb | Array fallback to `[]` |
| logbook_urls | aircraft_listings | jsonb | Array fallback to `[]` |
| listing_fingerprint | aircraft_listings | text | Null-stripped |

---

## 3) Canonical View SQL

```sql
-- CANONICAL REFERENCE — Last verified: 2026-03-06
-- To update this view, follow the checklist in Section 4 of this document.
-- Do not edit this SQL directly — create a new migration and update this file.

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
  END AS time_since_prop_overhaul
FROM base
WHERE
  NULLIF(j ->> 'value_score', '') ~ '^-?\d+(\.\d+)?$';
```

---

## 4) Before You Touch This View (Checklist)

```text
[ ] 1. Read this file from top to bottom first.
[ ] 2. Check supabase/migrations/ — confirm the column already exists on aircraft_listings
       before adding it to the view. If the column doesn't exist, write the table migration
       first (new migration file), then a separate view migration.
[ ] 3. Create a new migration file using the next sequential timestamp:
       supabase/migrations/YYYYMMDDHHMMSS_update_public_listings_[description].sql
       Use CREATE OR REPLACE VIEW — never DROP VIEW.
[ ] 4. Copy the FULL current view SQL from Section 3 of this file into your migration,
       then add your column(s). Do not write a partial view.
[ ] 5. After applying the migration in Supabase, update Section 2 (column inventory)
       and Section 3 (canonical SQL) in this file.
[ ] 6. Run: npm run build — confirm no TypeScript errors from missing fields.
[ ] 7. Check localhost:3001/listings and localhost:3001/listings/[id] — confirm the
       new column appears where expected.
[ ] 8. Commit both the migration file AND the updated PUBLIC_LISTINGS_VIEW.md together.
```

---

## 5) Known Gaps / Follow-up Items

Compared against field usage in `app/listings/[id]/page.tsx`, `lib/db/listingsRepository.ts`, and `lib/types.ts`, these likely-needed fields are missing from the canonical view definition above:

| Column | Why It Might Be Needed | Risk If Missing |
|--------|-------------------------|-----------------|
| deal_comparison_source | Used in detail-page score/comps explanation | Missing comp-source attribution in public/detail flows |
| accident_count | Used for FAA Snapshot accident row | Accident badge degrades or requires raw-table fallback |
| most_recent_accident_date | Used in accident summary text | Incomplete accident recency messaging |
| most_severe_damage | Used in accident summary text | Missing damage severity context |
| has_accident_history | Used for no-accident vs warning UI | Incorrect accident-state rendering if raw fallback unavailable |
| faa_matched | Used to mark FAA match status in detail page | FAA status banner can show less accurate state |
| faa_owner / faa_status / faa_cert_date / faa_type_aircraft | Read by detail FAA panel logic | FAA panel loses key verification details |
| condition_score | Used in investment-style Score Summary | Score breakdown degrades to derived/fallback values |
| market_opportunity_score | Used in investment-style Score Summary | Less precise investment model output |
| execution_score | Used in investment-style Score Summary | Less precise execution scoring |
| investment_score | Primary score now shown in detail | Detail page falls back to legacy value score |
| pricing_confidence | Displayed in score chips and score-method text | Missing pricing confidence visibility |
| comp_selection_tier | Used in comp-tier badge | Comps waterfall transparency missing |
| comp_universe_size | Used in score-input table | Reduced comp-context detail |
| comp_exact_count / comp_family_count / comp_make_count | Used in comp-universe row | Missing comp mix diagnostics |
| comp_median_price / comp_p25_price / comp_p75_price | Used in score-input pricing band | No comp-band transparency in detail |
| mispricing_zscore | Used in score-input table | Missing normalized mispricing signal |
| pricing_mad | Present in listing type contract | Potential analytics gap for pricing robustness |
| description_intelligence | Used to enrich detail parsing paths | More UI falls back to heuristic text parsing |
| manufacturer_tier | Used by backend workflows and intelligence metadata | Tier-aware filtering/ops cannot rely on public view |
| comp/avionics value-source fields (for example `avionics_value_source_primary`) | Added by newer intelligence migrations | Value attribution is obscured in public model |

---

## 6) Migration History

| Migration File | What Changed |
|----------------|-------------|
| `20250301000009_public_listings_view_and_rls.sql` | Initial `public_listings` view with RLS policy setup and grants |
| `20260301000010_align_public_listings_view_shape.sql` | Added aligned aliases (`url`, `listing_url`, `price_asking`, `asking_price`) and expanded baseline fields |
| `20260301000012_add_avionics_to_public_listings_view.sql` | Added `avionics_score` and `avionics_installed_value` |
| `20260301000015_add_deal_fields_to_public_listings_view.sql` | Added deal/comps fields (`deal_rating`, `deal_tier`, `vs_median_price`, `comps_sample_size`) |
| `20260301000017_add_accident_fields_to_public_listings_view.sql` | Added FAA + accident fields (`faa_matched`, owner/status/cert, accident columns) |
| `20260301000020_add_deal_comparison_source_to_public_listings_view.sql` | Rebuilt view with `deal_comparison_source` and grant |
| `20260301000022_add_market_time_and_price_reduction_to_public_listings_view.sql` | Added lifecycle/price-history fields (`days_on_market`, `price_reduced`, `first_seen_date`, etc.) |
| `20260302000025_add_media_fields_to_public_listings_view.sql` | Added media/modification fields (`image_urls`, `logbook_urls`, `listing_fingerprint`, STC/mod arrays) and became current canonical in repo |

---

## 7) Live Verification Snapshot

Last runtime verification: `2026-03-06`.

- Live query to `public_listings?select=*&limit=1` succeeded and returned a column set that matches the canonical SQL in Section 3 (no drift detected in currently exposed columns).
- Direct `information_schema.views` fetch over PostgREST returned `404` in this environment, so canonical SQL remains sourced from the latest repo migration sequence.

If direct SQL introspection is needed, use Supabase SQL Editor or MCP SQL execution against:

```sql
SELECT view_definition
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name = 'public_listings';
```

