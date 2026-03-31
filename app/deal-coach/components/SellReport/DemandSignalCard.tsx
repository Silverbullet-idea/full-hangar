"use client"

import type { MarketPositionData } from "@/lib/sellIntel/types"

function tierStyles(tier: MarketPositionData["demandTier"]): string {
  if (tier === "HIGH") return "bg-emerald-500/20 text-emerald-400 ring-emerald-500/40 [data-theme=light]:text-emerald-800"
  if (tier === "LOW") return "bg-red-500/20 text-red-400 ring-red-500/40 [data-theme=light]:text-red-800"
  if (tier === "MODERATE") return "bg-amber-500/20 text-amber-300 ring-amber-500/40 [data-theme=light]:text-amber-900"
  return "bg-slate-500/20 text-slate-300 ring-slate-500/40 [data-theme=light]:text-slate-800"
}

type Props = {
  market: MarketPositionData
}

export default function DemandSignalCard({ market }: Props) {
  const tier = market.demandTier
  const label = tier ? `${tier} DEMAND` : "DEMAND UNKNOWN"
  const maxCount = Math.max(1, ...market.topStates.map((s) => s.count))

  return (
    <div className="rounded-xl border border-[var(--fh-border)] bg-[#161b22] p-4 [data-theme=light]:bg-white">
      <p
        className={`demand-badge-print inline-flex rounded-lg px-4 py-2 text-sm font-black uppercase tracking-wide ring-1 ${tier === "HIGH" ? "demand-high" : tier === "MODERATE" ? "demand-moderate" : tier === "LOW" ? "demand-low" : ""} ${tierStyles(tier)}`}
      >
        {label}
      </p>

      <div className="states-bar-print mt-4 space-y-2">
        <p className="text-xs font-bold uppercase text-[var(--fh-text-dim)]">Top states</p>
        {market.topStates.map((s) => (
          <div key={s.state} className="states-bar-row flex items-center gap-2">
            <span className="states-bar-label w-8 font-mono text-sm font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900">
              {s.state}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#0d1117] [data-theme=light]:bg-slate-200">
              <div className="states-bar-fill h-full rounded-full bg-[#FF9900]/80" style={{ width: `${(s.count / maxCount) * 100}%` }} />
            </div>
            <span className="states-bar-count w-6 text-right font-mono text-xs text-[var(--fh-text-dim)]">{s.count}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-[var(--fh-border)] bg-[#0d1117]/80 p-3 [data-theme=light]:bg-slate-50">
        <p className="font-mono text-lg font-bold text-[#FF9900]">{market.recentOwnershipChanges}</p>
        <p className="text-sm font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900">ownership changes in the last 12 months</p>
        <p className="mt-2 text-xs leading-relaxed text-[var(--fh-text-dim)]">
          This means roughly {market.recentOwnershipChanges} aircraft of this type exchanged hands recently. Active transaction history indicates real
          buyer demand.
        </p>
      </div>
    </div>
  )
}
