import type { ReactNode } from 'react'
import CompsChartPanel from '../CompsChartPanel'

type PriceHistoryPoint = {
  observedOn: string
  askingPrice: number | null
  isActive: boolean
}

type VerificationFlag = {
  level: 'info' | 'warning' | 'danger'
  text: string
}

type RightDetailColumnProps = {
  listingId: string
  marketPricing: { low: number | null; high: number | null; median: number | null } | null
  formatMoney: (value: number | null | undefined) => string
  scoreColor: string
  primaryScore: number | null
  primaryLabel: string
  formatScore: (value: number | null | undefined) => string
  scoreMethodSummary: string
  confidenceSignals: string[]
  effectiveDataConfidence: string | null
  marketScore: number | null
  conditionScore: number | null
  executionScore: number | null
  compExactCount: number | null
  compFamilyCount: number | null
  compMakeCount: number | null
  riskBadgeClass: string
  riskLabel: string
  scoreInputRows: Array<[string, ReactNode]>
  pricingConfidence: string | null
  compSelectionTier: string | null
  formatCompTier: (value: string) => string
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
}

export default function RightDetailColumn(props: RightDetailColumnProps) {
  return (
    <div className="panel-stack">
      <section className="table-card">
        <h3 className="section-title">Comp & Cost</h3>
        {props.marketPricing &&
        typeof props.marketPricing.low === 'number' &&
        typeof props.marketPricing.high === 'number' &&
        typeof props.marketPricing.median === 'number' ? (
          <div style={{ marginBottom: '0.9rem' }}>
            <div style={{ fontSize: '0.82rem', color: '#B2B2B2', marginBottom: '0.15rem' }}>Estimated Asking Range</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#86efac' }}>
              {`${props.formatMoney(props.marketPricing.low)} - ${props.formatMoney(props.marketPricing.high)}`}
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', marginTop: '0.2rem' }}>
              {`Median ${props.formatMoney(props.marketPricing.median)}`}
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: '0.9rem', color: '#B2B2B2', fontSize: '0.86rem' }}>
            No estimated market range available yet for this make/model.
          </div>
        )}
        <div style={{ marginBottom: '0.55rem', fontSize: '0.9rem', fontWeight: 700, color: '#FF9900' }}>
          Comparable Market Intelligence
        </div>
        <CompsChartPanel listingId={props.listingId} hideChrome />
      </section>

      <section className="panel">
        <h3>Score Summary</h3>
        <div className="score-badge" style={{ borderColor: props.scoreColor, boxShadow: `0 0 0 6px ${props.scoreColor}20 inset` }}>
          <div className="score-readout">
            <span className="score-value">{props.safeDisplay(props.formatScore(props.primaryScore))}</span>
            <span className="score-max">/ 100</span>
          </div>
        </div>
        <div style={{ marginTop: '0.6rem', fontSize: '0.84rem', color: '#B2B2B2' }}>{props.primaryLabel}</div>
        <ul className="score-band-list">
          <li><strong>85-100</strong>: Strong buy candidate</li>
          <li><strong>70-84</strong>: Good opportunity</li>
          <li><strong>50-69</strong>: Mixed, inspect closely</li>
          <li><strong>0-49</strong>: Weak edge / high risk</li>
        </ul>
        <p className="score-method">{props.scoreMethodSummary}</p>
        {props.confidenceSignals.length > 0 ? (
          <details className="score-notes">
            <summary>
              Confidence breakdown{props.effectiveDataConfidence ? `: ${props.effectiveDataConfidence}` : ''}
            </summary>
            <ul>
              {props.confidenceSignals.map((signal) => (
                <li key={signal}>{signal}</li>
              ))}
            </ul>
          </details>
        ) : null}
        <div style={{ marginTop: '0.65rem', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.45rem' }}>
          <div style={{ border: '1px solid #3A4454', borderRadius: '10px', padding: '0.38rem 0.45rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
            {`Market ${props.safeDisplay(props.formatScore(props.marketScore))}`}
          </div>
          <div style={{ border: '1px solid #3A4454', borderRadius: '10px', padding: '0.38rem 0.45rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
            {`Condition ${props.safeDisplay(props.formatScore(props.conditionScore))}`}
          </div>
          <div style={{ border: '1px solid #3A4454', borderRadius: '10px', padding: '0.38rem 0.45rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
            {`Execution ${props.safeDisplay(props.formatScore(props.executionScore))}`}
          </div>
        </div>
        {(typeof props.compExactCount === 'number' || typeof props.compFamilyCount === 'number' || typeof props.compMakeCount === 'number') ? (
          <div style={{ marginTop: '0.55rem', fontSize: '0.78rem', color: '#9ca3af' }}>
            {`Comp universe - exact: ${props.safeDisplay(props.compExactCount)} | family: ${props.safeDisplay(props.compFamilyCount)} | make: ${props.safeDisplay(props.compMakeCount)}`}
          </div>
        ) : null}
        <p style={{ marginTop: '0.85rem' }}>
          <span className={`badge ${props.riskBadgeClass}`}>{props.riskLabel}</span>
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
        <div style={{ marginTop: '0.8rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {props.effectiveDataConfidence ? (
            <span className="badge score-none">{`Data Confidence: ${props.effectiveDataConfidence}`}</span>
          ) : null}
          {props.pricingConfidence ? (
            <span className="badge score-none">{`Pricing Confidence: ${props.pricingConfidence}`}</span>
          ) : null}
          {props.compSelectionTier ? (
            <span className="badge risk-moderate">{`Comp Tier: ${props.formatCompTier(props.compSelectionTier)}`}</span>
          ) : null}
        </div>
        {props.scoreExplanation.length > 0 ? (
          <div style={{ marginTop: '1rem' }}>
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

      {props.showAvionicsPanel ? (
        <section className="table-card">
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
        <section className="table-card">
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

      {props.showFaaSnapshot ? (
        <section className="table-card">
          <h3 className="section-title">FAA Snapshot & Verification</h3>
          {props.verificationFlags.length > 0 ? (
            <div style={{ display: 'grid', gap: '0.45rem', marginBottom: '0.8rem' }}>
              {props.verificationFlags.map((flag, index) => (
                <div
                  key={`${flag.text}-${index}`}
                  style={{
                    border: `1px solid ${flag.level === 'warning' ? '#af4d27' : flag.level === 'danger' ? '#dc2626' : '#3a4454'}`,
                    background: flag.level === 'warning' ? '#af4d2717' : flag.level === 'danger' ? '#dc262615' : '#141922',
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
