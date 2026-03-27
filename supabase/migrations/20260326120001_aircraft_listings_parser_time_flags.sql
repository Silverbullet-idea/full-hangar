-- First-class columns for description-parser v2.1.x time / damage signals (mirrors description_intelligence JSON).

ALTER TABLE public.aircraft_listings
  ADD COLUMN IF NOT EXISTS stoh INTEGER;

ALTER TABLE public.aircraft_listings
  ADD COLUMN IF NOT EXISTS sfoh INTEGER;

ALTER TABLE public.aircraft_listings
  ADD COLUMN IF NOT EXISTS no_damage_history BOOLEAN;

COMMENT ON COLUMN public.aircraft_listings.stoh IS 'Engine stop time since overhaul (hours), parser-derived when available.';
COMMENT ON COLUMN public.aircraft_listings.sfoh IS 'Engine SFOH hours, parser-derived when available.';
COMMENT ON COLUMN public.aircraft_listings.no_damage_history IS 'True when listing text asserts no damage history (parser heuristic).';
