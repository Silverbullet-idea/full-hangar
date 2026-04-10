"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useState } from "react"
import { setAuthReturnCookie } from "@/lib/account/authReturnCookie"
import { supabaseOAuthErrorMessage } from "@/lib/account/supabaseOAuthErrorMessage"
import { createBrowserSupabase } from "@/lib/supabase/browser"
import AppleSignInButton from "../AppleSignInButton"

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

export default function LoginClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get("returnTo")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetMsg, setResetMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const resolveReturn = useCallback(() => {
    if (returnTo) {
      try {
        const decoded = decodeURIComponent(returnTo)
        if (decoded.startsWith("/") && !decoded.startsWith("//")) return decoded
      } catch {
        /* ignore */
      }
    }
    return "/account"
  }, [returnTo])

  const oauthRedirect = () => {
    if (typeof window === "undefined") return ""
    return `${window.location.origin}/account/auth/callback`
  }

  const onGoogle = async () => {
    setError(null)
    setAuthReturnCookie(resolveReturn())
    const supabase = createBrowserSupabase()
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: oauthRedirect() },
    })
    if (err) setError(supabaseOAuthErrorMessage(err))
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const supabase = createBrowserSupabase()
      const { error: err } = await supabase.auth.signInWithPassword({ email, password })
      if (err) {
        setError(err.message)
        return
      }
      router.push(resolveReturn())
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const onForgot = async () => {
    setError(null)
    setResetMsg(null)
    if (!email.trim()) {
      setError("Enter your email above first.")
      return
    }
    const supabase = createBrowserSupabase()
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${origin}/account/auth/callback?next=/account/profile`,
    })
    if (err) {
      setError(err.message)
      return
    }
    setResetMsg("Check your email for a reset link.")
  }

  return (
    <div className="w-full max-w-[400px] rounded-xl border border-[#30363d] bg-[#161b22] p-6 shadow-xl [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={() => void onGoogle()}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-[#30363d] bg-white text-sm font-medium text-[#0f172a] hover:bg-slate-50 [data-theme=light]:border-slate-300"
        >
          <GoogleIcon />
          Continue with Google
        </button>
        <AppleSignInButton resolveReturn={resolveReturn} onAuthError={(m) => (m ? setError(m) : setError(null))} />
      </div>

      <div className="my-6 flex items-center gap-3 text-xs text-[#8b949e] [data-theme=light]:text-slate-500">
        <span className="h-px flex-1 bg-[#30363d] [data-theme=light]:bg-slate-200" />
        or sign in with email
        <span className="h-px flex-1 bg-[#30363d] [data-theme=light]:bg-slate-200" />
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-[#8b949e]">Email</label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 w-full rounded-[10px] border border-[#30363d] bg-[#0d1117] px-3 text-sm text-white [data-theme=light]:border-slate-300 [data-theme=light]:bg-white [data-theme=light]:text-slate-900"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#8b949e]">Password</label>
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 w-full rounded-[10px] border border-[#30363d] bg-[#0d1117] px-3 pr-16 text-sm text-white [data-theme=light]:border-slate-300 [data-theme=light]:bg-white [data-theme=light]:text-slate-900"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#FF9900]"
              onClick={() => setShowPw((s) => !s)}
            >
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        {error ? <p className="text-sm text-red-400 [data-theme=light]:text-red-600">{error}</p> : null}
        {resetMsg ? <p className="text-sm text-emerald-400 [data-theme=light]:text-emerald-700">{resetMsg}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="mt-1 flex h-11 w-full items-center justify-center rounded-[10px] bg-[#FF9900] text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
        >
          Sign in →
        </button>
      </form>

      <button type="button" onClick={() => void onForgot()} className="mt-3 text-sm text-[#FF9900] hover:underline">
        Forgot password?
      </button>

      <p className="mt-6 text-center text-sm text-[#8b949e] [data-theme=light]:text-slate-600">
        Don&apos;t have an account?{" "}
        <Link href={returnTo ? `/account/signup?returnTo=${encodeURIComponent(returnTo)}` : "/account/signup"} className="font-semibold text-[#FF9900] no-underline hover:underline">
          Create one free →
        </Link>
      </p>
    </div>
  )
}
