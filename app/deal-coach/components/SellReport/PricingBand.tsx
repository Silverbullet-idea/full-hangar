"use client"

function fmtMoney(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n)
}

type Props = {
  floor: number | null
  suggested: number | null
  p75: number | null
  yourTarget: number | null | undefined
}

export default function PricingBand({ floor, suggested, p75, yourTarget }: Props) {
  const vals = [floor, suggested, p75].filter((v): v is number => v != null && Number.isFinite(v))
  const min = vals.length ? Math.min(...vals) : 0
  const max = vals.length ? Math.max(...vals) : 1
  const span = max - min || 1

  const pos = (n: number | null) => {
    if (n == null || !Number.isFinite(n)) return null
    return Math.max(0, Math.min(100, ((n - min) / span) * 100))
  }

  const rel =
    yourTarget != null && suggested != null && suggested > 0 ? ((yourTarget - suggested) / suggested) * 100 : null

  return (
    <div className="rounded-xl border border-[var(--fh-border)] bg-[#161b22] p-4 [data-theme=light]:bg-white">
      <p className="text-sm font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900">Price band</p>
      <div className="relative mt-6 h-3 rounded-full bg-[#0d1117] [data-theme=light]:bg-slate-200">
        {floor != null ? (
          <div
            className="absolute top-1/2 h-4 w-px -translate-y-1/2 bg-[var(--fh-text-dim)]"
            style={{ left: `${pos(floor)}%` }}
            title="Floor"
          />
        ) : null}
        {suggested != null ? (
          <div
            className="absolute top-1/2 h-6 w-1 -translate-y-1/2 rounded-sm bg-[#FF9900]"
            style={{ left: `${pos(suggested)}%`, marginLeft: -2 }}
            title="Suggested list"
          />
        ) : null}
        {p75 != null ? (
          <div
            className="absolute top-1/2 h-4 w-px -translate-y-1/2 bg-emerald-500"
            style={{ left: `${pos(p75)}%` }}
            title="P75 market"
          />
        ) : null}
      </div>
      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
        <div>
          <p className="text-[var(--fh-text-dim)]">Negotiation floor</p>
          <p className="font-mono font-bold text-[var(--fh-text-muted)]">{fmtMoney(floor)}</p>
        </div>
        <div>
          <p className="text-[var(--fh-text-dim)]">Suggested list</p>
          <p className="font-mono text-lg font-bold text-[#FF9900]">{fmtMoney(suggested)}</p>
        </div>
        <div>
          <p className="text-[var(--fh-text-dim)]">Top of market (P75)</p>
          <p className="font-mono font-bold text-emerald-500 [data-theme=light]:text-emerald-700">{fmtMoney(p75)}</p>
        </div>
      </div>
      {rel != null ? (
        <p className="mt-4 text-sm text-[var(--fh-text-dim)]">
          Your target of {fmtMoney(yourTarget ?? null)} is{" "}
          <span className={`font-mono font-bold ${rel > 0 ? "text-[#FF9900]" : rel < 0 ? "text-emerald-500" : ""}`}>
            {rel > 0 ? `${rel.toFixed(1)}% above` : rel < 0 ? `${Math.abs(rel).toFixed(1)}% below` : "aligned with"}
          </span>{" "}
          the suggested list price.
        </p>
      ) : null}

      <div className="price-band-print mt-4 hidden h-6 w-full overflow-hidden rounded-md print:flex">
        <div className="price-band-floor flex flex-[1] items-center justify-center bg-slate-200 text-[10px] font-semibold text-slate-700">
          {fmtMoney(floor)}
        </div>
        <div className="price-band-list flex flex-[1.2] items-center justify-center bg-[#FF9900] text-[10px] font-bold text-black">
          {fmtMoney(suggested)}
        </div>
        <div className="price-band-top flex flex-[1] items-center justify-center bg-emerald-600 text-[10px] font-semibold text-white">
          {fmtMoney(p75)}
        </div>
      </div>
    </div>
  )
}
