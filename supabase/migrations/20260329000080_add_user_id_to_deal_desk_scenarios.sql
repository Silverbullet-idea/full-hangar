-- deal_desk_scenarios: add user_id so scenarios can be owned by account.
-- Anon/unowned rows (user_id IS NULL) keep prior behavior.

ALTER TABLE public.deal_desk_scenarios
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deal_desk_scenarios_user_id
  ON public.deal_desk_scenarios (user_id)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.deal_desk_scenarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_scenarios_by_listing" ON public.deal_desk_scenarios;
CREATE POLICY "read_scenarios_by_listing"
  ON public.deal_desk_scenarios FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "users_crud_own_scenarios" ON public.deal_desk_scenarios;
CREATE POLICY "users_crud_own_scenarios"
  ON public.deal_desk_scenarios FOR ALL
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL)
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Unauthenticated deal-desk flows use service-role API routes, not the anon key.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.deal_desk_scenarios TO authenticated;
