"use client"

import { useEffect, useState } from "react"

import { getFlipPillarNarrative, type FlipPillarId } from "@/lib/listings/flipPillarNarrative"

type FlipExplanation = {
  p1_pricing_edge?: { pts?: number; max?: number; basis?: string }
  p2_airworthiness?: { pts?: number; max?: number; basis?: string }
  p3_improvement_room?: { pts?: number; max?: number; basis?: string }
  p4_exit_liquidity?: { pts?: number; max?: number; basis?: string }
  raw_total?: number
  risk_cap_applied?: boolean
  suppressed?: string
  error?: string
} | null

type ListingScoreHeroCardsProps = {
  flipExplanation: FlipExplanation
}

function FlipPillarRow({
  pillarId,
  dotClass,
  barClass,
  label,
  pts,
  max,
  basis,
  animate,
}: {
  pillarId: FlipPillarId
  dotClass: string
  barClass: string
  label: string
  pts: number | null
  max: number
  basis?: string
  animate: boolean
}) {
  const safePts = typeof pts === "number" && Number.isFinite(pts) ? pts : 0
  const pct = max > 0 ? Math.max(0, Math.min(100, (safePts / max) * 100)) : 0
  const width = animate ? pct : 0
  const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const
  const narrative = getFlipPillarNarrative(pillarId, pts, max, basis)

  return (
    <details className="flip-pillar-details group rounded-lg border border-[var(--fh-border,var(--brand-dark))] bg-[var(--surface-muted)] [data-theme=light]:border-slate-200 [data-theme=light]:bg-slate-100">
      <summary className="block cursor-pointer list-none rounded-lg px-3 py-2 outline-none [&::-webkit-details-marker]:hidden">
        <div className="flex min-h-[44px] items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
            <span
              className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--fh-text-muted)]"
              style={barlow}
            >
              {label}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className="text-base font-bold text-[var(--fh-text,var(--brand-white))] [data-theme=light]:text-slate-900"
              style={barlow}
            >
              {typeof pts === "number" && Number.isFinite(pts) ? `${Math.round(pts)} / ${max}` : `— / ${max}`}
            </span>
            <span
              className="flip-pillar-chevron mt-0.5 shrink-0 text-[var(--fh-text-muted)] opacity-80"
              aria-hidden
            />
          </div>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--brand-dark)] [data-theme=light]:bg-slate-200">
          <div
            className={`h-full rounded-full ${barClass}`}
            style={{
              width: `${width}%`,
              transition: "width 0.55s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        </div>
      </summary>
      <div className="border-t border-[var(--fh-border,var(--brand-dark))] px-3 pb-3 pt-2 text-xs leading-relaxed text-[var(--fh-text-dim)] [data-theme=light]:border-slate-200 [data-theme=light]:text-slate-600">
        {narrative}
      </div>
    </details>
  )
}

function flipSuppressedMessage(ex: NonNullable<FlipExplanation>): string {
  if (typeof ex.error === "string" && ex.error.trim()) {
    return "Flip pillars couldn’t be computed for this listing (scoring error). Try again later or refresh after the listing is re-scored."
  }
  if (ex.suppressed === "no_disclosed_price") {
    return "Flip pillars need a disclosed asking price. Without a price, pricing edge and the full flip breakdown aren’t shown."
  }
  return "Flip pillars aren’t available for this listing right now."
}

export default function ListingScoreHeroCards(props: ListingScoreHeroCardsProps) {
  const [animateBars, setAnimateBars] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setAnimateBars(true), 280)
    return () => window.clearTimeout(t)
  }, [])

  const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const

  const ex = props.flipExplanation
  const errMsg = ex && typeof ex.error === "string" && ex.error.trim() ? ex.error.trim() : ""
  const supMsg = ex && typeof ex.suppressed === "string" && ex.suppressed.trim() ? ex.suppressed.trim() : ""
  const blocked = Boolean(errMsg || supMsg)

  const pillars: {
    id: FlipPillarId
    label: string
    pts: number | null
    max: number
    basis?: string
    color: "orange" | "blue" | "teal" | "purple"
  }[] = [
    {
      id: "p1",
      label: "Pricing edge",
      pts: ex?.p1_pricing_edge?.pts ?? null,
      max: ex?.p1_pricing_edge?.max ?? 35,
      basis: ex?.p1_pricing_edge?.basis,
      color: "orange",
    },
    {
      id: "p2",
      label: "Airworthiness",
      pts: ex?.p2_airworthiness?.pts ?? null,
      max: ex?.p2_airworthiness?.max ?? 20,
      basis: ex?.p2_airworthiness?.basis,
      color: "blue",
    },
    {
      id: "p3",
      label: "Improvement room",
      pts: ex?.p3_improvement_room?.pts ?? null,
      max: ex?.p3_improvement_room?.max ?? 30,
      basis: ex?.p3_improvement_room?.basis,
      color: "teal",
    },
    {
      id: "p4",
      label: "Exit liquidity",
      pts: ex?.p4_exit_liquidity?.pts ?? null,
      max: ex?.p4_exit_liquidity?.max ?? 15,
      basis: ex?.p4_exit_liquidity?.basis,
      color: "purple",
    },
  ]

  const dotBar = (c: (typeof pillars)[0]["color"]) => {
    if (c === "orange") return { dot: "bg-[#f97316]", bar: "bg-gradient-to-r from-[#fb923c] to-[#ea580c]" }
    if (c === "blue") return { dot: "bg-[#3b82f6]", bar: "bg-gradient-to-r from-[#60a5fa] to-[#2563eb]" }
    if (c === "teal") return { dot: "bg-[#14b8a6]", bar: "bg-gradient-to-r from-[#2dd4bf] to-[#0d9488]" }
    return { dot: "bg-[#a855f7]", bar: "bg-gradient-to-r from-[#c084fc] to-[#7c3aed]" }
  }

  return (
    <div className="rounded-xl border border-[var(--fh-border,var(--brand-dark))] bg-[var(--card-bg)] px-4 py-3 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
      <h2
        className="m-0 mb-3 text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--fh-text-dim)] [data-theme=light]:text-slate-600"
        style={barlow}
      >
        Flip pillars
      </h2>
      {blocked ? (
        <p className="m-0 text-sm leading-relaxed text-[var(--fh-text-dim)] [data-theme=light]:text-slate-600">
          {flipSuppressedMessage(ex)}
        </p>
      ) : (
        <>
          {ex?.risk_cap_applied ? (
            <p className="mb-2.5 mt-0 text-xs leading-relaxed text-[var(--fh-text-dim)] [data-theme=light]:text-slate-600">
              Overall risk is CRITICAL, so the total flip score is capped at 35 even if pillar points sum higher.
            </p>
          ) : null}
          <div className="flex flex-col gap-2.5">
            {pillars.map((p) => {
              const { dot, bar } = dotBar(p.color)
              return (
                <FlipPillarRow
                  key={p.id}
                  pillarId={p.id}
                  dotClass={dot}
                  barClass={bar}
                  label={p.label}
                  pts={p.pts}
                  max={p.max}
                  basis={p.basis}
                  animate={animateBars}
                />
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
