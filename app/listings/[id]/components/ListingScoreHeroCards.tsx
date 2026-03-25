"use client"

import { useEffect, useState } from "react"
import { FLIP_TIER_CONFIG } from "../../../../lib/scoring/flipTierConfig"
import { formatMoney, formatScore } from "../../../../lib/listings/format"
import { safeDisplay } from "./detailUtils"

type FlipExplanation = {
  p1_pricing_edge?: { pts?: number; max?: number }
  p2_airworthiness?: { pts?: number; max?: number }
  p3_improvement_room?: { pts?: number; max?: number }
  p4_exit_liquidity?: { pts?: number; max?: number }
} | null

type ListingScoreHeroCardsProps = {
  flipTier: string | null
  flipScore: number | null
  flipExplanation: FlipExplanation
  intelligenceVersion: string | null
  askingPrice: number | null
  priceReduced: boolean
  priceReductionAmount: number | null
  daysOnMarket: number | null
  marketMedianLabel: string | null
  trueCostEstimate: number | null
  deferredMaintenanceTotal: number
}

function FlipPillarRow({
  dotClass,
  barClass,
  label,
  pts,
  max,
  animate,
}: {
  dotClass: string
  barClass: string
  label: string
  pts: number | null
  max: number
  animate: boolean
}) {
  const safePts = typeof pts === "number" && Number.isFinite(pts) ? pts : 0
  const pct = max > 0 ? Math.max(0, Math.min(100, (safePts / max) * 100)) : 0
  const width = animate ? pct : 0
  const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const

  return (
    <div className="rounded-lg border border-[var(--fh-border,var(--brand-dark))] bg-[var(--surface-muted)] px-3 py-2 [data-theme=light]:border-slate-200 [data-theme=light]:bg-slate-100">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
          <span
            className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--fh-text-muted)]"
            style={barlow}
          >
            {label}
          </span>
        </div>
        <span
          className="shrink-0 text-base font-bold text-[var(--fh-text,var(--brand-white))] [data-theme=light]:text-slate-900"
          style={barlow}
        >
          {typeof pts === "number" && Number.isFinite(pts) ? `${Math.round(pts)} / ${max}` : `— / ${max}`}
        </span>
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
    </div>
  )
}

export default function ListingScoreHeroCards(props: ListingScoreHeroCardsProps) {
  const [animateBars, setAnimateBars] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setAnimateBars(true), 280)
    return () => window.clearTimeout(t)
  }, [])

  const priceDisclosed = typeof props.askingPrice === "number" && props.askingPrice > 0
  const effectiveFlipScore = priceDisclosed ? props.flipScore : null
  const fk = String(props.flipTier ?? "")
    .trim()
    .toUpperCase()
  const flipCfg = FLIP_TIER_CONFIG[fk]
  const wmText = !priceDisclosed ? "UNDISCLOSED" : flipCfg?.label ?? "FLIP"
  const tierPill = !priceDisclosed
    ? "Price undisclosed — flip score unavailable"
    : flipCfg
      ? `${flipCfg.label} tier`
      : "Flip opportunity"
  const scoreClass = flipCfg
    ? `${flipCfg.text} [data-theme=light]:opacity-90`
    : "text-[var(--fh-text-muted)]"
  const scoreColor = flipCfg ? "var(--fh-orange,#f97316)" : "var(--fh-text-muted)"

  const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const

  const showTrueCost =
    typeof props.trueCostEstimate === "number" && props.trueCostEstimate > 0 && props.deferredMaintenanceTotal > 0

  const ex = props.flipExplanation
  const pillars = [
    { label: "Pricing edge", pts: ex?.p1_pricing_edge?.pts ?? null, max: 35, color: "orange" as const },
    { label: "Airworthiness", pts: ex?.p2_airworthiness?.pts ?? null, max: 20, color: "blue" as const },
    { label: "Improvement room", pts: ex?.p3_improvement_room?.pts ?? null, max: 30, color: "teal" as const },
    { label: "Exit liquidity", pts: ex?.p4_exit_liquidity?.pts ?? null, max: 15, color: "purple" as const },
  ]

  const dotBar = (c: (typeof pillars)[0]["color"]) => {
    if (c === "orange") return { dot: "bg-[#f97316]", bar: "bg-gradient-to-r from-[#fb923c] to-[#ea580c]" }
    if (c === "blue") return { dot: "bg-[#3b82f6]", bar: "bg-gradient-to-r from-[#60a5fa] to-[#2563eb]" }
    if (c === "teal") return { dot: "bg-[#14b8a6]", bar: "bg-gradient-to-r from-[#2dd4bf] to-[#0d9488]" }
    return { dot: "bg-[#a855f7]", bar: "bg-gradient-to-r from-[#c084fc] to-[#7c3aed]" }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative overflow-hidden rounded-xl border border-[var(--fh-border,var(--brand-dark))] bg-[var(--card-bg)] px-4 py-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
        <div
          className="pointer-events-none absolute -right-1 -top-2 select-none text-[clamp(3rem,12vw,4.5rem)] font-extrabold leading-none opacity-[0.06]"
          style={{ ...barlow, color: scoreColor }}
          aria-hidden
        >
          {wmText}
        </div>
        <div className="relative flex flex-wrap items-start justify-between gap-2">
          <span
            className="inline-flex rounded-full border border-[var(--fh-border)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--fh-text-muted)]"
            style={barlow}
          >
            {tierPill}
          </span>
        </div>
        <div
          className="relative mt-2 flex items-baseline gap-1"
          style={barlow}
          aria-label={
            typeof effectiveFlipScore === "number"
              ? `Flip opportunity score: ${Math.round(effectiveFlipScore)} out of 100, tier: ${fk || "unknown"}`
              : undefined
          }
        >
          <span className={`text-[clamp(3rem,10vw,4.25rem)] font-extrabold leading-none ${scoreClass}`}>
            {typeof effectiveFlipScore === "number" ? safeDisplay(formatScore(effectiveFlipScore)) : "N/A"}
          </span>
          <span className="text-lg font-semibold text-[var(--fh-text-muted)]">/100</span>
        </div>
        <p className="relative mb-0 mt-1 text-xs text-[var(--fh-text-muted)]">Flip score</p>
        <p className="relative mb-0 mt-1 text-[11px] leading-snug text-[var(--fh-text-muted)]">
          Flip score measures how well-positioned this aircraft is for a profitable resale.
        </p>
        {props.intelligenceVersion ? (
          <p className="relative mb-0 mt-2 font-mono text-[10px] text-[var(--fh-text-muted)]">
            Intelligence v{props.intelligenceVersion}
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-[var(--fh-border,var(--brand-dark))] bg-[var(--card-bg)] px-4 py-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--fh-text-muted)]" style={barlow}>
          Asking
        </div>
        {typeof props.askingPrice === "number" && props.askingPrice > 0 ? (
          <div
            className="mt-1 text-[clamp(1.75rem,6vw,2.75rem)] font-extrabold text-[var(--fh-orange,#f97316)]"
            style={barlow}
          >
            {formatMoney(props.askingPrice)}
          </div>
        ) : (
          <div className="mt-1 text-base font-semibold text-[var(--fh-text-muted)]">Call for price</div>
        )}
        <div className="mt-3 space-y-1 text-xs text-[var(--fh-text-muted)]">
          {props.priceReduced ? (
            <div className="font-semibold text-[#22c55e]">
              Price reduced
              {typeof props.priceReductionAmount === "number" && props.priceReductionAmount > 0
                ? ` (−${formatMoney(props.priceReductionAmount)})`
                : ""}
            </div>
          ) : null}
          {typeof props.daysOnMarket === "number" ? (
            <div>{`${Math.round(props.daysOnMarket).toLocaleString("en-US")} days on market`}</div>
          ) : null}
          {props.marketMedianLabel ? <div>{props.marketMedianLabel}</div> : null}
        </div>
        {showTrueCost ? (
          <div
            className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/25 px-3 py-2.5"
            style={{ background: "rgba(245, 158, 11, 0.08)" }}
          >
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--fh-text-muted)]" style={barlow}>
                Estimated true cost
              </div>
              <div className="text-[11px] text-[var(--fh-text-muted)]">Includes deferred maintenance</div>
            </div>
            <div className="text-xl font-bold text-amber-500" style={barlow}>
              {formatMoney(props.trueCostEstimate)}
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-[var(--fh-border,var(--brand-dark))] bg-[var(--card-bg)] px-4 py-3 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--fh-text-muted)]" style={barlow}>
          Flip pillars
        </div>
        <div className="flex flex-col gap-2.5">
          {pillars.map((p) => {
            const { dot, bar } = dotBar(p.color)
            return (
              <FlipPillarRow
                key={p.label}
                dotClass={dot}
                barClass={bar}
                label={p.label}
                pts={p.pts}
                max={p.max}
                animate={animateBars}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
