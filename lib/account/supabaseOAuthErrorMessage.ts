import type { AuthError } from "@supabase/supabase-js"

/**
 * Turns cryptic Supabase OAuth failures (often JSON) into a short, actionable line
 * when the IdP is disabled in the Supabase project.
 */
export function supabaseOAuthErrorMessage(err: AuthError | null): string {
  if (!err?.message) return "Sign-in failed."
  const raw = err.message.trim()
  let haystack = raw
  try {
    const parsed = JSON.parse(raw) as { msg?: string; error_code?: string }
    if (typeof parsed.msg === "string") haystack = `${raw} ${parsed.msg}`
    if (parsed.error_code === "validation_failed" && String(parsed.msg || "").includes("not enabled")) {
      haystack = `${haystack} unsupported provider`
    }
  } catch {
    /* message is not JSON */
  }
  if (
    haystack.includes("Unsupported provider") ||
    haystack.includes("provider is not enabled") ||
    (haystack.includes("validation_failed") && haystack.includes("not enabled"))
  ) {
    return "Google sign-in is not enabled for this Supabase project. In the Supabase dashboard open Authentication → Providers → Google, turn it on, and paste your Google OAuth client ID and secret."
  }
  return raw
}
