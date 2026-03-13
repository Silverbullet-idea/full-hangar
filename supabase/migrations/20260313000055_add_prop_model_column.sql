-- Add parsed propeller metadata extracted from description intelligence.
-- `time_since_prop_overhaul` already exists on most environments, but keep IF NOT EXISTS for safety.

ALTER TABLE public.aircraft_listings
  ADD COLUMN IF NOT EXISTS prop_model text,
  ADD COLUMN IF NOT EXISTS time_since_prop_overhaul numeric;

COMMENT ON COLUMN public.aircraft_listings.prop_model IS
  'Best-effort parsed propeller model from seller description/notes.';
