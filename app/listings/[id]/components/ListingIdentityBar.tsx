import type { ReactNode } from "react"

export type ListingIdentityQuickStat = {
  label: string
  value: string
  tone?: "default" | "good" | "warn"
}

type ListingIdentityBarProps = {
  title: string
  nNumber: string
  location: string | null
  metaLine?: string | null
  fractionalRow?: ReactNode
  stats: ListingIdentityQuickStat[]
}

export default function ListingIdentityBar({
  title,
  nNumber,
  location,
  metaLine,
  fractionalRow,
  stats,
}: ListingIdentityBarProps) {
  const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const

  return (
    <div
      className="border-t border-[var(--fh-border,var(--brand-dark))] bg-[var(--card-bg)] px-4 py-3 [data-theme=light]:bg-slate-50"
      style={{ borderRadius: "0 0 12px 12px" }}
    >
      {fractionalRow}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1
            className="m-0 text-[clamp(1.35rem,3.5vw,1.875rem)] font-extrabold leading-tight text-[var(--fh-text,var(--brand-white))] [data-theme=light]:text-slate-900"
            style={barlow}
          >
            {title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {nNumber && nNumber !== "—" ? (
              <span
                className="inline-flex rounded-md border border-[var(--fh-border,var(--brand-dark))] bg-[var(--surface-muted)] px-2 py-0.5 text-xs font-semibold tracking-wide text-[var(--fh-text,var(--brand-white))] [data-theme=light]:bg-slate-100 [data-theme=light]:text-slate-800"
                style={barlow}
              >
                {nNumber}
              </span>
            ) : null}
            {location ? (
              <span className="text-sm text-[var(--fh-text-muted,var(--brand-muted))]">{location}</span>
            ) : null}
          </div>
          {metaLine ? (
            <p className="mb-0 mt-1 text-xs text-[var(--fh-text-muted,var(--brand-muted))]">{metaLine}</p>
          ) : null}
        </div>
      </div>

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
