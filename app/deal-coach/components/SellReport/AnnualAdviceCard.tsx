"use client"

import type { AnnualAdvice } from "@/lib/sellIntel/types"

function statusLabel(s: AnnualAdvice["status"]): string {
  switch (s) {
    case "fresh":
      return "Fresh annual"
    case "current":
      return "Current"
    case "expiring_soon":
      return "Expiring soon"
    case "expired":
      return "Expired"
    default:
      return "Unknown"
  }
}

type Props = {
  advice: AnnualAdvice
}

export default function AnnualAdviceCard({ advice }: Props) {
  return (
    <div className="rounded-xl border border-[var(--fh-border)] bg-[#161b22] p-4 [data-theme=light]:bg-white">
      <span className="inline-flex rounded-md bg-[#FF9900]/20 px-2 py-1 text-[10px] font-black uppercase text-[#FF9900]">{statusLabel(advice.status)}</span>
      <p className="mt-3 text-sm leading-relaxed text-[var(--fh-text)] [data-theme=light]:text-slate-900">{advice.recommendation}</p>
      {advice.estimatedCost != null ? (
        <p className="mt-2 font-mono text-sm text-[var(--fh-text-dim)]">
          Est. cost: {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(advice.estimatedCost)}
        </p>
      ) : null}
    </div>
  )
}
