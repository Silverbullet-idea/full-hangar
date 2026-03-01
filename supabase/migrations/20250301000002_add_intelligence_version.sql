ALTER TABLE aircraft_listings
ADD COLUMN IF NOT EXISTS intelligence_version TEXT;

CREATE INDEX IF NOT EXISTS idx_listings_intelligence_version
ON aircraft_listings(intelligence_version);
