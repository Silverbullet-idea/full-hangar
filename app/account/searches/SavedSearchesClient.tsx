"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { savedListingsHref } from "@/lib/listings/savedSearchFilters"

type SearchRow = {
  id: string
  name: string
  alert_enabled: boolean
  created_at: string
  filters: unknown
}

export default function SavedSearchesClient({ initialSearches }: { initialSearches: SearchRow[] }) {
  const router = useRouter()
  const [rows, setRows] = useState(initialSearches)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const remove = async (id: string) => {
    const res = await fetch(`/api/account/searches/${id}`, { method: "DELETE", credentials: "include" })
    if (res.ok) {
      setRows((r) => r.filter((x) => x.id !== id))
      router.refresh()
    }
  }

  const setAlerts = async (id: string, alert_enabled: boolean) => {
    setPendingId(id)
    try {
      const res = await fetch(`/api/account/searches/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alert_enabled }),
      })
      if (res.ok) {
        const json = (await res.json()) as { search?: SearchRow }
        if (json.search) {
          setRows((r) => r.map((x) => (x.id === id ? { ...x, ...json.search! } : x)))
        }
        router.refresh()
      }
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/account" className="text-sm text-[var(--fh-orange)] no-underline hover:underline">
        ← Account home
      </Link>
      <h1
        className="mt-4 text-2xl font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900"
        style={{ fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" }}
      >
        Saved searches
      </h1>
      <p className="mt-2 text-sm text-[var(--fh-text-dim)]">
        Daily email digest when listings match your filters (alerts on). Manage tiers on{" "}
        <Link href="/account/alerts" className="font-semibold text-[var(--fh-orange)] no-underline hover:underline">
          Deal alerts
        </Link>
        .
      </p>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--fh-text-dim)]">
          No saved searches yet.{" "}
          <Link href="/listings" className="font-semibold text-[var(--fh-orange)] no-underline">
            Browse listings →
          </Link>
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--fh-border)] bg-[var(--fh-bg2)] px-4 py-3 [data-theme=light]:bg-white"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-[var(--fh-text)] [data-theme=light]:text-slate-900">{s.name}</div>
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-[var(--fh-text-dim)]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-[var(--fh-border)]"
                    checked={s.alert_enabled}
                    disabled={pendingId === s.id}
                    onChange={(e) => void setAlerts(s.id, e.target.checked)}
                  />
                  Email me a daily digest when there are matches
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={savedListingsHref(s.filters)}
                  className="text-sm font-semibold text-[var(--fh-orange)] no-underline hover:underline"
                >
                  View results
                </Link>
                <button
                  type="button"
                  onClick={() => void remove(s.id)}
                  className="text-sm text-red-400 hover:underline [data-theme=light]:text-red-600"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
