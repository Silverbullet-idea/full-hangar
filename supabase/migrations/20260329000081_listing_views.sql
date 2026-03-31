-- Page views on listings (seller analytics foundation). Inserts via service role from API.

CREATE TABLE IF NOT EXISTS public.listing_views (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      TEXT NOT NULL,
  viewed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source          TEXT CHECK (source IN ('search', 'browse', 'direct', 'deal_coach', 'unknown'))
                    DEFAULT 'unknown',
  session_id      TEXT,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_listing_views_listing_id
  ON public.listing_views (listing_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_listing_views_viewed_at
  ON public.listing_views (viewed_at DESC);
