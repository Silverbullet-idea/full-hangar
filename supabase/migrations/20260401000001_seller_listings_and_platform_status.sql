-- Seller-submitted listings and per-platform cross-post status (internal queue state).

CREATE TABLE IF NOT EXISTS public.seller_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  n_number TEXT,
  year INTEGER,
  make TEXT,
  model TEXT,
  model_suffix TEXT,
  serial_number TEXT,
  category TEXT,

  asking_price NUMERIC,
  currency TEXT DEFAULT 'USD',
  price_extension TEXT,
  call_for_price BOOLEAN DEFAULT FALSE,

  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'United States',
  airport_id TEXT,
  zip TEXT,

  listing_status TEXT NOT NULL DEFAULT 'active'
    CHECK (listing_status IN ('active', 'sold', 'expired', 'taken_down')),
  sold_price NUMERIC,
  sold_date DATE,
  sold_via_platform TEXT,

  form_payload JSONB,
  description_intelligence JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  taken_down_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.seller_listing_platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_listing_id UUID NOT NULL REFERENCES public.seller_listings(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'posting', 'live', 'failed', 'removed', 'unsupported')),
  external_listing_id TEXT,
  external_listing_url TEXT,
  last_attempted_at TIMESTAMPTZ,
  last_confirmed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (seller_listing_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_seller_listings_user_id
  ON public.seller_listings(user_id);
CREATE INDEX IF NOT EXISTS idx_seller_listing_platforms_listing_id
  ON public.seller_listing_platforms(seller_listing_id);

ALTER TABLE public.seller_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_listing_platforms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "seller_listings_owner" ON public.seller_listings;
CREATE POLICY "seller_listings_owner" ON public.seller_listings
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "seller_listing_platforms_owner" ON public.seller_listing_platforms;
CREATE POLICY "seller_listing_platforms_owner" ON public.seller_listing_platforms
  FOR ALL
  TO authenticated
  USING (
    seller_listing_id IN (
      SELECT id FROM public.seller_listings WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    seller_listing_id IN (
      SELECT id FROM public.seller_listings WHERE user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_listings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_listing_platforms TO authenticated;

DROP TRIGGER IF EXISTS seller_listings_updated_at ON public.seller_listings;
CREATE TRIGGER seller_listings_updated_at
  BEFORE UPDATE ON public.seller_listings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS seller_listing_platforms_updated_at ON public.seller_listing_platforms;
CREATE TRIGGER seller_listing_platforms_updated_at
  BEFORE UPDATE ON public.seller_listing_platforms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
