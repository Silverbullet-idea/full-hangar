CREATE TABLE IF NOT EXISTS faa_aircraft_ref (
  mfr_mdl_code TEXT PRIMARY KEY,
  mfr_name TEXT,
  model_name TEXT,
  type_aircraft TEXT,
  type_engine TEXT,
  num_engines INTEGER,
  num_seats INTEGER,
  aircraft_weight TEXT,
  cruising_speed INTEGER
);

CREATE TABLE IF NOT EXISTS faa_engine_ref (
  eng_mfr_mdl_code TEXT PRIMARY KEY,
  eng_mfr_name TEXT,
  eng_model_name TEXT,
  type_engine TEXT,
  horsepower INTEGER
);
