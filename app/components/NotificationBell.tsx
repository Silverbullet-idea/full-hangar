"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { useCurrentUser } from "@/lib/account/useCurrentUser"

export default function NotificationBell() {
  const { user, isLoading } = useCurrentUser()
  const [open, setOpen] = useState(false)
  const [recentAlertRows, setRecentAlertRows] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  useEffect(() => {
    if (!user) {
      setRecentAlertRows(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/api/account/activity", { credentials: "include" })
        const json = (await res.json()) as { counts?: { recentAlertRows?: number } }
        if (!cancelled) setRecentAlertRows(json.counts?.recentAlertRows ?? 0)
      } catch {
        if (!cancelled) setRecentAlertRows(0)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  const showBadge = !isLoading && user && (recentAlertRows ?? 0) > 0

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg2)] text-[var(--fh-text)] transition hover:border-[var(--fh-orange)]/40 [data-theme=light]:bg-white"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Notifications"
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {showBadge ? (
          <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-[var(--fh-orange)]" aria-hidden />
        ) : null}
      </button>
      {open ? (
        <div
          className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-[var(--fh-border)] bg-[var(--fh-bg2)] p-4 shadow-xl [data-theme=light]:bg-white"
          role="menu"
        >
          {!user ? (
            <p className="text-sm text-[var(--fh-text-dim)]">
              <Link href="/account/login" className="font-semibold text-[var(--fh-orange)] no-underline hover:underline">
                Sign in
              </Link>{" "}
              to save searches and get listing digests.
            </p>
          ) : recentAlertRows && recentAlertRows > 0 ? (
            <p className="text-sm text-[var(--fh-text-dim)]">
              You&apos;ve received{" "}
              <span className="font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900">
                {recentAlertRows}
              </span>{" "}
              listing alert{recentAlertRows === 1 ? "" : "s"} in the last 14 days.
            </p>
          ) : (
            <p className="text-sm text-[var(--fh-text-dim)]">
              No recent digest activity. Turn on alerts on a saved search to get daily emails when matches appear.
            </p>
          )}
          <Link
            href="/account/searches"
            className="mt-3 inline-block text-sm font-semibold text-[var(--fh-orange)] no-underline hover:underline"
            onClick={() => setOpen(false)}
          >
            Saved searches →
          </Link>
          <Link
            href="/account/alerts"
            className="mt-2 block text-sm font-semibold text-[var(--fh-orange)] no-underline hover:underline"
            onClick={() => setOpen(false)}
          >
            Deal alerts →
          </Link>
        </div>
      ) : null}
    </div>
  )
}
