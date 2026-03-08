import { createPrivilegedServerClient } from "@/lib/supabase/server";

export const BETA_SESSION_COOKIE = "beta_session";
const BETA_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export type BetaSessionRow = {
  id: string;
  invite_id: string | null;
  session_token: string;
  created_at: string | null;
  last_seen_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
};

export function buildBetaSessionCookie(value: string) {
  return {
    name: BETA_SESSION_COOKIE,
    value,
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: BETA_SESSION_MAX_AGE_SECONDS,
  };
}

export async function validateBetaSessionToken(sessionToken?: string): Promise<BetaSessionRow | null> {
  if (!sessionToken) return null;

  const supabase = createPrivilegedServerClient();
  const result = await supabase
    .from("beta_sessions")
    .select("id,invite_id,session_token,created_at,last_seen_at,ip_address,user_agent")
    .eq("session_token", sessionToken)
    .limit(1);
  if (result.error) return null;

  const row = (result.data ?? [])[0] as BetaSessionRow | undefined;
  if (!row) return null;

  await supabase
    .from("beta_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", row.id);
  return row;
}
