-- Audit trail for scraper/backfill_scores.py runs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS backfill_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_timestamp timestamptz NOT NULL DEFAULT now(),
  mode text NOT NULL CHECK (mode IN ('db', 'json')),
  intelligence_version text NOT NULL,
  listings_attempted integer NOT NULL DEFAULT 0,
  listings_scored integer NOT NULL DEFAULT 0,
  listings_failed integer NOT NULL DEFAULT 0,
  dry_run boolean NOT NULL DEFAULT false,
  error_summary jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_backfill_runs_timestamp
  ON backfill_runs(run_timestamp DESC);
