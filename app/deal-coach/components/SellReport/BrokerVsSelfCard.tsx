"use client"

import type { BrokerCalc } from "@/lib/sellIntel/types"

function fmtMoney(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
}

type Props = {
  calc: BrokerCalc
  avgDom: number | null
}

export default function BrokerVsSelfCard({ calc, avgDom }: Props) {
  return (
    <div className="rounded-xl border border-[var(--fh-border)] bg-[#161b22] p-4 [data-theme=light]:bg-white">
      <p className="text-sm font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900">Broker vs self</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-[var(--fh-border)] p-3">
          <p className="text-xs font-bold uppercase text-[var(--fh-text-dim)]">Self-sell</p>
          <p className="mt-1 font-mono text-xl font-bold text-[#FF9900]">Net {fmtMoney(calc.selfSellNetEstimate)}</p>
          <p className="mt-2 text-xs text-[var(--fh-text-dim)]">Timeline: {avgDom != null ? `~${Math.round(avgDom)} days avg` : "—"}</p>
          <p className="text-xs text-[var(--fh-text-dim)]">Commission: $0</p>
        </div>
        <div className="rounded-lg border border-[var(--fh-border)] p-3">
          <p className="text-xs font-bold uppercase text-[var(--fh-text-dim)]">Broker</p>
          <p className="mt-1 font-mono text-xl font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900">Net {fmtMoney(calc.brokerNetEstimate)}</p>
          <p className="mt-2 text-xs text-[var(--fh-text-dim)]">Timeline: varies</p>
          <p className="text-xs text-[var(--fh-text-dim)]">Commission: ~$2,700 (illustrative @ 5%)</p>
        </div>
      </div>
      <div className="mt-4 rounded-lg border border-[#FF9900]/30 bg-[#FF9900]/5 p-3 text-sm text-[var(--fh-text)] [data-theme=light]:text-slate-900">{calc.recommendation}</div>
      {calc.breakEvenDaysOnMarket != null ? (
        <p className="mt-2 text-xs text-[var(--fh-text-dim)]">Break-even DOM note: {calc.breakEvenDaysOnMarket} days (model-dependent)</p>
      ) : null}
    </div>
  )
}
