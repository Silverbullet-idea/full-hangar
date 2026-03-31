"use client"

import { useMemo, useState } from "react"
import type { CompListing } from "@/lib/sellIntel/types"

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
}

type SortKey = "price" | "year" | "dom"

type Props = {
  comps: CompListing[]
  suggestedListPrice: number | null
}

export default function CompsTable({ comps, suggestedListPrice }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "price", dir: "asc" })

  const sorted = useMemo(() => {
    const rows = [...comps]
    const mul = sort.dir === "asc" ? 1 : -1
    rows.sort((a, b) => {
      if (sort.key === "price") return (a.askingPrice - b.askingPrice) * mul
      if (sort.key === "year") {
        const ya = a.year ?? 0
        const yb = b.year ?? 0
        return (ya - yb) * mul
      }
      const da = a.daysOnMarket ?? 9999
      const db = b.daysOnMarket ?? 9999
      return (da - db) * mul
    })
    return rows
  }, [comps, sort])

  const toggle = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "price" ? "asc" : "desc" }))
  }

  return (
    <div className="rounded-xl border border-[var(--fh-border)] bg-[#161b22] [data-theme=light]:bg-white">
      <div className="border-b border-[var(--fh-border)] p-4">
        <p className="text-sm font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900">Comparable listings</p>
        <p className="text-xs text-[var(--fh-text-dim)]">Tap column headers to sort.</p>
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="comps-table w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--fh-border)] text-[10px] uppercase text-[var(--fh-text-dim)]">
              <th className="px-4 py-2">
                <button type="button" className="font-bold hover:text-[#FF9900]" onClick={() => toggle("year")}>
                  Year / model {sort.key === "year" ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                </button>
              </th>
              <th className="px-4 py-2">
                <button type="button" className="font-bold hover:text-[#FF9900]" onClick={() => toggle("price")}>
                  Ask {sort.key === "price" ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                </button>
              </th>
              <th className="px-4 py-2">TT</th>
              <th className="px-4 py-2">SMOH</th>
              <th className="px-4 py-2">Location</th>
              <th className="px-4 py-2">
                <button type="button" className="font-bold hover:text-[#FF9900]" onClick={() => toggle("dom")}>
                  DOM {sort.key === "dom" ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                </button>
              </th>
              <th className="px-4 py-2">Score</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => {
              const cheap = suggestedListPrice != null && c.askingPrice < suggestedListPrice
              return (
                <tr key={c.id} className="comps-row print-no-break border-b border-[var(--fh-border)]/60">
                  <td className="px-4 py-2 text-[var(--fh-text)] [data-theme=light]:text-slate-900">
                    {c.year ?? "—"} {c.make} {c.model}
                  </td>
                  <td
                    className={`price-highlight px-4 py-2 font-mono font-semibold ${cheap ? "bg-emerald-500/10 text-emerald-400 [data-theme=light]:text-emerald-700" : "text-[var(--fh-text)]"}`}
                  >
                    {fmtMoney(c.askingPrice)}
                  </td>
                  <td className="px-4 py-2 text-[var(--fh-text-dim)]">{c.ttaf ?? "—"}</td>
                  <td className="px-4 py-2 text-[var(--fh-text-dim)]">{c.smoh ?? "—"}</td>
                  <td className="px-4 py-2 text-[var(--fh-text-dim)]">{c.location ?? "—"}</td>
                  <td className="px-4 py-2 text-[var(--fh-text-dim)]">{c.daysOnMarket ?? "—"}</td>
                  <td className="px-4 py-2">
                    {c.flipScore != null ? (
                      <span className="score-badge rounded bg-[#FF9900]/20 px-2 py-0.5 font-mono text-xs font-bold text-[#FF9900]">
                        {c.flipScore}
                        {c.flipTier ? ` · ${c.flipTier}` : ""}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {c.url ? (
                      <a href={c.url} className="text-xs font-semibold text-[#FF9900] hover:underline" target="_blank" rel="noreferrer">
                        View listing →
                      </a>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 p-4 md:hidden">
        {sorted.map((c) => {
          const cheap = suggestedListPrice != null && c.askingPrice < suggestedListPrice
          return (
            <div key={c.id} className="rounded-lg border border-[var(--fh-border)] p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900">
                  {c.year ?? "—"} {c.model}
                </p>
                <p className={`font-mono text-sm font-bold ${cheap ? "text-emerald-400 [data-theme=light]:text-emerald-700" : "text-[#FF9900]"}`}>
                  {fmtMoney(c.askingPrice)}
                </p>
              </div>
              {c.flipScore != null ? (
                <p className="mt-2 text-xs text-[var(--fh-text-dim)]">
                  Score <span className="font-mono font-bold text-[#FF9900]">{c.flipScore}</span>
                  {c.flipTier ? ` · ${c.flipTier}` : ""}
                </p>
              ) : null}
              {c.url ? (
                <a href={c.url} className="mt-2 inline-block text-xs font-semibold text-[#FF9900]" target="_blank" rel="noreferrer">
                  View listing →
                </a>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
