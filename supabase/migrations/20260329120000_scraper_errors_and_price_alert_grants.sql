-- Centralized scraper error log (Python: scraper_health.log_scraper_error)
CREATE TABLE IF NOT EXISTS public.scraper_errors (
  id          bigserial PRIMARY KEY,
  source_site text NOT NULL,
  error_type  text NOT NULL,
  url         text,
  raw_error   text,
  extra       jsonb,
  resolved    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scraper_errors_source_created
  ON public.scraper_errors (source_site, created_at DESC);

ALTER TABLE public.scraper_errors ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.scraper_errors IS
  'Scraper failures, challenge pages, and parse errors; inserted from scraper_health.log_scraper_error (service role).';

GRANT SELECT, INSERT, UPDATE ON public.scraper_errors TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.scraper_errors_id_seq TO service_role;

-- Cron inserts alert audit rows with service role
GRANT INSERT ON public.price_alert_log TO service_role;
