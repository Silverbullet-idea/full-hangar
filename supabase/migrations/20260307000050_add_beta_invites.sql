-- Beta invite tokens
CREATE TABLE IF NOT EXISTS beta_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  label TEXT,
  email TEXT,
  created_by TEXT DEFAULT 'ryan',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  used_by_email TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  access_tier TEXT DEFAULT 'beta'
);

-- Beta sessions (lightweight session model)
CREATE TABLE IF NOT EXISTS beta_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id UUID REFERENCES beta_invites(id),
  session_token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_beta_invites_token ON beta_invites(token);
CREATE INDEX IF NOT EXISTS idx_beta_sessions_token ON beta_sessions(session_token);
