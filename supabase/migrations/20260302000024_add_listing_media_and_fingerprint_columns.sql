ALTER TABLE aircraft_listings
ADD COLUMN IF NOT EXISTS logbook_urls JSONB;

ALTER TABLE aircraft_listings
ADD COLUMN IF NOT EXISTS listing_fingerprint TEXT;
