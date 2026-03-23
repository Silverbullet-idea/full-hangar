import type { ReactNode } from "react"
import CompsChartPanel from "../CompsChartPanelLazy"
import DetailSectionCard, { DetailBadge } from "./DetailSectionCard"

export type LlpRow = {
  name: string
  status: "OK" | "CHECK_DATE" | "NOT_DISCLOSED" | "EXPIRED"
  note?: string | null
  costLabel?: string | null
}

type EngineValueInput = {
  remainingValue: number | null
  overrunLiability: number | null
  reservePerHour: number | null
  hoursSmoh: number | null
  tboHours: number | null
  replacementCost: number | null
  dataQuality?: string | null
  explanation?: string | null
  tboReferenceLine?: string | null
  showCalendarWarning?: boolean
} | null

type ListingDetailBodySectionsProps = {
  listingId: string
  faaMatched: boolean
  airframeRows: Array<[string, ReactNode]>
  engineLifePercent: number | null
  engineModelText: string
  engineValuePanel: EngineValueInput
  formatMoney: (value: number | null | undefined) => string
  formatHours: (value: number | null | undefined) => string
  avionicsScore: number | null
  installedAvionicsValue: number | null
  avionicsMatchedItems: Array<{ label: string; value: number | null }>
  detectedStcs: Array<{ label: string; value: number | null }>
  panelTypeLabel: string
  isSteamGauge: boolean
  toTitleCase: (value: string) => string
  llpRows: LlpRow[]
  deferredMaintenanceTotal: number
  askingPrice: number | null
  medianCompPrice: number | null
  compSampleLabel: string
  compUniverseCount: number
  descriptionText: string
  sourceUrl: string | null
  sourceLinkLabel: string
  logbookUrls: string[]
}

const barlow = { fontFamily: "var(--font-barlow-condensed), system-ui, sans-serif" } as const
const mono = { fontFamily: "var(--font-dm-mono), ui-monospace, monospace" } as const

const DONUT_C = 239.9

function statusPill(status: LlpRow["status"]) {
  if (status === "OK") return <DetailBadge tone="green">OK</DetailBadge>
  if (status === "CHECK_DATE") return <DetailBadge tone="amber">CHECK DATE</DetailBadge>
  if (status === "EXPIRED") return <DetailBadge tone="red">EXPIRED</DetailBadge>
  return <DetailBadge tone="neutral">NOT DISCLOSED</DetailBadge>
}

function EngineDonut({ lifePct }: { lifePct: number | null }) {
  const pct = typeof lifePct === "number" && Number.isFinite(lifePct) ? Math.max(0, Math.min(100, lifePct)) : null
  const arc = pct !== null ? (pct / 100) * DONUT_C : 0
  const color =
    pct === null ? "var(--fh-text-muted)" : pct >= 50 ? "var(--fh-green)" : pct >= 25 ? "var(--fh-amber)" : "var(--fh-red)"

  return (
    <div className="flex shrink-0 flex-col items-center justify-center">
      <svg width={100} height={100} viewBox="0 0 100 100" aria-hidden className="shrink-0 -rotate-90">
        <circle cx="50" cy="50" r="38" fill="none" stroke="var(--fh-bg3)" strokeWidth="10" />
        {pct !== null ? (
          <circle
            cx="50"
            cy="50"
            r="38"
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${arc} ${DONUT_C - arc}`}
          />
        ) : null}
      </svg>
      <div className="-mt-[4.5rem] flex flex-col items-center text-center">
        <span className="text-xl font-extrabold leading-none" style={{ ...barlow, color }}>
          {pct !== null ? `${Math.round(pct)}%` : "—"}
        </span>
        <span className="mt-0.5 text-[8px] text-[var(--fh-text-muted)]">life left</span>
      </div>
    </div>
  )
}

function SpecTable({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <table className="fh-detail-spec w-full border-collapse text-left">
      <tbody>
        {rows.map(([label, value], i) => (
          <tr key={label} className={i < rows.length - 1 ? "fh-detail-spec-row" : ""}>
            <th scope="row" className="fh-detail-spec-label py-2 pr-3 align-top text-[11px] font-medium text-[var(--fh-text-muted)] [width:44%]">
              {label}
            </th>
            <td
              className="py-2 align-top text-[13px] font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900"
              style={mono}
            >
              {value}
            </td>
          </tr>
        ))}
      </tbody>
      <style>{`
        .fh-detail-spec-row {
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }
        [data-theme="light"] .fh-detail-spec-row {
          border-bottom-color: rgba(0, 0, 0, 0.06);
        }
      `}</style>
    </table>
  )
}

export default function ListingDetailBodySections(props: ListingDetailBodySectionsProps) {
  const ev = props.engineValuePanel
  const quality = String(ev?.dataQuality ?? "")
    .trim()
    .toLowerCase()
  const evScored =
    ev &&
    quality !== "none" &&
    (quality === "tbo_only" ||
      (typeof ev.hoursSmoh === "number" && typeof ev.tboHours === "number" && ev.tboHours > 0) ||
      (typeof ev.remainingValue === "number" && ev.remainingValue > 0) ||
      (typeof ev.overrunLiability === "number" && ev.overrunLiability > 0))

  const lifePct = props.engineLifePercent
  const smohColor =
    lifePct === null
      ? "var(--fh-text)"
      : lifePct >= 50
        ? "var(--fh-green)"
        : lifePct >= 25
          ? "var(--fh-amber)"
          : "var(--fh-red)"

  const insight =
    typeof ev?.overrunLiability === "number" && ev.overrunLiability > 0
      ? {
          tone: "red" as const,
          text: `Engine past TBO — overrun liability ~${props.formatMoney(ev.overrunLiability)}. Price this into your offer.`,
        }
      : lifePct !== null && lifePct >= 50
        ? {
            tone: "green" as const,
            text: `Engine is fresh — strong remaining life on ${props.engineModelText || "this powerplant"}.`,
          }
        : lifePct !== null && lifePct >= 25
          ? {
              tone: "amber" as const,
              text: `Engine approaching TBO — budget a ${props.formatMoney(Math.max(35000, ev?.replacementCost ?? 45000))} overhaul reserve.`,
            }
          : lifePct !== null
            ? {
                tone: "red" as const,
                text: `Low engine life remaining — confirm overhaul status and pricing with the seller.`,
              }
            : null

  const hoursRem =
    typeof ev?.hoursSmoh === "number" && typeof ev?.tboHours === "number" && ev.tboHours > ev.hoursSmoh
      ? ev.tboHours - ev.hoursSmoh
      : null

  const llpBad = props.llpRows.filter((r) => r.status === "CHECK_DATE" || r.status === "EXPIRED")

  const saveEst =
    typeof props.askingPrice === "number" &&
    props.askingPrice > 0 &&
    typeof props.medianCompPrice === "number" &&
    props.medianCompPrice > 0
      ? props.medianCompPrice - props.askingPrice
      : null

  const compBadgeCount =
    props.compUniverseCount > 0
      ? props.compUniverseCount
      : typeof props.compSampleLabel === "string" && /\d+/.test(props.compSampleLabel)
        ? Number.parseInt(props.compSampleLabel.match(/\d+/)?.[0] ?? "0", 10)
        : 0

  return (
    <div className="flex flex-col gap-5">
      <DetailSectionCard
        icon="✈"
        title="Airframe & Identity"
        badges={
          <>
            <DetailBadge tone={props.faaMatched ? "green" : "amber"}>{props.faaMatched ? "FAA MATCHED" : "FAA UNMATCHED"}</DetailBadge>
          </>
        }
      >
        <SpecTable rows={props.airframeRows} />
      </DetailSectionCard>

      <DetailSectionCard
        icon="⚙"
        title="Engine Intelligence"
        badges={
          <>
            {lifePct !== null ? (
              <DetailBadge tone={lifePct >= 50 ? "green" : lifePct >= 25 ? "amber" : "red"}>
                {`${Math.round(lifePct)}% LIFE`}
              </DetailBadge>
            ) : null}
            <DetailBadge tone={evScored ? "blue" : "neutral"}>{evScored ? "EV SCORED" : "EV UNAVAILABLE"}</DetailBadge>
          </>
        }
      >
        {!evScored ? (
          <div className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-3 py-3 text-sm text-[var(--fh-text-muted)] [data-theme=light]:bg-slate-50">
            Engine data not available for this listing.
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <EngineDonut lifePct={lifePct} />
            <div className="min-w-0 flex-1 space-y-0">
              {(
                [
                  ["model", "Engine Model", props.engineModelText || "—"],
                  ["smoh", "SMOH", typeof ev?.hoursSmoh === "number" ? props.formatHours(ev.hoursSmoh) : "—"],
                  ["tbo", "TBO", typeof ev?.tboHours === "number" ? props.formatHours(ev.tboHours) : "—"],
                  ["rem", "Hours Remaining", hoursRem !== null ? props.formatHours(hoursRem) : "—"],
                  ["val", "Remaining Value", typeof ev?.remainingValue === "number" && ev.remainingValue > 0 ? props.formatMoney(ev.remainingValue) : "—"],
                  ["res", "Reserve / hr", typeof ev?.reservePerHour === "number" && ev.reservePerHour > 0 ? `${props.formatMoney(ev.reservePerHour)}/h` : "—"],
                ] as const
              ).map(([key, label, val]) => (
                <div
                  key={key}
                  className="flex justify-between gap-3 border-b border-[rgba(255,255,255,0.04)] py-2.5 text-sm last:border-b-0 [data-theme=light]:border-slate-100"
                >
                  <span className="text-[var(--fh-text-muted)]">{label}</span>
                  <span
                    className="font-semibold text-[var(--fh-text)] [data-theme=light]:text-slate-900"
                    style={key === "smoh" ? { ...mono, color: smohColor } : mono}
                  >
                    {val}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {ev?.tboReferenceLine ? (
          <p className="mb-0 mt-3 text-xs text-[var(--fh-text-muted)]">
            <span className="font-semibold text-[var(--fh-text)]">TBO reference:</span> {ev.tboReferenceLine}
          </p>
        ) : null}
        {typeof ev?.overrunLiability === "number" && ev.overrunLiability > 0 ? (
          <div className="mt-3 rounded-lg border border-[var(--fh-red)]/30 bg-[var(--fh-red-dim)] px-3 py-2 text-sm text-[var(--fh-red)]">
            Overrun liability: {props.formatMoney(ev.overrunLiability)}
          </div>
        ) : null}
        {ev?.showCalendarWarning ? (
          <div className="mt-2 rounded-lg border border-amber-500/35 bg-[var(--fh-amber-dim)] px-3 py-2 text-xs text-amber-800 [data-theme=light]:text-amber-900">
            Calendar limit: verify calendar-based overhaul requirements with logbooks.
          </div>
        ) : null}
        {evScored && insight ? (
          <div
            className={`mt-3 rounded-lg border px-3 py-2.5 text-sm leading-snug ${
              insight.tone === "green"
                ? "border-[rgba(34,197,94,0.25)] bg-[var(--fh-green-dim)] text-[var(--fh-green)]"
                : insight.tone === "amber"
                  ? "border-[rgba(245,158,11,0.25)] bg-[var(--fh-amber-dim)] text-[var(--fh-amber)]"
                  : "border-[rgba(239,68,68,0.25)] bg-[var(--fh-red-dim)] text-[var(--fh-red)]"
            }`}
          >
            {insight.tone === "green" ? "✓ " : "⚠ "}
            {insight.text}
          </div>
        ) : null}
      </DetailSectionCard>

      <DetailSectionCard
        icon="📡"
        title="Avionics Intelligence"
        badges={
          <>
            <DetailBadge tone="neutral">{`${props.avionicsScore ?? "—"}/100`}</DetailBadge>
            {typeof props.installedAvionicsValue === "number" && props.installedAvionicsValue > 0 ? (
              <DetailBadge tone="blue">est. {props.formatMoney(props.installedAvionicsValue)}</DetailBadge>
            ) : null}
          </>
        }
      >
        <div className="mb-1 flex flex-wrap gap-1.5">
          {props.avionicsMatchedItems.map((item, index) => (
            <span
              key={`${item.label}-${index}`}
              className={
                item.value !== null
                  ? "inline-flex items-center gap-1.5 rounded-md border border-[rgba(59,130,246,0.35)] bg-[var(--fh-blue-dim)] px-2.5 py-1 text-[11px] text-[var(--fh-blue)]"
                  : "inline-flex items-center rounded-md border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-2.5 py-1 text-[11px] text-[var(--fh-text-dim)] [data-theme=light]:bg-slate-100"
              }
            >
              {props.toTitleCase(item.label)}
              {item.value !== null ? (
                <span className="text-[10px] font-semibold text-[var(--fh-orange)]" style={mono}>
                  {props.formatMoney(item.value)}
                </span>
              ) : null}
            </span>
          ))}
          {props.detectedStcs.map((stc, index) => (
            <span
              key={`stc-${stc.label}-${index}`}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-2.5 py-1 text-[11px] text-[var(--fh-text-dim)]"
            >
              STC: {props.toTitleCase(stc.label)}
              {stc.value !== null ? (
                <span className="text-[10px] text-[var(--fh-orange)]" style={mono}>
                  +{props.formatMoney(stc.value)}
                </span>
              ) : null}
            </span>
          ))}
        </div>
        {props.avionicsMatchedItems.length === 0 && props.detectedStcs.length === 0 ? (
          <p className="text-sm text-[var(--fh-text-muted)]">No structured avionics matches for this listing.</p>
        ) : null}
        <p className="mt-2 text-xs text-[var(--fh-text-muted)]">Panel profile: {props.panelTypeLabel}</p>
        {props.isSteamGauge ? (
          <div className="mt-3 rounded-lg border border-[rgba(59,130,246,0.25)] bg-[var(--fh-blue-dim)] px-3 py-2 text-xs leading-relaxed text-[var(--fh-blue)]">
            Upgrade path: glass avionics (e.g., GTN/G5-class stack) can materially lift marketability — model a budget in Deal Desk.
          </div>
        ) : null}
      </DetailSectionCard>

      <DetailSectionCard
        icon="⚠"
        title="Life-Limited Parts"
        badges={
          llpBad.length > 0 ? (
            <DetailBadge tone="amber">{`${llpBad.length} ITEMS FLAGGED`}</DetailBadge>
          ) : (
            <DetailBadge tone="green">ALL CLEAR</DetailBadge>
          )
        }
      >
        <ul className="m-0 list-none p-0">
          {props.llpRows.map((row) => (
            <li
              key={row.name}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(255,255,255,0.04)] py-2.5 text-[12px] last:border-b-0 [data-theme=light]:border-slate-100"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-[var(--fh-text-muted)]">◆</span>
                <span className="font-medium text-[var(--fh-text)] [data-theme=light]:text-slate-800">{row.name}</span>
              </div>
              <div className="flex items-center gap-2">
                {statusPill(row.status)}
                {row.costLabel ? (
                  <span className="text-[11px] text-[var(--fh-text-muted)]" style={mono}>
                    {row.costLabel}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        {props.deferredMaintenanceTotal > 0 ? (
          <div className="mt-3 rounded-lg border border-[rgba(245,158,11,0.25)] bg-[var(--fh-amber-dim)] px-3 py-2 text-xs text-[var(--fh-amber)]">
            Deferred maintenance modeled: <strong style={mono}>{props.formatMoney(props.deferredMaintenanceTotal)}</strong> (includes
            engine overrun where applicable).
          </div>
        ) : null}
      </DetailSectionCard>

      <DetailSectionCard
        icon="📈"
        title="Market Comparables"
        badges={<DetailBadge tone="blue">{`${compBadgeCount || "—"} COMPS`}</DetailBadge>}
      >
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-3 py-2.5 [data-theme=light]:border-slate-200 [data-theme=light]:bg-slate-50">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--fh-text-muted)]" style={barlow}>
              This listing
            </div>
            <div className="mt-1 text-lg font-bold text-[var(--fh-orange)]" style={barlow}>
              {typeof props.askingPrice === "number" && props.askingPrice > 0 ? props.formatMoney(props.askingPrice) : "Call"}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-3 py-2.5 [data-theme=light]:border-slate-200 [data-theme=light]:bg-slate-50">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--fh-text-muted)]" style={barlow}>
              Median comp
            </div>
            <div className="mt-1 text-lg font-bold text-[var(--fh-text)] [data-theme=light]:text-slate-900" style={barlow}>
              {typeof props.medianCompPrice === "number" && props.medianCompPrice > 0
                ? props.formatMoney(props.medianCompPrice)
                : "—"}
            </div>
            <div className="mt-0.5 text-[10px] text-[var(--fh-text-muted)]">{props.compSampleLabel}</div>
          </div>
          <div className="rounded-lg border border-[rgba(34,197,94,0.25)] bg-[var(--fh-green-dim)] px-3 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--fh-green)]" style={barlow}>
              You save (est.)
            </div>
            <div className="mt-1 text-lg font-bold text-[var(--fh-green)]" style={barlow}>
              {saveEst !== null ? props.formatMoney(saveEst) : "—"}
            </div>
            <div className="mt-0.5 text-[10px] text-[var(--fh-text-muted)]">Vs. median when priced</div>
          </div>
        </div>
        <div
          className="overflow-hidden rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg)] p-2 [data-theme=light]:border-slate-200 [data-theme=light]:bg-slate-50"
          style={{ minHeight: 200 }}
        >
          <CompsChartPanel listingId={props.listingId} hideChrome />
        </div>
      </DetailSectionCard>

      <DetailSectionCard icon="📄" title="Description & Records">
        <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-[var(--fh-text-dim)] [data-theme=light]:text-slate-700">
          {props.descriptionText || "No description available."}
        </p>
        {props.sourceUrl ? (
          <p className="mt-4 mb-0">
            <a
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[var(--fh-border-orange)] bg-[var(--fh-orange-dim)] px-4 py-2 text-sm font-bold text-[var(--fh-orange)] hover:bg-[var(--fh-orange)] hover:text-black"
              href={props.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {props.sourceLinkLabel} →
            </a>
          </p>
        ) : null}
        {props.logbookUrls.length > 0 ? (
          <div className="mt-4">
            <h3 className="mb-2 mt-0 text-xs font-bold uppercase tracking-wide text-[var(--fh-text-muted)]" style={barlow}>
              Logbooks & Records
            </h3>
            <ul className="m-0 list-none space-y-1 p-0">
              {props.logbookUrls.map((url, index) => (
                <li key={url}>
                  <a className="inline-flex min-h-[44px] items-center text-sm text-[var(--fh-blue)] underline" href={url} target="_blank" rel="noreferrer">
                    Record {index + 1}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </DetailSectionCard>
    </div>
  )
}
