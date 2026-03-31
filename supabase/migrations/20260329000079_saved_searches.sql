CREATE TABLE IF NOT EXISTS public.saved_searches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL DEFAULT 'My search',
  filters         JSONB NOT NULL DEFAULT '{}',
  alert_enabled   BOOLEAN NOT NULL DEFAULT false,
  last_alerted_at TIMESTAMPTZ,
  result_count    INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_user_id
  ON public.saved_searches (user_id);

CREATE INDEX IF NOT EXISTS idx_saved_searches_alert_enabled
  ON public.saved_searches (alert_enabled)
  WHERE alert_enabled = true;

ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_crud_own_searches" ON public.saved_searches;
CREATE POLICY "users_crud_own_searches"
  ON public.saved_searches FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.saved_searches TO authenticated;

CREATE TABLE IF NOT EXISTS public.price_alert_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id       UUID NOT NULL REFERENCES public.saved_searches(id) ON DELETE CASCADE,
  listing_id      UUID,
  alerted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  price_at_alert  NUMERIC,
  delivered       BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_price_alert_log_search_id
  ON public.price_alert_log (search_id);

ALTER TABLE public.price_alert_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_alerts" ON public.price_alert_log;
CREATE POLICY "users_read_own_alerts"
  ON public.price_alert_log FOR SELECT
  TO authenticated
  USING (
    auth.uid() = (
      SELECT ss.user_id FROM public.saved_searches ss WHERE ss.id = search_id
    )
  );

GRANT SELECT ON TABLE public.price_alert_log TO authenticated;

DROP TRIGGER IF EXISTS saved_searches_updated_at ON public.saved_searches;
CREATE TRIGGER saved_searches_updated_at
  BEFORE UPDATE ON public.saved_searches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
