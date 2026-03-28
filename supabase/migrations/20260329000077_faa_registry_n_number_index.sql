-- Btree indexes on faa_registry.n_number for fast equality lookups.
-- text_pattern_ops supports ILIKE 'N%' prefix scans if ever needed; primary use is eq lookups.
CREATE INDEX IF NOT EXISTS idx_faa_registry_n_number
  ON faa_registry (n_number text_pattern_ops);

CREATE INDEX IF NOT EXISTS idx_faa_registry_n_number_eq
  ON faa_registry (n_number);
