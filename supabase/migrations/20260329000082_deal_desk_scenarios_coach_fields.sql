-- Deal Coach saves: optional listing, JSON snapshot; one row per (user_id, listing_id) when both set.

ALTER TABLE public.deal_desk_scenarios
  ALTER COLUMN listing_id DROP NOT NULL;

ALTER TABLE public.deal_desk_scenarios
  ADD COLUMN IF NOT EXISTS coach_desk_state JSONB;

COMMENT ON COLUMN public.deal_desk_scenarios.coach_desk_state IS
  'Deal Coach simplified desk state + optional computed P/L (JSON).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_deal_desk_scenarios_user_listing
  ON public.deal_desk_scenarios (user_id, listing_id)
  WHERE user_id IS NOT NULL AND listing_id IS NOT NULL;
