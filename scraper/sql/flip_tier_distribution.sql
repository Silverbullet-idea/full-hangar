-- Flip tier distribution sanity check (thresholds: HOT >= 80, GOOD >= 65, FAIR >= 50; see core/intelligence/flip_score.py).
-- Run in Supabase SQL editor after migrations are applied.
-- App-side snapshot (includes null-tier counts): npm run pipeline:ops:flip-tier-snapshot -> scraper/logs/flip_tier_distribution_latest.md

SELECT flip_tier, COUNT(*) AS n, ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 2) AS pct
FROM public.aircraft_listings
WHERE is_active IS DISTINCT FROM FALSE
  AND flip_tier IS NOT NULL
GROUP BY flip_tier
ORDER BY n DESC;

SELECT
  CASE
    WHEN flip_score >= 80 THEN 'HOT_band'
    WHEN flip_score >= 65 THEN 'GOOD_band'
    WHEN flip_score >= 50 THEN 'FAIR_band'
    ELSE 'PASS_band'
  END AS implied_band,
  COUNT(*) AS n
FROM public.aircraft_listings
WHERE is_active IS DISTINCT FROM FALSE
  AND flip_score IS NOT NULL
GROUP BY 1
ORDER BY n DESC;
