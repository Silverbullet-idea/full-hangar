"use client"

import type { MarketPositionData } from "@/lib/sellIntel/types"

function fmtMoney(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
}

type Props = {
  market: MarketPositionData
}

export default function MarketSnapshot({ market }: Props) {
  const pct = market.priceVsMedianPercent
  const vsLine =
    pct == null || !Number.isFinite(pct)
      ? "—"
      : pct > 0
        ? `+${pct.toFixed(1)}% above median`
        : pct < 0
          ? `${pct.toFixed(1)}% below median`
          : "At median"

  const domMuted = typeof market.avgDaysOnMarket === "number" && market.avgDaysOnMarket > 60

  return (
    <div className="market-snapshot-grid grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="market-snapshot-card print-no-break rounded-xl border border-[var(--fh-border)] bg-[#161b22] p-4 [data-theme=light]:bg-white">
        <p className="card-label text-[10px] font-bold uppercase tracking-wide text-[var(--fh-text-dim)]">Median ask</p>
        <p className="card-value mt-1 font-mono text-xl font-bold text-[#FF9900]">{fmtMoney(market.medianAskPrice)}</p>
        {market.p25AskPrice != null && market.p75AskPrice != null ? (
          <p className="card-range mt-1 font-mono text-xs text-[var(--fh-text-dim)]">
            {fmtMoney(market.p25AskPrice)} – {fmtMoney(market.p75AskPrice)} range
          </p>
        ) : null}
      </div>
      <div className="market-snapshot-card print-no-break rounded-xl border border-[var(--fh-border)] bg-[#161b22] p-4 [data-theme=light]:bg-white">
        <p className="card-label text-[10px] font-bold uppercase tracking-wide text-[var(--fh-text-dim)]">Active listings</p>
        <p className="card-value mt-1 text-xl font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900">
          {market.activeListingCount}
        </p>
        <p className="text-xs text-[var(--fh-text-dim)]">aircraft for sale</p>
      </div>
      <div className="market-snapshot-card print-no-break rounded-xl border border-[var(--fh-border)] bg-[#161b22] p-4 [data-theme=light]:bg-white">
        <p className="card-label text-[10px] font-bold uppercase tracking-wide text-[var(--fh-text-dim)]">Avg days on market</p>
        <p
          className={`mt-1 text-xl font-bold [data-theme=light]:text-slate-900 ${domMuted ? "text-[var(--fh-text-dim)]" : "text-[var(--fh-text)]"}`}
        >
          {market.avgDaysOnMarket != null ? `${Math.round(market.avgDaysOnMarket)} days` : "—"}
        </p>
      </div>
      <div className="market-snapshot-card print-no-break col-span-2 rounded-xl border border-[var(--fh-border)] bg-[#161b22] p-4 lg:col-span-1 [data-theme=light]:bg-white">
        <p className="card-label text-[10px] font-bold uppercase tracking-wide text-[var(--fh-text-dim)]">Your price vs market</p>
        <p
          className={`mt-1 font-mono text-lg font-bold ${
            pct != null && pct > 0 ? "text-[#FF9900]" : pct != null && pct < 0 ? "text-emerald-500" : "text-[var(--fh-text)]"
          }`}
        >
          {vsLine}
        </p>
      </div>
    </div>
  )
}
