"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useState } from "react"
import { useCurrentUser } from "@/lib/account/useCurrentUser"
import { buildSavedListingsFiltersFromSearchParams } from "@/lib/listings/savedSearchFilters"

export default function SaveListingsSearchButton() {
  const searchParams = useSearchParams()
  const { user, isLoading } = useCurrentUser()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const returnTo = `/listings${searchParams.toString() ? `?${searchParams.toString()}` : ""}`

  const save = async () => {
    setError(null)
    setMessage(null)
    setSaving(true)
    try {
      const filters = buildSavedListingsFiltersFromSearchParams(searchParams)
      const res = await fetch("/api/account/searches", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || "My search",
          filters,
          alert_enabled: false,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(data.error ?? "Could not save search")
        return
      }
      setMessage("Saved. View it under Saved searches in your account.")
      setName("")
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return null
  }

  if (!user) {
    return (
      <Link
        href={`/account/login?returnTo=${encodeURIComponent(returnTo)}`}
        className="text-xs font-semibold text-[var(--fh-orange)] no-underline hover:underline"
        style={{ fontFamily: "var(--font-dm-sans)" }}
      >
        Sign in to save search
      </Link>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
      {message ? (
        <span className="max-w-[220px] text-right text-[11px] text-[var(--fh-text-dim)]" role="status">
          {message}{" "}
          <Link href="/account/searches" className="font-semibold text-[var(--fh-orange)] no-underline hover:underline">
            Open →
          </Link>
        </span>
      ) : null}
      {error ? (
        <span className="text-right text-[11px] text-red-400 [data-theme=light]:text-red-600" role="alert">
          {error}
        </span>
      ) : null}
      {open ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Search name"
            className="min-w-[140px] rounded-md border border-[var(--fh-border)] bg-[var(--fh-bg2)] px-2 py-1 text-xs text-[var(--fh-text)] [data-theme=light]:bg-white"
            aria-label="Name for saved search"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-md border border-[var(--fh-orange)] bg-[var(--fh-orange)]/15 px-2 py-1 text-xs font-semibold text-[var(--fh-orange)] hover:bg-[var(--fh-orange)]/25 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setError(null)
            }}
            className="text-xs text-[var(--fh-text-dim)] hover:underline"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setMessage(null)
            setError(null)
            setOpen(true)
          }}
          className="text-xs font-semibold text-[var(--fh-orange)] hover:underline"
          style={{ fontFamily: "var(--font-dm-sans)" }}
        >
          Save search
        </button>
      )}
    </div>
  )
}
