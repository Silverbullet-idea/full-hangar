"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import {
  PLATFORM_LABELS,
  PLATFORMS,
  type Platform,
  type PlatformStatus,
  type SellerListingSummary,
} from "@/lib/sell/dashboardTypes"

const CARD =
  "rounded-xl border border-[var(--fh-border)] bg-[var(--fh-bg2)] p-4 [data-theme=light]:bg-white"
const BTN_ORANGE =
  "rounded-lg bg-[var(--fh-orange)] px-3 py-1.5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
const BTN_GHOST =
  "rounded-lg border border-[var(--fh-border)] bg-transparent px-3 py-1.5 text-sm font-medium text-[var(--fh-text)] hover:bg-[var(--fh-bg3)] disabled:opacity-50"

function statusDotColor(status: PlatformStatus): string {
  switch (status) {
    case "live":
      return "#3B6D11"
    case "posting":
    case "queued":
      return "#854F0B"
    case "failed":
      return "#A32D2D"
    case "removed":
    case "unsupported":
    default:
      return "var(--fh-text-muted)"
  }
}

function statusLabel(status: PlatformStatus): string {
  switch (status) {
    case "live":
      return "Live"
    case "posting":
      return "Posting"
    case "queued":
      return "Queued"
    case "failed":
      return "Failed"
    case "removed":
      return "Removed"
    case "unsupported":
      return "Unsupported"
    default:
      return status
  }
}

function formatMoney(amount: number | null, currency: string, callForPrice: boolean): string {
  if (callForPrice || amount === null) return ""
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(amount)
  } catch {
    return `$${amount.toLocaleString()}`
  }
}

function locationLine(listing: SellerListingSummary): string {
  const parts = [listing.city?.trim(), listing.state?.trim()].filter(Boolean)
  return parts.join(", ")
}

export default function ListingCard({
  listing,
  onPatchListing,
}: {
  listing: SellerListingSummary
  onPatchListing: (id: string, patch: Partial<SellerListingSummary>) => void
}) {
  const [priceOpen, setPriceOpen] = useState(false)
  const [priceInput, setPriceInput] = useState(String(listing.asking_price ?? ""))
  const [currencyInput, setCurrencyInput] = useState(listing.currency || "USD")
  const [priceError, setPriceError] = useState<string | null>(null)
  const [priceLoading, setPriceLoading] = useState(false)

  const [soldOpen, setSoldOpen] = useState(false)
  const [soldPriceInput, setSoldPriceInput] = useState("")
  const [soldVia, setSoldVia] = useState<string>("")
  const [soldError, setSoldError] = useState<string | null>(null)
  const [soldLoading, setSoldLoading] = useState(false)

  const [retrying, setRetrying] = useState<Platform | null>(null)

  useEffect(() => {
    setPriceInput(String(listing.asking_price ?? ""))
    setCurrencyInput(listing.currency || "USD")
  }, [listing.id, listing.asking_price, listing.currency])

  const canManage = listing.listing_status === "active" || listing.listing_status === "expired"

  const failedPlats = listing.platform_statuses.filter((p) => p.status === "failed")
  const postingPlats = listing.platform_statuses.filter((p) => p.status === "posting" || p.status === "queued")
  const livePlats = listing.platform_statuses.filter((p) => p.status === "live")

  let banner: { kind: "failed" | "posting" | "live"; text: string } | null = null
  if (failedPlats.length > 0) {
    const names = failedPlats.map((p) => PLATFORM_LABELS[p.platform]).join(", ")
    banner = { kind: "failed", text: `Failed to post to ${names}. Retry below.` }
  } else if (postingPlats.length > 0) {
    const names = postingPlats.map((p) => PLATFORM_LABELS[p.platform]).join(", ")
    banner = { kind: "posting", text: `Posting to ${names}... check back shortly.` }
  } else if (livePlats.length > 0) {
    banner = {
      kind: "live",
      text: `${livePlats.length} platform(s) confirmed live.`,
    }
  }

  const bannerClass =
    banner?.kind === "failed"
      ? "bg-[var(--fh-red-dim)] text-[var(--fh-red)] border border-[var(--fh-red)]/25"
      : banner?.kind === "posting"
        ? "bg-[var(--fh-amber-dim)] text-[var(--fh-amber)] border border-[var(--fh-amber)]/25"
        : "bg-[var(--fh-green-dim)] text-[var(--fh-green)] border border-[var(--fh-green)]/25"

  const submitPrice = async () => {
    setPriceError(null)
    const n = parseFloat(priceInput)
    if (!Number.isFinite(n) || n < 0) {
      setPriceError("Enter a valid price.")
      return
    }
    setPriceLoading(true)
    try {
      const res = await fetch(`/api/sell/listings/${listing.id}/price`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price: n, currency: currencyInput.trim() || "USD" }),
      })
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; new_price?: number; error?: string }
      if (!res.ok) {
        setPriceError(data.error ?? "Update failed.")
        return
      }
      onPatchListing(listing.id, {
        asking_price: data.new_price ?? n,
        currency: currencyInput.trim() || "USD",
        call_for_price: false,
        platform_statuses: listing.platform_statuses.map((p) =>
          p.status === "live" ? { ...p, status: "posting" as const } : p,
        ),
      })
      setPriceOpen(false)
    } finally {
      setPriceLoading(false)
    }
  }

  const confirmTakeDown = async () => {
    if (!window.confirm("Remove from all platforms? This cannot be undone.")) return
    const res = await fetch(`/api/sell/listings/${listing.id}/takedown`, {
      method: "POST",
      credentials: "include",
    })
    if (!res.ok) return
    const nowIso = new Date().toISOString()
    onPatchListing(listing.id, {
      listing_status: "taken_down",
      taken_down_at: nowIso,
      platform_statuses: listing.platform_statuses.map((p) => ({ ...p, status: "removed" as const })),
    })
  }

  const submitSold = async () => {
    setSoldError(null)
    let soldPrice: number | null = null
    if (soldPriceInput.trim() !== "") {
      const n = parseFloat(soldPriceInput)
      if (!Number.isFinite(n) || n < 0) {
        setSoldError("Invalid sold price.")
        return
      }
      soldPrice = n
    }
    setSoldLoading(true)
    try {
      const res = await fetch(`/api/sell/listings/${listing.id}/mark-sold`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sold_price: soldPrice,
          sold_via_platform: soldVia.trim() || null,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setSoldError(data.error ?? "Could not mark as sold.")
        return
      }
      const today = new Date().toISOString().slice(0, 10)
      onPatchListing(listing.id, {
        listing_status: "sold",
        sold_price: soldPrice,
        sold_date: today,
        sold_via_platform: soldVia.trim() || null,
        platform_statuses: listing.platform_statuses.map((p) => ({ ...p, status: "removed" as const })),
      })
      setSoldOpen(false)
      setSoldPriceInput("")
      setSoldVia("")
    } finally {
      setSoldLoading(false)
    }
  }

  const retryPlatform = async (platform: Platform) => {
    setRetrying(platform)
    try {
      const res = await fetch(`/api/sell/listings/${listing.id}/retry/${platform}`, {
        method: "POST",
        credentials: "include",
      })
      if (!res.ok) return
      onPatchListing(listing.id, {
        platform_statuses: listing.platform_statuses.map((p) =>
          p.platform === platform ? { ...p, status: "queued" as const, error_message: null } : p,
        ),
      })
    } finally {
      setRetrying(null)
    }
  }

  const priceDisplay = listing.call_for_price
    ? null
    : formatMoney(listing.asking_price, listing.currency, listing.call_for_price)

  return (
    <div className={CARD}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2
            className="text-lg font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900"
            style={{ fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" }}
          >
            {listing.aircraft_label}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--fh-text-dim)]">
            {listing.n_number ? (
              <span className="rounded border border-[var(--fh-border)] px-2 py-0.5 font-[family-name:var(--font-dm-mono)]">
                {listing.n_number}
              </span>
            ) : null}
            {locationLine(listing) ? <span>{locationLine(listing)}</span> : null}
            <span className="font-[family-name:var(--font-dm-mono)]">{listing.days_on_market}d on market</span>
          </div>
          {listing.listing_status === "sold" ? (
            <p className="mt-2 text-sm text-[var(--fh-text-dim)]">
              Sold
              {listing.sold_price != null
                ? ` for ${formatMoney(listing.sold_price, listing.currency, false)}`
                : ""}
              {listing.sold_date ? ` on ${listing.sold_date}` : ""}
              {listing.sold_via_platform
                ? ` via ${PLATFORM_LABELS[listing.sold_via_platform as Platform] ?? listing.sold_via_platform}`
                : ""}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          {listing.call_for_price ? (
            <p className="text-sm text-[var(--fh-text-dim)]">Call for price</p>
          ) : (
            <p className="text-xl font-semibold text-[var(--fh-orange)] font-[family-name:var(--font-dm-mono)]">
              {priceDisplay}
            </p>
          )}
        </div>
      </div>

      {banner ? (
        <div className={`mt-4 rounded-lg px-3 py-2 text-sm font-medium ${bannerClass}`}>{banner.text}</div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {PLATFORMS.map((platform) => {
          const row = listing.platform_statuses.find((p) => p.platform === platform)
          const st = row?.status ?? "queued"
          return (
            <div key={platform} className="rounded-lg border border-[var(--fh-border)] p-2 text-center">
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--fh-text-dim)]">
                {PLATFORM_LABELS[platform]}
              </p>
              <div className="mt-1 flex items-center justify-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: statusDotColor(st) }}
                  aria-hidden
                />
                <span className="text-xs font-medium text-[var(--fh-text)] [data-theme=light]:text-slate-800">
                  {statusLabel(st)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {canManage ? (
          <>
            <button type="button" className={BTN_GHOST} onClick={() => setPriceOpen((o) => !o)}>
              Edit price
            </button>
            <Link
              href={`/sell?edit=${encodeURIComponent(listing.id)}`}
              className={`${BTN_GHOST} inline-flex items-center no-underline`}
            >
              Edit listing
            </Link>
            <button type="button" className={BTN_GHOST} onClick={() => setSoldOpen((o) => !o)}>
              Mark as sold
            </button>
            <button type="button" className={BTN_GHOST} onClick={() => void confirmTakeDown()}>
              Take down
            </button>
          </>
        ) : null}
        {canManage
          ? failedPlats.map((p) => (
              <button
                key={p.platform}
                type="button"
                className={BTN_ORANGE}
                disabled={retrying === p.platform}
                onClick={() => void retryPlatform(p.platform)}
              >
                {retrying === p.platform ? "Retrying…" : `Retry ${PLATFORM_LABELS[p.platform]}`}
              </button>
            ))
          : null}
      </div>

      {priceOpen && canManage ? (
        <div className="mt-4 rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg)] p-3 [data-theme=light]:bg-slate-50">
          <p className="mb-2 text-xs font-semibold text-[var(--fh-text)]">Update price on all live platforms</p>
          <div className="flex flex-wrap gap-2">
            <input
              type="number"
              className="h-10 min-w-[140px] flex-1 rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg2)] px-3 font-[family-name:var(--font-dm-mono)] text-sm [data-theme=light]:bg-white"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              placeholder="Price"
            />
            <input
              type="text"
              className="h-10 w-24 rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg2)] px-3 text-sm [data-theme=light]:bg-white"
              value={currencyInput}
              onChange={(e) => setCurrencyInput(e.target.value.toUpperCase())}
              placeholder="USD"
            />
          </div>
          {priceError ? <p className="mt-2 text-sm text-[var(--fh-red)]">{priceError}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={BTN_ORANGE} disabled={priceLoading} onClick={() => void submitPrice()}>
              {priceLoading ? "Updating…" : "Update all platforms"}
            </button>
            <button type="button" className={BTN_GHOST} onClick={() => setPriceOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {soldOpen && canManage ? (
        <div className="mt-4 rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg)] p-3 [data-theme=light]:bg-slate-50">
          <p className="mb-2 text-xs font-semibold text-[var(--fh-text)]">Mark as sold</p>
          <input
            type="number"
            className="mb-2 h-10 w-full max-w-xs rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg2)] px-3 font-[family-name:var(--font-dm-mono)] text-sm [data-theme=light]:bg-white"
            value={soldPriceInput}
            onChange={(e) => setSoldPriceInput(e.target.value)}
            placeholder="Sold price (optional)"
          />
          <label className="mb-1 block text-xs text-[var(--fh-text-dim)]">Sold via</label>
          <select
            className="mb-2 h-10 w-full max-w-xs rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg2)] px-3 text-sm [data-theme=light]:bg-white"
            value={soldVia}
            onChange={(e) => setSoldVia(e.target.value)}
          >
            <option value="">— Not specified —</option>
            {PLATFORMS.map((plat) => (
              <option key={plat} value={plat}>
                {PLATFORM_LABELS[plat]}
              </option>
            ))}
          </select>
          {soldError ? <p className="mb-2 text-sm text-[var(--fh-red)]">{soldError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BTN_ORANGE} disabled={soldLoading} onClick={() => void submitSold()}>
              {soldLoading ? "Saving…" : "Confirm"}
            </button>
            <button type="button" className={BTN_GHOST} onClick={() => setSoldOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
