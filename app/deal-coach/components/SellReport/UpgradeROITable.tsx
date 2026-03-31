"use client"

import { useMemo } from "react"
import type { UpgradeItem, UpgradeROIData } from "@/lib/sellIntel/types"

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
}

function recClass(r: UpgradeItem["recommendation"]): string {
  if (r === "DO")
    return "roi-badge-do bg-emerald-500/25 text-emerald-300 ring-emerald-500/40 [data-theme=light]:text-emerald-900"
  if (r === "SKIP") return "roi-badge-skip bg-red-500/25 text-red-300 ring-red-500/40 [data-theme=light]:text-red-900"
  return "roi-badge-optional bg-amber-500/25 text-amber-200 ring-amber-500/40 [data-theme=light]:text-amber-900"
}

function sortKey(r: UpgradeItem["recommendation"]): number {
  if (r === "DO") return 0
  if (r === "OPTIONAL") return 1
  return 2
}

function sellerHasSignatureInstalled(selected: string[] | undefined, signature: string | null): boolean {
  if (!signature?.trim() || !selected?.length) return false
  const c = signature.toLowerCase()
  for (const s of selected) {
    const t = s.toLowerCase().trim()
    if (!t) continue
    if (c.includes(t) || t.includes(c)) return true
  }
  return false
}

function isSignatureRow(itemName: string, signature: string | null): boolean {
  if (!signature?.trim()) return false
  const a = itemName.toLowerCase().replace(/[^a-z0-9]+/g, "")
  const b = signature.toLowerCase().replace(/[^a-z0-9]+/g, "")
  if (a.length < 4 || b.length < 4) return itemName.toLowerCase().includes(signature.toLowerCase().slice(0, 8))
  return a.includes(b.slice(0, 6)) || b.includes(a.slice(0, 6))
}

type Props = {
  items: UpgradeItem[]
  mustSkipItems: string[]
  meta: Pick<
    UpgradeROIData,
    "compsAvionicsFrequency" | "modelSpecificWarnings" | "buyerExpectations" | "signatureUpgrade"
  >
  aircraftMake?: string
  aircraftModel?: string
  activeListingCount?: number
  avionicsSelected?: string[]
}

export default function UpgradeROITable({
  items,
  mustSkipItems,
  meta,
  aircraftMake,
  aircraftModel,
  activeListingCount,
  avionicsSelected,
}: Props) {
  const sorted = useMemo(() => [...items].sort((a, b) => sortKey(a.recommendation) - sortKey(b.recommendation)), [items])

  const top3 = (meta.compsAvionicsFrequency ?? []).slice(0, 3)
  const hasSig = sellerHasSignatureInstalled(avionicsSelected, meta.signatureUpgrade)
  const identity = [aircraftMake, aircraftModel].filter(Boolean).join(" ")

  return (
    <div className="space-y-4">
      {meta.buyerExpectations?.length ? (
        <div className="nudge flex gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100 [data-theme=light]:text-emerald-950">
          <span className="nicon shrink-0" aria-hidden>
            🎯
          </span>
          <div className="ntxt text-[var(--fh-text)] [data-theme=light]:text-slate-900">
            <strong>What {identity || "this market"} buyers expect:</strong> {meta.buyerExpectations.join(" · ")}
          </div>
        </div>
      ) : null}

      {top3.length > 0 ? (
        <div className="nudge info flex gap-3 rounded-xl border border-sky-500/35 bg-sky-500/10 p-4 text-sm [data-theme=light]:text-sky-950">
          <span className="nicon shrink-0" aria-hidden>
            📊
          </span>
          <div className="ntxt text-[var(--fh-text)] [data-theme=light]:text-slate-900">
            <strong>In your {activeListingCount ?? "…"} active comps:</strong>{" "}
            {top3.map((f) => `${f.pctOfComps}% have ${f.token}`).join(" · ")}. Aircraft with these features command a premium — buyers use them as
            filters.
          </div>
        </div>
      ) : null}

      {(meta.modelSpecificWarnings ?? []).map((warning, i) => (
        <div
          key={i}
          className="nudge warn flex gap-3 rounded-xl border border-amber-500/45 bg-amber-500/10 p-4 text-sm text-amber-100 [data-theme=light]:text-amber-950"
        >
          <span className="nicon shrink-0" aria-hidden>
            ⚠️
          </span>
          <div className="ntxt">{warning}</div>
        </div>
      ))}

      {meta.signatureUpgrade && hasSig ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100 [data-theme=light]:text-emerald-950">
          ✓ You have the <strong>{meta.signatureUpgrade}</strong> installed — this is a strong selling point. Mention it prominently in your listing
          headline.
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[var(--fh-border)] bg-[#161b22] [data-theme=light]:bg-white">
        <table className="roi-table w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--fh-border)] text-[10px] uppercase text-[var(--fh-text-dim)]">
              <th className="px-3 py-2">Rec</th>
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Cost</th>
              <th className="px-3 py-2">Value add</th>
              <th className="px-3 py-2">Net ROI</th>
              <th className="px-3 py-2">Rationale</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const topPick =
                meta.signatureUpgrade && !hasSig && isSignatureRow(row.name, meta.signatureUpgrade) ? " ★ TOP PICK" : ""
              const sigRow = meta.signatureUpgrade && !hasSig && isSignatureRow(row.name, meta.signatureUpgrade)
              return (
                <tr
                  key={row.name}
                  className={`border-b border-[var(--fh-border)]/50 align-top print-no-break ${sigRow ? "border-l-4 border-l-[#FF9900]" : ""}`}
                >
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-md px-2 py-1 text-[10px] font-black uppercase ring-1 ${recClass(row.recommendation)}`}>
                      {row.recommendation === "SKIP" ? "✗ SKIP" : row.recommendation}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900">
                    {row.name}
                    {topPick ? <span className="ml-1 text-[10px] font-black text-[#FF9900]">{topPick}</span> : null}
                  </td>
                  <td className="px-3 py-3 font-mono text-[var(--fh-text-dim)]">{fmtMoney(row.installCost)}</td>
                  <td className="px-3 py-3 font-mono text-[var(--fh-text-dim)]">{fmtMoney(row.valueAdd)}</td>
                  <td
                    className={`px-3 py-3 font-mono font-bold ${row.netROI >= 0 ? "roi-net-pos text-emerald-400 [data-theme=light]:text-emerald-700" : "roi-net-neg text-red-400 [data-theme=light]:text-red-700"}`}
                  >
                    {fmtMoney(row.netROI)}
                  </td>
                  <td className="px-3 py-3 text-xs text-[var(--fh-text-dim)]">{row.rationale}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {mustSkipItems.length > 0 ? (
        <div className="rounded-xl border-2 border-red-500/40 bg-red-500/5 p-4 print-no-break">
          <p className="text-sm font-bold text-red-400 [data-theme=light]:text-red-800">Items to skip — negative ROI</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--fh-text-dim)]">
            {mustSkipItems.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
