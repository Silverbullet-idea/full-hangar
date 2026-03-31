"use client"

import type { UpgradeItem } from "@/lib/sellIntel/types"

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
}

type Props = {
  summary: string
  avionicsItems: UpgradeItem[]
}

export default function BestSpendSummary({ summary, avionicsItems }: Props) {
  const doNet = avionicsItems.filter((i) => i.recommendation === "DO").reduce((acc, i) => acc + i.netROI, 0)

  return (
    <div className="rounded-xl border-2 border-emerald-500/40 bg-emerald-500/5 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-emerald-400 [data-theme=light]:text-emerald-800">Best spend before listing</p>
      <p className="mt-2 text-base font-medium leading-relaxed text-[var(--fh-text)] [data-theme=light]:text-slate-900">{summary}</p>
      <p className="mt-4 font-mono text-lg font-bold text-emerald-400 [data-theme=light]:text-emerald-800">
        Expected value: {fmtMoney(doNet)} net after spend
        <span className="block text-xs font-normal text-[var(--fh-text-dim)]">Sum of “DO” upgrades only — illustrative</span>
      </p>
    </div>
  )
}
