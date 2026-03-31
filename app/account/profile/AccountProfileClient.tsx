"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { createBrowserSupabase } from "@/lib/supabase/browser"

type ProfileRow = {
  id: string
  display_name: string | null
  notify_price_drops: boolean
  notify_new_matches: boolean
  notify_product_updates: boolean
}

export default function AccountProfileClient({
  userEmail,
  initialProfile,
}: {
  userEmail: string
  initialProfile: ProfileRow | null
}) {
  const router = useRouter()
  const [displayName, setDisplayName] = useState(initialProfile?.display_name ?? "")
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (initialProfile) return
    void (async () => {
      const res = await fetch("/api/account/profile", { credentials: "include" })
      if (!res.ok) return
      const json = (await res.json()) as { profile?: ProfileRow }
      if (json.profile?.display_name) setDisplayName(json.profile.display_name)
    })()
  }, [initialProfile])

  const save = async () => {
    setBusy(true)
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName.trim() || null }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        router.refresh()
      }
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    const supabase = createBrowserSupabase()
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8 sm:px-6">
      <Link href="/account" className="text-sm text-[var(--fh-orange)] no-underline hover:underline">
        ← Account home
      </Link>
      <h1
        className="mt-4 text-2xl font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900"
        style={{ fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" }}
      >
        Profile
      </h1>
      <p className="mt-1 text-sm text-[var(--fh-text-dim)]">{userEmail}</p>

      <div className="mt-8 space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--fh-text-dim)]">Display name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="h-11 w-full rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg2)] px-3 text-[var(--fh-text)] [data-theme=light]:bg-white [data-theme=light]:text-slate-900"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="rounded-lg bg-[var(--fh-orange)] px-4 py-2 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
          >
            Save
          </button>
          {saved ? <span className="text-xs text-emerald-500">Saved</span> : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void signOut()}
        className="mt-10 text-sm text-[var(--fh-text-dim)] underline hover:text-[var(--fh-text)]"
      >
        Sign out
      </button>
    </div>
  )
}
