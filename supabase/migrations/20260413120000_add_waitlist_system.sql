-- Waitlist + access gating. Extends existing public.user_profiles (canonical app profile table).
-- New signups default to access_status = pending; existing rows are grandfathered to approved.

-- ---------------------------------------------------------------------------
-- waitlist_requests
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.waitlist_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('buyer', 'seller', 'broker')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_waitlist_status ON public.waitlist_requests(status);
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON public.waitlist_requests(email);

ALTER TABLE public.waitlist_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.waitlist_requests;
CREATE POLICY "Service role full access" ON public.waitlist_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT ALL ON TABLE public.waitlist_requests TO service_role;

-- ---------------------------------------------------------------------------
-- user_profiles: access columns + email (for admin lookup / approval flows)
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS access_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (access_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS access_granted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles (email);

-- Backfill email from auth.users
UPDATE public.user_profiles p
SET email = lower(trim(u.email))
FROM auth.users u
WHERE p.id = u.id
  AND (p.email IS NULL OR p.email = '');

-- Grandfather existing accounts at migration time (everyone already in user_profiles before this column existed)
UPDATE public.user_profiles
SET
  access_status = 'approved',
  access_granted_at = COALESCE(access_granted_at, NOW())
WHERE access_status = 'pending';

-- ---------------------------------------------------------------------------
-- Resolve auth user id by email (service role / RPC only — used by approve API)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_user_id_by_email(_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id
  FROM auth.users
  WHERE lower(trim(email)) = lower(trim(_email))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.auth_user_id_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_id_by_email(text) TO service_role;

-- ---------------------------------------------------------------------------
-- New user trigger: profile row + grant access if waitlist already approved
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  v_email := lower(trim(COALESCE(NEW.email, '')));

  INSERT INTO public.user_profiles (
    id,
    display_name,
    avatar_url,
    email,
    access_status
  )
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url',
    NULLIF(v_email, ''),
    'pending'
  )
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.user_profiles up
  SET email = COALESCE(NULLIF(up.email, ''), NULLIF(v_email, ''))
  WHERE up.id = NEW.id;

  UPDATE public.user_profiles up
  SET
    access_status = 'approved',
    access_granted_at = NOW()
  FROM public.waitlist_requests w
  WHERE up.id = NEW.id
    AND w.status = 'approved'
    AND lower(trim(w.email)) = v_email;

  RETURN NEW;
END;
$$;

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT ALL ON TABLE public.user_profiles TO supabase_auth_admin;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Bootstrap admin (Ryan)
-- ---------------------------------------------------------------------------
UPDATE public.user_profiles p
SET
  is_admin = TRUE,
  access_status = 'approved',
  email = COALESCE(NULLIF(p.email, ''), lower(trim(u.email)))
FROM auth.users u
WHERE p.id = u.id
  AND lower(trim(u.email)) = 'rdale68@gmail.com';
