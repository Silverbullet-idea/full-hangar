"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import type { StepProps } from "./types"

const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const

export default function StepSellStub({ answers }: StepProps) {
  const make = answers.aircraft?.make ?? ""
  const model = answers.aircraft?.model ?? ""
  const [total, setTotal] = useState<number | null>(null)

  useEffect(() => {
    if (!make && !model) return
    const qs = new URLSearchParams()
    if (make) qs.set("make", make)
    if (model) qs.set("model", model)
    qs.set("pageSize", "1")
    fetch(`/api/listings?${qs.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        const t = j?.meta?.total
        setTotal(typeof t === "number" ? t : null)
      })
      .catch(() => setTotal(null))
  }, [make, model])

  const listingsHref = `/listings?${new URLSearchParams({ ...(make ? { make } : {}), ...(model ? { model } : {}) }).toString()}`

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h2 className="text-2xl font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900" style={barlow}>
        Sell intelligence — coming soon
      </h2>
      <p className="text-sm text-[var(--fh-text-dim)]">
        We&apos;re building a full market positioning report for sellers. In the meantime, here&apos;s what we know about the
        market for your aircraft:
      </p>
      <div className="rounded-xl border border-[var(--fh-border)] bg-[#161b22] p-4 [data-theme=light]:bg-white">
        <p className="text-sm text-[var(--fh-text)]">
          <span className="font-semibold">{make || "—"} {model || ""}</span>
        </p>
        <ul className="mt-3 space-y-2 text-sm text-[var(--fh-text-dim)]">
          <li>Active listings (inventory match): {total != null ? total.toLocaleString() : "—"}</li>
          <li>Median ask / DOM: use Browse comparables for live medians.</li>
        </ul>
      </div>
      <Link
        href={listingsHref}
        className="inline-flex w-full items-center justify-center rounded-lg border border-[#FF9900] py-3 text-sm font-bold text-[#FF9900]"
      >
        Browse comparable listings →
      </Link>
    </div>
  )
}
