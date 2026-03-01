ALTER TABLE aircraft_listings
  ADD COLUMN IF NOT EXISTS faa_num_seats INTEGER,
  ADD COLUMN IF NOT EXISTS faa_num_engines INTEGER,
  ADD COLUMN IF NOT EXISTS faa_aircraft_weight TEXT,
  ADD COLUMN IF NOT EXISTS faa_cruising_speed INTEGER,
  ADD COLUMN IF NOT EXISTS faa_type_aircraft TEXT,
  ADD COLUMN IF NOT EXISTS faa_engine_horsepower INTEGER,
  ADD COLUMN IF NOT EXISTS faa_registration_alert TEXT;
