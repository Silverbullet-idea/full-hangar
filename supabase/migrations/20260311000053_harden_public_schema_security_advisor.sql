-- Harden objects flagged by Supabase Security Advisor.
-- Safe to run across environments where some objects may not exist yet.

DO $$
BEGIN
  -- Public views should evaluate with caller permissions.
  IF EXISTS (
    SELECT 1
    FROM pg_views
    WHERE schemaname = 'public' AND viewname = 'public_listings'
  ) THEN
    EXECUTE 'ALTER VIEW public.public_listings SET (security_invoker = true)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_views
    WHERE schemaname = 'public' AND viewname = 'public_listing_observations'
  ) THEN
    EXECUTE 'ALTER VIEW public.public_listing_observations SET (security_invoker = true)';
  END IF;
END
$$;

DO $$
BEGIN
  -- Lock down FAA registry in exposed schema.
  IF to_regclass('public.faa_registry') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.faa_registry ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.faa_registry FORCE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON TABLE public.faa_registry FROM anon, authenticated';

    EXECUTE 'DROP POLICY IF EXISTS service_role_full_access_faa_registry ON public.faa_registry';
    EXECUTE 'CREATE POLICY service_role_full_access_faa_registry ON public.faa_registry FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;

  -- Lock down backfill run logs in exposed schema.
  IF to_regclass('public.backfill_runs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.backfill_runs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.backfill_runs FORCE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON TABLE public.backfill_runs FROM anon, authenticated';

    EXECUTE 'DROP POLICY IF EXISTS service_role_full_access_backfill_runs ON public.backfill_runs';
    EXECUTE 'CREATE POLICY service_role_full_access_backfill_runs ON public.backfill_runs FOR ALL TO service_role USING (true) WITH CHECK (true)';
  END IF;
END
$$;
