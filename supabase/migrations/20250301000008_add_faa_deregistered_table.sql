CREATE TABLE IF NOT EXISTS faa_deregistered (
  n_number TEXT PRIMARY KEY,
  serial_number TEXT,
  status_code TEXT,
  cancel_date TEXT,
  last_activity_date TEXT
);
