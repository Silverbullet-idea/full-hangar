import type { ReactNode } from 'react'
import CompsChartPanel from '../CompsChartPanelLazy'

type PriceHistoryPoint = {
  observedOn: string
  askingPrice: number | null
  isActive: boolean
}

type VerificationFlag = {
  level: 'info' | 'warning' | 'danger'
  text: string
}

type FlipExplanationSidebar = {
  p1_pricing_edge?: { pts?: number; max?: number }
  p2_airworthiness?: { pts?: number; max?: number }
  p3_improvement_room?: { pts?: number; max?: number }
  p4_exit_liquidity?: { pts?: number; max?: number }
  suppressed?: string
  error?: string
} | null

function flipExplanationShowsPillars(ex: FlipExplanationSidebar): ex is NonNullable<FlipExplanationSidebar> {
  if (!ex || typeof ex !== "object") return false
  if ("suppressed" in ex && ex.suppressed) return false
  if ("error" in ex && ex.error) return false
  return true
}

type RightDetailColumnProps = {
  listingId: string
  askingPrice: number | null
  marketPricing: { low: number | null; high: number | null; median: number | null } | null
  formatMoney: (value: number | null | undefined) => string
  scoreColor: string
  primaryScore: number | null
  primaryLabel: string
  formatScore: (value: number | null | undefined) => string
  scoreMethodSummary: string
  confidenceSignals: string[]
  effectiveDataConfidence: string | null
  flipExplanation?: FlipExplanationSidebar
  compExactCount: number | null
  compFamilyCount: number | null
  compMakeCount: number | null
  riskBadgeClass: string
  riskBadgeText: string
  riskBadgeAriaLabel: string
  /** e.g. "GOOD tier (65–79 band)." when price disclosed */
  flipTierBandLine: string | null
  scoreInputRows: Array<[string, ReactNode]>
  scoreExplanation: string[]
  renderScoreExplanationItem: (value: string) => string
  showAvionicsPanel: boolean
  installedAvionicsValue: number | null
  avionicsScore: number | null
  stcPremiumTotal: number | null
  panelTypeLabel: string
  avionicsMatchedItems: Array<{ label: string; value: number | null }>
  detectedStcs: Array<{ label: string; value: number | null }>
  toTitleCase: (value: string) => string
  isSteamGauge: boolean
  priceHistory: PriceHistoryPoint[]
  priceHistoryStats: {
    latestPrice: number | null
    highestPrice: number | null
    lowestPrice: number | null
    priceDropCount: number
    netChange: number | null
  }
  priceHistoryChart: { linePoints: string; dropPoints: Array<{ x: number; y: number }> } | null
  formatIsoDate: (value: string | null) => string
  safeDisplay: (value: string | number | null | undefined) => string
  showFaaSnapshot: boolean
  verificationFlags: VerificationFlag[]
  faaRows: Array<[string, ReactNode]>
  faaLookupUrl: string | null
  /** Listing detail hero already shows ask + score ring; hide duplicates here. */
  hideAskingPriceInComps?: boolean
  suppressDuplicateHeroScores?: boolean
  /** Phase 3B: comps/avionics/FAA live in left column + sidebar; keep score + price history only. */
  phase3SecondaryColumn?: boolean
}

export default function RightDetailColumn(props: RightDetailColumnProps) {
  const phase3 = props.phase3SecondaryColumn === true
  return (
    <div className="panel-stack flex flex-col">
      {!phase3 ? (
        <section className="table-card order-2 md:order-1">
          <h3 className="section-title">Comp & Cost</h3>
          {!props.hideAskingPriceInComps ? (
            typeof props.askingPrice === "number" && props.askingPrice > 0 ? (
              <div style={{ marginBottom: "0.75rem" }}>
                <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "#22c55e", lineHeight: 1.1 }}>
                  {props.formatMoney(props.askingPrice)}
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: "0.75rem", color: "var(--brand-muted)", fontSize: "0.9rem" }}>Asking price not published.</div>
            )
          ) : null}
          {props.marketPricing &&
          typeof props.marketPricing.low === "number" &&
          typeof props.marketPricing.high === "number" &&
          typeof props.marketPricing.median === "number" ? (
            <div style={{ marginBottom: "0.9rem" }}>
              <div style={{ fontSize: "0.82rem", color: "var(--brand-muted)", marginBottom: "0.15rem" }}>Estimated Asking Range</div>
              <div style={{ fontSize: "1rem", fontWeight: 700, color: "#86efac" }}>
                {`${props.formatMoney(props.marketPricing.low)} - ${props.formatMoney(props.marketPricing.high)}`}
              </div>
              <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--brand-muted)", marginTop: "0.2rem" }}>
                {`Median ${props.formatMoney(props.marketPricing.median)}`}
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: "0.9rem", color: "var(--brand-muted)", fontSize: "0.86rem" }}>
              No estimated market range available yet for this make/model.
            </div>
          )}
          <div style={{ marginBottom: "0.55rem", fontSize: "0.9rem", fontWeight: 700, color: "#FF9900" }}>Comparable Market Intelligence</div>
          <div className="w-full max-w-full overflow-x-hidden">
            <CompsChartPanel listingId={props.listingId} hideChrome />
          </div>
        </section>
      ) : null}

      <section className={`panel ${phase3 ? "order-1" : "order-1 md:order-2"}`}>
        <h3>Score Summary</h3>
        <p
          style={{
            fontSize: "0.82rem",
            color: "var(--brand-muted)",
            marginTop: "0.35rem",
            marginBottom: "0.75rem",
            lineHeight: 1.45,
          }}
        >
          Flip score ranks resale and flip attractiveness. A strong score can coexist with only medium data or pricing reliability; downside risk is measured separately.
        </p>

        <h4
          style={{
            fontSize: "0.72rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--brand-muted)",
            margin: "0 0 0.45rem",
          }}
        >
          Flip opportunity
        </h4>
        {props.flipTierBandLine ? (
          <p style={{ fontSize: "0.86rem", color: "var(--brand-white)", fontWeight: 600, margin: "0 0 0.55rem" }}>
            {props.flipTierBandLine}
          </p>
        ) : null}
        {!props.suppressDuplicateHeroScores ? (
          <>
            <div
              className="score-badge"
              style={{ borderColor: props.scoreColor, boxShadow: `0 0 0 6px ${props.scoreColor}20 inset` }}
              aria-label={
                typeof props.primaryScore === "number" && Number.isFinite(props.primaryScore)
                  ? `Flip score: ${Math.round(props.primaryScore)} out of 100`
                  : "Flip score not available"
              }
            >
              <div className="score-readout">
                <span className="score-value">{props.safeDisplay(props.formatScore(props.primaryScore))}</span>
                <span className="score-max">/ 100</span>
              </div>
            </div>
            <details className="score-notes" style={{ marginTop: "0.6rem" }}>
              <summary>{props.primaryLabel}</summary>
              <ul className="score-band-list" style={{ marginTop: "0.45rem" }}>
                <li>
                  <strong>80–100</strong>: HOT — top flip candidates
                </li>
                <li>
                  <strong>65–79</strong>: GOOD — solid resale profile
                </li>
                <li>
                  <strong>50–64</strong>: FAIR — selective / needs work
                </li>
                <li>
                  <strong>0–49</strong>: PASS — weak flip edge
                </li>
              </ul>
              <ul className="score-method-list" style={{ marginTop: "0.45rem" }}>
                {props.scoreMethodSummary
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line) => (
                    <li key={line}>{line}</li>
                  ))}
              </ul>
            </details>
          </>
        ) : (
          <details className="score-notes" style={{ marginTop: "0.2rem" }}>
            <summary>How scoring works</summary>
            <ul className="score-method-list" style={{ marginTop: "0.45rem" }}>
              {props.scoreMethodSummary
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => (
                  <li key={line}>{line}</li>
                ))}
            </ul>
          </details>
        )}
        {(() => {
          const ex = props.flipExplanation
          if (props.suppressDuplicateHeroScores || !flipExplanationShowsPillars(ex ?? null)) return null
          const pillarRows: Array<[string, number | null | undefined, number]> = [
            ["Pricing edge", ex.p1_pricing_edge?.pts, 35],
            ["Airworthiness", ex.p2_airworthiness?.pts, 20],
            ["Improvement", ex.p3_improvement_room?.pts, 30],
            ["Exit liquidity", ex.p4_exit_liquidity?.pts, 15],
          ]
          return (
            <div
              className="max-md:[&>div]:flex max-md:[&>div]:min-h-[44px] max-md:[&>div]:items-center"
              style={{ marginTop: "0.65rem", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.45rem" }}
            >
              {pillarRows.map(([label, pts, max]) => (
                <div
                  key={label}
                  style={{
                    border: "1px solid var(--brand-dark)",
                    borderRadius: "10px",
                    padding: "0.38rem 0.45rem",
                    fontSize: "0.8rem",
                    color: "var(--brand-muted)",
                  }}
                >
                  {`${label} ${typeof pts === "number" && Number.isFinite(pts) ? `${Math.round(pts)}/${max}` : props.safeDisplay(null)}`}
                </div>
              ))}
            </div>
          )
        })()}
        {typeof props.compExactCount === "number" ||
        typeof props.compFamilyCount === "number" ||
        typeof props.compMakeCount === "number" ? (
          <div style={{ marginTop: "0.55rem", fontSize: "0.78rem", color: "var(--brand-muted)" }}>
            {`Comp universe — exact: ${props.safeDisplay(props.compExactCount)} | family: ${props.safeDisplay(props.compFamilyCount)} | make: ${props.safeDisplay(props.compMakeCount)}`}
          </div>
        ) : null}

        <h4
          style={{
            fontSize: "0.72rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--brand-muted)",
            margin: "0.85rem 0 0.45rem",
          }}
        >
          Score reliability
        </h4>
        <p style={{ fontSize: "0.8rem", color: "var(--brand-muted)", margin: "0 0 0.5rem", lineHeight: 1.45 }}>
          Higher reliability means more listing fields checked and stronger comp coverage—not a second opinion on flip tier.
        </p>
        {props.effectiveDataConfidence ? (
          <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--brand-white)", margin: "0 0 0.45rem" }}>
            {`Summary: ${props.effectiveDataConfidence}`}
          </p>
        ) : null}
        <div className="score-notes" style={{ marginTop: props.effectiveDataConfidence ? "0.15rem" : 0 }}>
          {props.confidenceSignals.length > 0 ? (
            <ul style={{ marginTop: 0 }}>
              {props.confidenceSignals.map((signal) => (
                <li key={signal}>{signal}</li>
              ))}
            </ul>
          ) : (
            <ul style={{ marginTop: 0 }}>
              <li>No reliability signals available yet.</li>
            </ul>
          )}
        </div>

        <h4
          style={{
            fontSize: "0.72rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--brand-muted)",
            margin: "0.85rem 0 0.45rem",
          }}
        >
          Downside risk
        </h4>
        <p style={{ fontSize: "0.8rem", color: "var(--brand-muted)", margin: "0 0 0.5rem", lineHeight: 1.45 }}>
          Separate from flip score: maintenance burden, registration or safety alerts, and condition signals.
        </p>
        <p style={{ marginTop: 0, marginBottom: "0.85rem" }}>
          <span className={`badge ${props.riskBadgeClass}`} aria-label={props.riskBadgeAriaLabel}>
            {props.riskBadgeText}
          </span>
        </p>

        <div className="score-inputs-wrap">
          <h4 className="score-inputs-title">Actual Numbers for This Aircraft</h4>
          <table className="score-inputs-table">
            <tbody>
              {props.scoreInputRows.map(([label, value]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {props.scoreExplanation.length > 0 ? (
          <div style={{ marginTop: "1rem" }}>
            <h3>How We Scored This</h3>
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {props.scoreExplanation.map((item) => (
                <li key={item} style={{ marginBottom: '0.35rem' }}>
                  {props.renderScoreExplanationItem(item)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {!phase3 && props.showAvionicsPanel ? (
        <section className="table-card order-4 md:order-3">
          <h3 className="section-title">Avionics & Modifications</h3>
          <div className="price-history-metrics">
            <div><strong>{props.safeDisplay(props.formatMoney(props.installedAvionicsValue))}</strong><div className="metric-label">Installed avionics value</div></div>
            <div><strong>{props.safeDisplay(props.formatScore(props.avionicsScore))}</strong><div className="metric-label">Avionics score</div></div>
            <div><strong>{props.safeDisplay(props.formatMoney(props.stcPremiumTotal))}</strong><div className="metric-label">STC premium value</div></div>
            <div><strong>{props.panelTypeLabel}</strong><div className="metric-label">Panel type</div></div>
          </div>
          {props.avionicsMatchedItems.length > 0 ? (
            <div style={{ marginTop: '0.8rem' }}>
              <h4 style={{ margin: '0 0 0.4rem', color: '#FF9900' }}>Detected Avionics Equipment</h4>
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {props.avionicsMatchedItems.map((item, index) => (
                  <li key={`${item.label}-${index}`} style={{ marginBottom: '0.25rem' }}>
                    {item.value !== null ? `${props.toTitleCase(item.label)} - ${props.formatMoney(item.value)}` : props.toTitleCase(item.label)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {props.detectedStcs.length > 0 ? (
            <div style={{ marginTop: '0.8rem' }}>
              <h4 style={{ margin: '0 0 0.4rem', color: '#FF9900' }}>Detected STCs</h4>
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {props.detectedStcs.map((stc, index) => (
                  <li key={`${stc.label}-${index}`} style={{ marginBottom: '0.25rem' }}>
                    {stc.value !== null ? `${props.toTitleCase(stc.label)} - ${props.formatMoney(stc.value)} premium` : props.toTitleCase(stc.label)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {props.isSteamGauge ? (
            <p style={{ marginTop: '0.8rem', color: '#FF9900' }}>
              Upgrade potential: G5 + GTX 345 package can add roughly $8k in installed value.
            </p>
          ) : null}
        </section>
      ) : null}

      {props.priceHistory.length > 0 ? (
        <section className={`table-card ${phase3 ? "order-2" : "order-5 md:order-4"}`}>
          <h3 className="section-title">Price History</h3>
          <div className="price-history-metrics">
            <div><strong>{props.safeDisplay(props.formatMoney(props.priceHistoryStats.latestPrice))}</strong><div className="metric-label">Latest ask</div></div>
            <div><strong>{props.safeDisplay(props.formatMoney(props.priceHistoryStats.highestPrice))}</strong><div className="metric-label">Highest observed</div></div>
            <div><strong>{props.safeDisplay(props.formatMoney(props.priceHistoryStats.lowestPrice))}</strong><div className="metric-label">Lowest observed</div></div>
            <div><strong>{props.priceHistoryStats.priceDropCount}</strong><div className="metric-label">Price drops</div></div>
          </div>
          {typeof props.priceHistoryStats.netChange === 'number' ? (
            <p style={{ marginTop: '0.6rem', color: props.priceHistoryStats.netChange <= 0 ? '#16a34a' : '#d97706' }}>
              {props.priceHistoryStats.netChange <= 0
                ? `${Math.abs(props.priceHistoryStats.netChange).toLocaleString('en-US')} decrease since first seen`
                : `${props.priceHistoryStats.netChange.toLocaleString('en-US')} increase since first seen`}
            </p>
          ) : null}
          {props.priceHistoryChart ? (
            <div className="price-chart-wrap">
              <svg viewBox="0 0 100 34" preserveAspectRatio="none" className="price-chart" aria-hidden="true">
                <polyline fill="none" stroke="#FF9900" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" points={props.priceHistoryChart.linePoints} />
                {props.priceHistoryChart.dropPoints.map((point, index) => (
                  <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r="1.2" fill="#dc2626" />
                ))}
              </svg>
              <div className="metric-label" style={{ marginTop: '0.3rem' }}>
                Orange trend line, red dots mark price drops
              </div>
            </div>
          ) : null}
          <table className="detail-table" style={{ marginTop: '0.6rem' }}>
            <thead>
              <tr><th scope="col">Date</th><th scope="col">Ask</th><th scope="col">Change</th><th scope="col">Status</th></tr>
            </thead>
            <tbody>
              {props.priceHistory.slice().reverse().slice(0, 18).map((point, index, arr) => {
                const nextOlder = arr[index + 1]
                const delta = typeof point.askingPrice === 'number' && typeof nextOlder?.askingPrice === 'number'
                  ? point.askingPrice - nextOlder.askingPrice
                  : null
                return (
                  <tr key={`${point.observedOn}-${index}`}>
                    <td>{props.formatIsoDate(point.observedOn)}</td>
                    <td>{props.safeDisplay(props.formatMoney(point.askingPrice))}</td>
                    <td>{delta === null ? '—' : delta === 0 ? 'No change' : delta < 0 ? `↓ ${Math.abs(delta).toLocaleString('en-US')}` : `↑ ${delta.toLocaleString('en-US')}`}</td>
                    <td>{point.isActive ? 'Active' : 'Inactive'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ) : null}

      {!phase3 && props.showFaaSnapshot ? (
        <section className="table-card order-3 md:order-5">
          <h3 className="section-title">FAA Snapshot & Verification</h3>
          {props.verificationFlags.length > 0 ? (
            <div style={{ display: 'grid', gap: '0.45rem', marginBottom: '0.8rem' }}>
              {props.verificationFlags.map((flag, index) => (
                <div
                  key={`${flag.text}-${index}`}
                  style={{
                    border: `1px solid ${flag.level === 'warning' ? '#af4d27' : flag.level === 'danger' ? '#dc2626' : '#3a4454'}`,
                    background: flag.level === 'warning' ? '#af4d2717' : flag.level === 'danger' ? '#dc262615' : 'var(--surface-muted)',
                    borderRadius: '8px',
                    padding: '0.45rem 0.6rem',
                    fontSize: '0.86rem',
                  }}
                >
                  {flag.text}
                </div>
              ))}
            </div>
          ) : null}
          <table className="detail-table">
            <tbody>
              {props.faaRows.map(([label, value]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {props.faaLookupUrl ? (
            <p style={{ marginTop: '0.7rem' }}>
              <a className="button-link" href={props.faaLookupUrl} target="_blank" rel="noreferrer">
                Open FAA Registry
              </a>
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
