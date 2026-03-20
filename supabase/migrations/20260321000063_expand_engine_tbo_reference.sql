-- Expand engine_tbo_reference with provenance and extension tracking
ALTER TABLE engine_tbo_reference
  ADD COLUMN IF NOT EXISTS tbo_hours_extension_note11 INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tbo_hours_extension_note15 INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tbo_hours_max_with_extensions INTEGER,
  ADD COLUMN IF NOT EXISTS calendar_limit_years INTEGER DEFAULT 12,
  ADD COLUMN IF NOT EXISTS has_serial_number_breakpoints BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS variant_split_notes TEXT,
  ADD COLUMN IF NOT EXISTS applicable_aircraft TEXT[],
  ADD COLUMN IF NOT EXISTS scoring_default_tbo INTEGER,
  ADD COLUMN IF NOT EXISTS scoring_tbo_rationale TEXT,
  ADD COLUMN IF NOT EXISTS source_document TEXT,
  ADD COLUMN IF NOT EXISTS source_document_revision TEXT,
  ADD COLUMN IF NOT EXISTS aerobatic_engine BOOLEAN DEFAULT FALSE;

-- Back-fill scoring_default_tbo = tbo_hours for existing rows
UPDATE engine_tbo_reference
SET scoring_default_tbo = tbo_hours
WHERE scoring_default_tbo IS NULL;

-- Back-fill tbo_hours_max_with_extensions for existing rows
UPDATE engine_tbo_reference
SET tbo_hours_max_with_extensions = tbo_hours + tbo_hours_extension_note11 + tbo_hours_extension_note15
WHERE tbo_hours_max_with_extensions IS NULL;

COMMENT ON COLUMN engine_tbo_reference.tbo_hours_extension_note11 IS
  'Lycoming Note 11: +200 hrs if engine consistently used 40+ hrs/month. 0 for Continental.';
COMMENT ON COLUMN engine_tbo_reference.tbo_hours_extension_note15 IS
  'Lycoming Note 15: +200 hrs for factory new/rebuilt or approved-shop overhaul. 0 for Continental.';
COMMENT ON COLUMN engine_tbo_reference.tbo_hours_max_with_extensions IS
  'Maximum possible TBO including all applicable extensions. Used for optimistic scoring.';
COMMENT ON COLUMN engine_tbo_reference.scoring_default_tbo IS
  'TBO hours Full Hangar uses by default in scoring. Conservative - no extensions applied.';
COMMENT ON COLUMN engine_tbo_reference.applicable_aircraft IS
  'Aircraft models this engine commonly powers. Used to validate FAA registry cross-checks.';
COMMENT ON COLUMN engine_tbo_reference.aerobatic_engine IS
  'True for AEIO/AIO models where TBO is operator-determined (Lycoming Note 6). Use base TBO as max.';
