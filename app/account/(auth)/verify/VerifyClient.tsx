"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useState } from "react"
import { createBrowserSupabase } from "@/lib/supabase/browser"

export default function VerifyClient() {
  const searchParams = useSearchParams()
  const email = searchParams.get("email") ?? ""
  const returnTo = searchParams.get("returnTo")
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const signupHref = returnTo
    ? `/account/signup?returnTo=${encodeURIComponent(returnTo)}`
    : "/account/signup"

  const resend = async () => {
    if (!email.trim()) return
    setErr(null)
    setMsg(null)
    setBusy(true)
    try {
      const supabase = createBrowserSupabase()
      const { error } = await supabase.auth.resend({ type: "signup", email: email.trim() })
      if (error) {
        setErr(error.message)
        return
      }
      setMsg("Verification email sent.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full max-w-[400px] rounded-xl border border-[#30363d] bg-[#161b22] px-8 py-10 text-center shadow-xl [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#21262d] text-[#FF9900] [data-theme=light]:bg-slate-100">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <path d="M22 6l-10 7L2 6" />
        </svg>
      </div>
      <h1 className="text-xl font-bold text-white [data-theme=light]:text-slate-900">Check your email</h1>
      <p className="mt-3 text-sm leading-relaxed text-[#8b949e] [data-theme=light]:text-slate-600">
        We sent a verification link to <span className="font-medium text-[var(--fh-text)] [data-theme=light]:text-slate-900">{email || "your inbox"}</span>.
        Click it to activate your account.
      </p>
      {err ? <p className="mt-4 text-sm text-red-400">{err}</p> : null}
      {msg ? <p className="mt-4 text-sm text-emerald-400">{msg}</p> : null}
      <button
        type="button"
        disabled={busy || !email.trim()}
        onClick={() => void resend()}
        className="mt-6 w-full rounded-[10px] border border-[#30363d] py-2.5 text-sm font-semibold text-[var(--fh-text)] hover:border-[#FF9900]/50 disabled:opacity-50 [data-theme=light]:border-slate-300"
      >
        Resend email
      </button>
      <Link href={signupHref} className="mt-4 inline-block text-sm text-[#FF9900] no-underline hover:underline">
        Wrong email? Go back
      </Link>
    </div>
  )
}
