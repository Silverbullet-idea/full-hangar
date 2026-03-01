ALTER TABLE aircraft_listings ADD COLUMN IF NOT EXISTS primary_image_url TEXT;
ALTER TABLE aircraft_listings ADD COLUMN IF NOT EXISTS image_urls JSONB;
