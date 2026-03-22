"use client"

import { useEffect, useState } from "react"

type ListingsMetaResponse = {
  meta: { total: number } | null
  error: string | null
}

export default function HeaderLiveCountPill() {
  const [total, setTotal] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    const ac = new AbortController()
    fetch("/api/listings?pageSize=1&page=1", { signal: ac.signal })
      .then((res) => res.json() as Promise<ListingsMetaResponse>)
      .then((body) => {
        if (cancelled) return
        const n = body.meta?.total
        if (typeof n === "number" && Number.isFinite(n)) setTotal(n)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      ac.abort()
    }
  }, [])

  const countText =
    total === null ? "…" : total.toLocaleString("en-US")

  return (
    <p
      className="fh-live-count-pill m-0 whitespace-nowrap"
      style={{ fontFamily: "var(--font-dm-mono), ui-monospace, monospace" }}
    >
      <span className="font-semibold text-[var(--fh-orange)]">{countText}</span> listings live
    </p>
  )
}
