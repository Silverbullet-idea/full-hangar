"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import type { User } from "@supabase/supabase-js"
import type { UserProfileRow } from "@/lib/account/useCurrentUser"
import { createBrowserSupabase } from "@/lib/supabase/browser"

type ActivityCounts = Record<string, number>

export default function AccountDropdown({
  user,
  profile,
  isAdmin,
  open,
  onClose,
}: {
  user: User
  profile: UserProfileRow | null
  isAdmin: boolean
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const panelRef = useRef<HTMLDivElement>(null)
  const [counts, setCounts] = useState<ActivityCounts | null>(null)
  const [loadingActivity, setLoadingActivity] = useState(false)
  const fetchedRef = useRef(false)

  const displayName = profile?.display_name?.trim() || user.email?.split("@")[0] || "Member"
  const shortName = displayName.length > 16 ? `${displayName.slice(0, 15)}…` : displayName
  const initial = (displayName[0] || "?").toUpperCase()

  const fetchActivity = useCallback(async () => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    setLoadingActivity(true)
    try {
      const res = await fetch("/api/account/activity", { credentials: "include" })
      const json = (await res.json()) as { counts?: ActivityCounts }
      setCounts(json.counts ?? {})
    } catch {
      setCounts({})
    } finally {
      setLoadingActivity(false)
    }
  }, [])

  useEffect(() => {
    if (open) void fetchActivity()
  }, [open, fetchActivity])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  const signOut = async () => {
    const supabase = createBrowserSupabase()
    await supabase.auth.signOut()
    onClose()
    router.push("/")
    router.refresh()
  }

  const hasActivity =
    (counts?.searches ?? 0) > 0 ||
    (counts?.scenarios ?? 0) > 0 ||
    (counts?.recentAlertRows ?? 0) > 0

  const showAlertPrompt = (counts?.searches ?? 0) > 0

  if (!open) return null

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full z-50 mt-2 w-[min(100vw-2rem,320px)] rounded-xl border border-[var(--fh-border)] bg-[var(--fh-bg2)] py-3 shadow-xl [data-theme=light]:bg-white"
      role="menu"
    >
      <div className="flex gap-3 border-b border-[var(--fh-border)] px-4 pb-3">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--fh-orange)] text-lg font-bold text-white">
          {profile?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900">{displayName}</div>
          <div className="truncate text-xs text-[var(--fh-text-dim)]">{user.email}</div>
        </div>
      </div>

      {loadingActivity ? (
        <div className="space-y-2 px-4 py-3">
          <div className="h-4 w-40 animate-pulse rounded bg-[var(--fh-border)]" />
          <div className="h-4 w-32 animate-pulse rounded bg-[var(--fh-border)]" />
        </div>
      ) : hasActivity ? (
        <div className="border-b border-[var(--fh-border)] px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--fh-text-dim)]">Activity</div>
          <ul className="mt-2 space-y-1 text-sm text-[var(--fh-text)]">
            {(counts?.searches ?? 0) > 0 ? (
              <li>
                {counts!.searches} saved search{counts!.searches === 1 ? "" : "es"}
              </li>
            ) : null}
            {(counts?.scenarios ?? 0) > 0 ? (
              <li>
                {counts!.scenarios} deal scenario{counts!.scenarios === 1 ? "" : "s"}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <nav className="flex flex-col gap-0.5 px-2 py-2 text-sm">
        <Link href="/account" className="rounded-lg px-3 py-2 text-[var(--fh-text)] no-underline hover:bg-[var(--fh-bg3)] [data-theme=light]:hover:bg-slate-100" onClick={onClose}>
          My account
        </Link>
        <Link href="/account/searches" className="rounded-lg px-3 py-2 text-[var(--fh-text)] no-underline hover:bg-[var(--fh-bg3)] [data-theme=light]:hover:bg-slate-100" onClick={onClose}>
          Saved searches
        </Link>
        <Link href="/account/scenarios" className="rounded-lg px-3 py-2 text-[var(--fh-text)] no-underline hover:bg-[var(--fh-bg3)] [data-theme=light]:hover:bg-slate-100" onClick={onClose}>
          Deal scenarios
        </Link>
        <Link href="/account/watchlist" className="rounded-lg px-3 py-2 text-[var(--fh-text)] no-underline hover:bg-[var(--fh-bg3)] [data-theme=light]:hover:bg-slate-100" onClick={onClose}>
          My watchlist
        </Link>
        {isAdmin ? (
          <>
            <Link href="/internal" className="rounded-lg px-3 py-2 text-[var(--fh-text)] no-underline hover:bg-[var(--fh-bg3)] [data-theme=light]:hover:bg-slate-100" onClick={onClose}>
              Internal dashboard
            </Link>
            <Link href="/internal/deal-desk" className="rounded-lg px-3 py-2 text-[var(--fh-text)] no-underline hover:bg-[var(--fh-bg3)] [data-theme=light]:hover:bg-slate-100" onClick={onClose}>
              Deal Desk
            </Link>
            <Link href="/internal/market-intel" className="rounded-lg px-3 py-2 text-[var(--fh-text)] no-underline hover:bg-[var(--fh-bg3)] [data-theme=light]:hover:bg-slate-100" onClick={onClose}>
              Market Intel
            </Link>
          </>
        ) : null}
      </nav>

      {showAlertPrompt ? (
        <div className="border-t border-[var(--fh-border)] px-4 py-2">
          <Link
            href="/account/searches"
            className="text-xs font-semibold text-[var(--fh-orange)] no-underline hover:underline"
            onClick={onClose}
          >
            Enable price alerts →
          </Link>
        </div>
      ) : null}

      <div className="border-t border-[var(--fh-border)] px-2 pt-2">
        <button
          type="button"
          className="w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--fh-text-dim)] hover:bg-[var(--fh-bg3)] [data-theme=light]:hover:bg-slate-100"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
