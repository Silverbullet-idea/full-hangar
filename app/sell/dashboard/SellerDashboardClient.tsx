"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import type { ListingStatus, SellerListingSummary } from "@/lib/sell/dashboardTypes"
import ListingCard from "./ListingCard"

function computeDaysOnMarket(listing: SellerListingSummary): number {
  const start = new Date(listing.created_at).getTime()
  if (!Number.isFinite(start)) return 0
  let endMs = Date.now()
  if (listing.listing_status === "sold" && listing.sold_date) {
    const t = new Date(listing.sold_date).getTime()
    if (Number.isFinite(t)) endMs = t
  } else if (listing.listing_status === "taken_down" && listing.taken_down_at) {
    const t = new Date(listing.taken_down_at).getTime()
    if (Number.isFinite(t)) endMs = t
  }
  return Math.max(0, Math.floor((endMs - start) / 86_400_000))
}

type TabKey = "active" | "sold" | "taken_down"

function tabStatuses(key: TabKey): ListingStatus[] {
  if (key === "active") return ["active", "expired"]
  if (key === "sold") return ["sold"]
  return ["taken_down"]
}

const CARD_GRID =
  "rounded-xl border border-[var(--fh-border)] bg-[var(--fh-bg2)] p-4 [data-theme=light]:bg-white"
const METRIC_LABEL = "text-xs font-bold uppercase tracking-wide text-[var(--fh-text-dim)]"

export default function SellerDashboardClient({
  initialListings,
}: {
  initialListings: SellerListingSummary[]
}) {
  const [listings, setListings] = useState<SellerListingSummary[]>(initialListings)
  const [tab, setTab] = useState<TabKey>("active")

  const patchListing = (id: string, patch: Partial<SellerListingSummary>) => {
    setListings((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l
        const next = { ...l, ...patch }
        return { ...next, days_on_market: computeDaysOnMarket(next) }
      }),
    )
  }

  const counts = useMemo(() => {
    const active = listings.filter((l) => l.listing_status === "active" || l.listing_status === "expired").length
    const sold = listings.filter((l) => l.listing_status === "sold").length
    const taken = listings.filter((l) => l.listing_status === "taken_down").length
    return { active, sold, taken }
  }, [listings])

  const metrics = useMemo(() => {
    const activeRows = listings.filter((l) => l.listing_status === "active" || l.listing_status === "expired")
    const avgDom =
      activeRows.length > 0
        ? Math.round(activeRows.reduce((s, l) => s + l.days_on_market, 0) / activeRows.length)
        : 0
    const soldLifetime = listings.filter((l) => l.listing_status === "sold").length
    return {
      activeCount: activeRows.length,
      avgDom,
      soldLifetime,
    }
  }, [listings])

  const filtered = useMemo(
    () => listings.filter((l) => tabStatuses(tab).includes(l.listing_status)),
    [listings, tab],
  )

  const tabBtn = (key: TabKey, label: string, count: number) => (
    <button
      type="button"
      key={key}
      onClick={() => setTab(key)}
      className={`border-b-2 px-3 py-2 text-sm font-semibold transition ${
        tab === key
          ? "border-[var(--fh-orange)] text-[var(--fh-text)] [data-theme=light]:text-slate-900"
          : "border-transparent text-[var(--fh-text-dim)] hover:text-[var(--fh-text)]"
      }`}
    >
      {label} ({count})
    </button>
  )

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <h1
          className="text-2xl font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900 sm:text-3xl"
          style={{ fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" }}
        >
          My listings
        </h1>
        <p className="mt-1 text-sm text-[var(--fh-text-dim)]">Track cross-post status and manage your aircraft</p>
      </header>

      <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className={CARD_GRID}>
          <p className={METRIC_LABEL}>Active listings</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--fh-text)] font-[family-name:var(--font-dm-mono)] [data-theme=light]:text-slate-900">
            {metrics.activeCount}
          </p>
        </article>
        <article className={CARD_GRID}>
          <p className={METRIC_LABEL}>Total views, 7d</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--fh-text-dim)] font-[family-name:var(--font-dm-mono)]">—</p>
        </article>
        <article className={CARD_GRID}>
          <p className={METRIC_LABEL}>Avg days on market</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--fh-text)] font-[family-name:var(--font-dm-mono)] [data-theme=light]:text-slate-900">
            {metrics.activeCount > 0 ? metrics.avgDom : "—"}
          </p>
        </article>
        <article className={CARD_GRID}>
          <p className={METRIC_LABEL}>Listings sold</p>
          <p className="mt-1 text-2xl font-semibold text-[var(--fh-text)] font-[family-name:var(--font-dm-mono)] [data-theme=light]:text-slate-900">
            {metrics.soldLifetime}
          </p>
        </article>
      </section>

      <div className="mb-6 flex flex-wrap gap-1 border-b border-[var(--fh-border)]">
        {tabBtn("active", "Active", counts.active)}
        {tabBtn("sold", "Sold", counts.sold)}
        {tabBtn("taken_down", "Taken down", counts.taken)}
      </div>

      {filtered.length === 0 ? (
        <div className={`${CARD_GRID} text-center`}>
          {tab === "active" ? (
            <>
              <p className="text-sm text-[var(--fh-text-dim)]">You don&apos;t have any active listings.</p>
              <Link
                href="/sell"
                className="mt-4 inline-flex items-center justify-center rounded-lg bg-[var(--fh-orange)] px-4 py-2 text-sm font-semibold text-black no-underline hover:opacity-90"
              >
                + Create your first listing
              </Link>
            </>
          ) : tab === "sold" ? (
            <p className="text-sm text-[var(--fh-text-dim)]">No sold listings yet.</p>
          ) : (
            <p className="text-sm text-[var(--fh-text-dim)]">No taken down listings yet.</p>
          )}
        </div>
      ) : (
        <ul className="space-y-6">
          {filtered.map((listing) => (
            <li key={listing.id}>
              <ListingCard listing={listing} onPatchListing={patchListing} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
