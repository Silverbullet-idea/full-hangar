-- Add parsed narrative note fields used by source scrapers.
-- These are optional text blobs extracted from detail sections.

ALTER TABLE aircraft_listings
  ADD COLUMN IF NOT EXISTS airframe_notes text,
  ADD COLUMN IF NOT EXISTS engine_notes text,
  ADD COLUMN IF NOT EXISTS maintenance_notes text,
  ADD COLUMN IF NOT EXISTS interior_notes text;
