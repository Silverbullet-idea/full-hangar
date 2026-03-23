"use client"

import { useEffect, useState } from "react"
import { getDealTierMeta } from "../../../../lib/listings/dealTier"
import { formatMoney, formatScore } from "../../../../lib/listings/format"
import { safeDisplay } from "./detailUtils"

type ListingScoreHeroCardsProps = {
  dealTier: string | null
  primaryScore: number | null
  primaryLabel: string
  scoreColor: string
  intelligenceVersion: string | null
  percentileLabel?: string | null
  askingPrice: number | null
  priceReduced: boolean
  priceReductionAmount: number | null
  daysOnMarket: number | null
  marketMedianLabel: string | null
  trueCostEstimate: number | null
  deferredMaintenanceTotal: number
  marketScore: number | null
  conditionScore: number | null
  executionScore: number | null
  pillarNotes: { market: string | null; condition: string | null; execution: string | null }
}

function tierFromScore(score: number | null): { label: string; wm: string; scoreClass: string } {
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return { label: "Unscored", wm: "SCORE", scoreClass: "text-[var(--fh-text-muted)]" }
  }
  if (score >= 85) return { label: "Strong buy zone", wm: "STRONG", scoreClass: "text-[#22c55e]" }
  if (score >= 70) return { label: "Good opportunity", wm: "GOOD", scoreClass: "text-[#38bdf8]" }
  if (score >= 50) return { label: "Mixed — inspect", wm: "MIXED", scoreClass: "text-[#fbbf24]" }
  return { label: "High risk", wm: "CAUTION", scoreClass: "text-[#f87171]" }
}

function PillarRow({
  dotClass,
  barClass,
  label,
  score,
  note,
  animate,
}: {
  dotClass: string
  barClass: string
  label: string
  score: number | null
  note: string | null
  animate: boolean
}) {
  const pct = typeof score === "number" && Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0
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
        <span className="shrink-0 text-base font-bold text-[var(--fh-text,var(--brand-white))] [data-theme=light]:text-slate-900" style={barlow}>
          {safeDisplay(formatScore(score))}/100
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
      {note ? <p className="mb-0 mt-1.5 text-[11px] leading-snug text-[var(--fh-text-muted)]">{note}</p> : null}
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
  const effectiveDealTier = priceDisclosed ? props.dealTier : null
  const effectivePrimaryScore = priceDisclosed ? props.primaryScore : null
  const dealMeta = getDealTierMeta(effectiveDealTier)
  const tierScore = tierFromScore(effectivePrimaryScore)
  const wmText = !priceDisclosed ? "UNDISCLOSED" : dealMeta?.label?.toUpperCase() ?? tierScore.wm
  const tierPill = !priceDisclosed ? "Price undisclosed — deal score suppressed" : dealMeta?.label ?? tierScore.label

  const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const

  const showTrueCost =
    typeof props.trueCostEstimate === "number" && props.trueCostEstimate > 0 && props.deferredMaintenanceTotal > 0

  return (
    <div className="flex flex-col gap-4">
      {/* Overall score */}
      <div className="relative overflow-hidden rounded-xl border border-[var(--fh-border,var(--brand-dark))] bg-[var(--card-bg)] px-4 py-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
        <div
          className="pointer-events-none absolute -right-1 -top-2 select-none text-[clamp(3rem,12vw,4.5rem)] font-extrabold leading-none opacity-[0.06]"
          style={{ ...barlow, color: props.scoreColor }}
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
          {props.percentileLabel ? (
            <span className="text-xs text-[var(--fh-text-muted)]">{props.percentileLabel}</span>
          ) : null}
        </div>
        <div className="relative mt-2 flex items-baseline gap-1" style={barlow}>
          <span
            className={`text-[clamp(3rem,10vw,4.25rem)] font-extrabold leading-none ${priceDisclosed ? tierScore.scoreClass : "text-[var(--fh-text-muted)]"}`}
          >
            {priceDisclosed ? safeDisplay(formatScore(effectivePrimaryScore)) : "N/A"}
          </span>
          <span className="text-lg font-semibold text-[var(--fh-text-muted)]">/100</span>
        </div>
        <p className="relative mb-0 mt-1 text-xs text-[var(--fh-text-muted)]">{props.primaryLabel}</p>
        {props.intelligenceVersion ? (
          <p className="relative mb-0 mt-2 font-mono text-[10px] text-[var(--fh-text-muted)]">
            Intelligence v{props.intelligenceVersion}
          </p>
        ) : null}
      </div>

      {/* Price */}
      <div className="rounded-xl border border-[var(--fh-border,var(--brand-dark))] bg-[var(--card-bg)] px-4 py-4 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--fh-text-muted)]" style={barlow}>
          Asking
        </div>
        {typeof props.askingPrice === "number" && props.askingPrice > 0 ? (
          <div className="mt-1 text-[clamp(1.75rem,6vw,2.75rem)] font-extrabold text-[var(--fh-orange,#f97316)]" style={barlow}>
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

      {/* Pillars */}
      <div className="rounded-xl border border-[var(--fh-border,var(--brand-dark))] bg-[var(--card-bg)] px-4 py-3 [data-theme=light]:border-slate-200 [data-theme=light]:bg-white">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--fh-text-muted)]" style={barlow}>
          Score pillars
        </div>
        <div className="flex flex-col gap-2.5">
          <PillarRow
            dotClass="bg-[#f97316]"
            barClass="bg-gradient-to-r from-[#fb923c] to-[#ea580c]"
            label="Market"
            score={props.marketScore}
            note={props.pillarNotes.market}
            animate={animateBars}
          />
          <PillarRow
            dotClass="bg-[#22c55e]"
            barClass="bg-gradient-to-r from-[#4ade80] to-[#16a34a]"
            label="Condition"
            score={props.conditionScore}
            note={props.pillarNotes.condition}
            animate={animateBars}
          />
          <PillarRow
            dotClass="bg-[#fbbf24]"
            barClass="bg-gradient-to-r from-[#fcd34d] to-[#d97706]"
            label="Execution"
            score={props.executionScore}
            note={props.pillarNotes.execution}
            animate={animateBars}
          />
        </div>
      </div>
    </div>
  )
}
