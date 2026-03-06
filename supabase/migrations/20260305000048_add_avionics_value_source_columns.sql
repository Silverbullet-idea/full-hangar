-- Add avionics valuation source attribution fields to aircraft_listings.
-- Phase 3 scope: persist OEM/P25/fallback mix for explainability and QA.
-- Safe to run multiple times.

ALTER TABLE aircraft_listings
  ADD COLUMN IF NOT EXISTS avionics_value_source_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS avionics_value_source_primary TEXT,
  ADD COLUMN IF NOT EXISTS avionics_market_sample_total INTEGER;
