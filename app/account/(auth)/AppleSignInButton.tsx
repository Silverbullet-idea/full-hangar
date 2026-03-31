"use client"

import { createBrowserSupabase } from "@/lib/supabase/browser"
import { setAuthReturnCookie } from "@/lib/account/authReturnCookie"

/**
 * Sign in with Apple is omitted entirely until Supabase + Apple Developer are configured.
 * Do not set NEXT_PUBLIC_APPLE_CLIENT_ID until then — no UI, no OAuth calls.
 */
export default function AppleSignInButton({
  resolveReturn,
  onAuthError,
}: {
  resolveReturn: () => string
  onAuthError?: (message: string) => void
}) {
  if (!process.env.NEXT_PUBLIC_APPLE_CLIENT_ID?.trim()) {
    return null
  }

  const oauthRedirect = () =>
    typeof window === "undefined" ? "" : `${window.location.origin}/account/auth/callback`

  const onApple = async () => {
    onAuthError?.("")
    setAuthReturnCookie(resolveReturn())
    const supabase = createBrowserSupabase()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: oauthRedirect() },
    })
    if (error) onAuthError?.(error.message)
  }

  return (
    <button
      type="button"
      onClick={() => void onApple()}
      className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-[#30363d] bg-white text-sm font-medium text-[#0f172a] hover:bg-slate-50 [data-theme=light]:border-slate-300"
    >
      Continue with Apple
    </button>
  )
}
