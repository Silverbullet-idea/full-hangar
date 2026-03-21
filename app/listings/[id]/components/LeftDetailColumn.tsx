import type { ReactNode } from 'react'
import ListingImageGallery from './ListingImageGallery'

type LeftDetailColumnProps = {
  primaryImageUrl: string
  galleryUrls: string[]
  title: string
  aircraftRows: Array<[string, ReactNode]>
  engineRows: Array<[string, ReactNode]>
  descriptionText: string
  sourceUrl: string | null
  sourceLinkLabel: string
  logbookUrls: string[]
  dealTier?: string | null
  fallbackImageUrl?: string | null
  engineValuePanel?: {
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
}

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—"
  return `$${Math.round(value).toLocaleString("en-US")}`
}

function formatHours(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—"
  return `${Math.round(value).toLocaleString("en-US")} h`
}

function EngineValuePanel({
  remainingValue,
  overrunLiability,
  reservePerHour,
  hoursSmoh,
  tboHours,
  replacementCost,
  dataQuality,
  explanation,
  tboReferenceLine,
  showCalendarWarning,
}: {
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
}) {
  const quality = String(dataQuality ?? "").trim().toLowerCase()
  if (quality === "none") return null
  const isTboOnly = quality === "tbo_only"
  const hasRemainingValue = typeof remainingValue === "number" && remainingValue > 0
  const hasOverrunLiability = typeof overrunLiability === "number" && overrunLiability > 0
  const hasLifeData =
    typeof hoursSmoh === "number" &&
    typeof tboHours === "number" &&
    Number.isFinite(hoursSmoh) &&
    Number.isFinite(tboHours) &&
    tboHours > 0
  if (!hasLifeData && !hasRemainingValue && !hasOverrunLiability && !isTboOnly) return null

  const lifeUsedPercentRaw =
    typeof hoursSmoh === "number" &&
    typeof tboHours === "number" &&
    Number.isFinite(hoursSmoh) &&
    Number.isFinite(tboHours) &&
    tboHours > 0
      ? (hoursSmoh / tboHours) * 100
      : null
  const lifeUsedPercent = typeof lifeUsedPercentRaw === "number" ? Math.max(0, lifeUsedPercentRaw) : null
  const lifeUsedBarPercent =
    typeof lifeUsedPercent === "number" ? Math.max(0, Math.min(100, lifeUsedPercent)) : 0
  const lifeRemainingPercent =
    typeof lifeUsedPercent === "number" ? Math.max(0, 100 - Math.min(100, lifeUsedPercent)) : null

  const progressClass =
    typeof lifeUsedPercent === "number"
      ? lifeUsedPercent >= 85
        ? "bg-red-400"
        : lifeUsedPercent >= 50
        ? "bg-amber-300"
        : "bg-emerald-400"
      : "bg-brand-dark"

  const remainingValueClass =
    typeof lifeRemainingPercent === "number"
      ? lifeRemainingPercent > 50
        ? "text-emerald-400"
        : lifeRemainingPercent >= 25
        ? "text-amber-300"
        : "text-red-400"
      : "text-brand-white"

  const overrunHours =
    typeof hoursSmoh === "number" && typeof tboHours === "number" && hoursSmoh > tboHours
      ? Math.round(hoursSmoh - tboHours)
      : null

  return (
    <section className="table-card engine-value-panel">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="section-title !mb-0">Engine Value Estimate</h3>
        <span
          className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-brand-dark text-xs text-brand-muted"
          title="Engine value is estimated based on exchange pricing from AirPower Inc. Remaining value = replacement cost × hours remaining ÷ TBO. This is an estimate — actual value depends on engine condition and maintenance records."
          aria-label="Engine value estimate method"
        >
          i
        </span>
      </div>

      {typeof lifeUsedPercent === "number" ? (
        <div className="mb-2.5">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-brand-muted">Engine Life Used</span>
            <span className="font-semibold text-brand-white">{`${Math.round(lifeUsedPercent)}%`}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full border border-brand-dark bg-[var(--surface-muted)]">
            <div className={`h-full ${progressClass}`} style={{ width: `${lifeUsedBarPercent}%` }} />
          </div>
        </div>
      ) : null}

      {typeof hoursSmoh === "number" || typeof tboHours === "number" ? (
        <p className="mb-2.5 text-sm text-brand-muted">
          Hours Since Overhaul{" "}
          <span className="font-semibold text-brand-white">
            {`${formatHours(hoursSmoh)} of ${formatHours(tboHours)} TBO`}
          </span>
        </p>
      ) : null}

      {hasRemainingValue && !isTboOnly ? (
        <div className="mb-2 flex items-start justify-between gap-3 text-sm">
          <span className="text-brand-muted">Remaining Value</span>
          <div className="text-right">
            <div className={`font-semibold ${remainingValueClass}`}>{formatCurrency(remainingValue)}</div>
            {typeof replacementCost === "number" && replacementCost > 0 ? (
              <div className="text-xs text-brand-muted">{`(based on ${formatCurrency(replacementCost)} AirPower exchange price)`}</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {typeof reservePerHour === "number" && reservePerHour > 0 && !isTboOnly ? (
        <div className="mb-2 flex items-start justify-between gap-3 text-sm">
          <span className="text-brand-muted">Reserve Per Hour</span>
          <span className="font-semibold text-brand-white">{`${formatCurrency(reservePerHour)}/h`}</span>
        </div>
      ) : null}

      {tboReferenceLine ? (
        <p className="mb-2 text-xs text-brand-muted">
          <span className="font-semibold text-brand-white">TBO Reference:</span> {tboReferenceLine}
        </p>
      ) : explanation ? (
        <p className="mb-2 text-xs text-brand-muted">
          <span className="font-semibold text-brand-white">TBO Reference:</span> {explanation}
        </p>
      ) : null}

      {hasOverrunLiability ? (
        <div className="mt-3 rounded border border-[color:var(--brand-burn)]/45 bg-[color:var(--brand-burn)]/10 p-2">
          <div className="flex items-start justify-between gap-3 text-sm">
            <span className="font-semibold text-[color:var(--brand-burn)]">⚠ Overrun Liability</span>
            <div className="text-right">
              <div className="font-semibold text-[color:var(--brand-burn)]">{`-${formatCurrency(overrunLiability)}`}</div>
              {typeof overrunHours === "number" && overrunHours > 0 ? (
                <div className="text-xs text-brand-muted">{`(${overrunHours.toLocaleString("en-US")} h past TBO)`}</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {showCalendarWarning ? (
        <div className="mt-2 rounded border border-amber-500/45 bg-amber-500/10 p-2 text-xs text-amber-200">
          ⚠ Calendar Note: Both Lycoming and Continental recommend overhaul within 12 years of last overhaul regardless of hours. Verify last overhaul date with seller.
        </div>
      ) : null}
      <style>{`
        .engine-value-panel {
          border-color: var(--brand-dark);
          background: var(--surface-muted);
        }
      `}</style>
    </section>
  )
}

function DetailTableCard({ title, rows }: { title: string; rows: Array<[string, ReactNode]> }) {
  return (
    <section className="table-card">
      <h3 className="section-title">{title}</h3>
      <table className="detail-table">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <style>{`
        .section-title {
          color: #ff9900;
          font-weight: 800;
          margin: 0 0 0.75rem;
        }
        .detail-table {
          width: 100%;
          border-collapse: collapse;
        }
        .detail-table tr {
          border-bottom: 1px solid var(--brand-dark);
        }
        .detail-table tr:last-child {
          border-bottom: none;
        }
        .detail-table th,
        .detail-table td {
          text-align: left;
          padding: 0.62rem 0.2rem;
          vertical-align: top;
        }
        .detail-table th {
          width: 46%;
          color: var(--brand-muted);
          font-weight: 500;
        }
        .detail-table td {
          color: var(--brand-white);
          font-weight: 700;
        }
      `}</style>
    </section>
  )
}

export default function LeftDetailColumn({
  primaryImageUrl,
  galleryUrls,
  title,
  aircraftRows,
  engineRows,
  descriptionText,
  sourceUrl,
  sourceLinkLabel,
  logbookUrls,
  dealTier = null,
  fallbackImageUrl = null,
  engineValuePanel = null,
}: LeftDetailColumnProps) {
  const imageUrls = [
    ...new Set([
      String(primaryImageUrl || '').trim(),
      ...galleryUrls.map((value) => String(value || '').trim()),
    ].filter(Boolean)),
  ]

  return (
    <section className="panel flex flex-col">
      <div className="order-1 flex flex-col gap-[0.9rem] md:order-2">
        <DetailTableCard title="Aircraft Details" rows={aircraftRows} />
        <DetailTableCard title="Airframe & Engine" rows={engineRows} />
        {engineValuePanel ? <EngineValuePanel {...engineValuePanel} /> : null}
      </div>

      <div className="order-2 space-y-2 md:order-3">
        <h3>Seller Description</h3>
        <p>{descriptionText || 'No description available.'}</p>

        {sourceUrl ? (
          <p>
            <a className="button-link inline-flex min-h-[44px] min-w-[44px] items-center justify-center" href={sourceUrl} target="_blank" rel="noreferrer">
              {sourceLinkLabel}
            </a>
          </p>
        ) : null}

        {logbookUrls.length > 0 ? (
          <div style={{ marginTop: '1rem' }}>
            <h3>Logbooks & Records</h3>
            <ul>
              {logbookUrls.map((url, index) => (
                <li key={url}>
                  <a className="inline-flex min-h-[44px] items-center" href={url} target="_blank" rel="noreferrer">
                    {`Record ${index + 1}`}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="order-3 w-full min-w-0 md:order-1">
        <ListingImageGallery
          title={title || "Aircraft listing"}
          imageUrls={imageUrls}
          dealTier={dealTier}
          fallbackImageUrl={fallbackImageUrl}
        />
      </div>
    </section>
  )
}
