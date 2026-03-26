import type { ReactNode } from "react"
import { formatMoney, formatScore } from "../../../../lib/listings/format"

export type ListingIdentityQuickStat = {
  label: string
  value: string
  tone?: "default" | "good" | "warn"
}

type ListingIdentityBarProps = {
  title: string
  nNumber: string
  location: string | null
  fractionalRow?: ReactNode
  stats: ListingIdentityQuickStat[]
  askingPrice: number | null
  flipScore: number | null
  flipScoreColor: string
}

export default function ListingIdentityBar({
  title,
  nNumber,
  location,
  fractionalRow,
  stats,
  askingPrice,
  flipScore,
  flipScoreColor,
}: ListingIdentityBarProps) {
  const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const
  const hasAsking = typeof askingPrice === "number" && askingPrice > 0
  const flipScoreAria =
    typeof flipScore === "number" && Number.isFinite(flipScore)
      ? `Flip score: ${Math.round(flipScore)} out of 100`
      : "Flip score not available"

  return (
    <div
      className="border-t border-[var(--fh-border,var(--brand-dark))] bg-[var(--card-bg)] px-4 py-3 [data-theme=light]:bg-slate-50"
      style={{ borderRadius: "0 0 12px 12px" }}
    >
      {fractionalRow}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <h1
          className="m-0 min-w-0 flex-1 text-[clamp(1.35rem,3.5vw,1.875rem)] font-extrabold leading-tight text-[var(--fh-text,var(--brand-white))] [data-theme=light]:text-slate-900"
          style={barlow}
        >
          <span className="text-[var(--fh-text,var(--brand-white))] [data-theme=light]:text-slate-900">{title}</span>
          <span className="text-[var(--fh-text-muted,var(--brand-muted))] font-bold"> — </span>
          {hasAsking ? (
            <span className="font-extrabold text-[#22c55e] [data-theme=light]:text-emerald-600">
              {formatMoney(askingPrice)} asking
            </span>
          ) : (
            <span className="font-semibold text-[var(--fh-text-muted,var(--brand-muted))]">Price undisclosed</span>
          )}
        </h1>
        <div
          className="shrink-0 sm:text-right"
          style={barlow}
          aria-label={flipScoreAria}
        >
          <div className="flex items-baseline gap-1 sm:justify-end">
            <span
              className="text-[clamp(1.75rem,5vw,2.5rem)] font-extrabold leading-none tabular-nums"
              style={{ color: flipScoreColor }}
            >
              {typeof flipScore === "number" && Number.isFinite(flipScore) ? formatScore(flipScore) : "N/A"}
            </span>
            <span className="text-sm font-semibold text-[var(--fh-text-muted,var(--brand-muted))]">/100</span>
          </div>
          <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--fh-text-muted,var(--brand-muted))]">
            Flip score
          </div>
        </div>
      </div>

      {nNumber && nNumber !== "—" ? (
        <div className="mt-2">
          <span
            className="inline-flex rounded-md border border-[var(--fh-border,var(--brand-dark))] bg-[var(--surface-muted)] px-2.5 py-1 text-sm font-semibold tracking-wide text-[var(--fh-text,var(--brand-white))] sm:text-base [data-theme=light]:bg-slate-100 [data-theme=light]:text-slate-800"
            style={barlow}
          >
            {nNumber}
          </span>
        </div>
      ) : null}

      {location ? (
        <p className="mb-0 mt-2 text-sm text-[var(--fh-text-muted,var(--brand-muted))]">{location}</p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-[var(--fh-border,var(--brand-dark))] bg-[var(--surface-muted)] px-2.5 py-2 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white"
          >
            <div
              className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--fh-text-muted,var(--brand-muted))]"
              style={barlow}
            >
              {s.label}
            </div>
            <div
              className={`mt-0.5 text-lg font-bold leading-tight [data-theme=light]:text-slate-900 ${
                s.tone === "good"
                  ? "text-[#22c55e]"
                  : s.tone === "warn"
                    ? "text-[#f59e0b]"
                    : "text-[var(--fh-text,var(--brand-white))]"
              }`}
              style={barlow}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
