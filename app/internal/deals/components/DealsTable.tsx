import type { ReactNode } from 'react'
import type { DealExplanation, DealListing, SortKey, WatchlistEntry } from '../types'

type DealsTableProps = {
  displayedRows: DealListing[]
  expandedId: string | null
  setExpandedId: (value: string | null | ((previous: string | null) => string | null)) => void
  watchlist: Record<string, WatchlistEntry>
  toggleWatch: (id: string) => void
  updateWatchNote: (id: string, note: string) => void
  buildDealExplanation: (row: DealListing) => DealExplanation
  dealScoreColor: (value: number | null) => string
  formatScore: (value: number | null) => string
  normalizeTier: (value: string | null | undefined) => string
  toTierBadgeText: (tier: string) => string
  tierBadgeClass: (tier: string) => string
  aircraftName: (row: DealListing) => string
  formatPrice: (row: DealListing) => string
  formatVsMarket: (value: number | null) => ReactNode
  formatComponentGap: (value: number | null | undefined) => ReactNode
  formatInteger: (value: number | null) => string
  formatLocation: (row: DealListing) => string
  daysListedClass: (value: number | null) => string
  formatDaysListed: (value: number | null) => string
  isHighPriorityDeal: (row: DealListing) => boolean
  sortKey: SortKey
  setSortKey: (value: SortKey) => void
}

function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>
}

function copyText(value: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value).catch(() => {
      // Ignore clipboard failures and fall back silently.
    })
    return
  }

  if (typeof document !== 'undefined') {
    const input = document.createElement('textarea')
    input.value = value
    input.style.position = 'fixed'
    input.style.opacity = '0'
    document.body.appendChild(input)
    input.focus()
    input.select()
    try {
      document.execCommand('copy')
    } catch {
      // Ignore copy command failures.
    }
    document.body.removeChild(input)
  }
}

function parseMakeModelFromTitle(title: string | null | undefined): { make: string; model: string } | null {
  const normalized = (title ?? '').trim()
  if (!normalized) return null
  const withoutYear = normalized.replace(/^\d{4}\s+/, '').trim()
  const tokens = withoutYear.split(/\s+/).filter(Boolean)
  if (tokens.length < 2) return null
  const make = tokens[0]
  const model = tokens.slice(1).join(' ')
  if (!make || !model) return null
  return { make, model }
}

function engineLifePct(row: DealListing): number | null {
  const pct = row.ev_pct_life_remaining
  if (typeof pct === 'number' && Number.isFinite(pct)) {
    return Math.max(0, Math.min(1, pct))
  }
  return null
}

function engineOverrun(row: DealListing): number {
  const overrun = row.ev_engine_overrun_liability
  return typeof overrun === 'number' && overrun > 0 ? overrun : 0
}

function deferredTotal(row: DealListing): number | null {
  const base = typeof row.deferred_total === 'number' ? row.deferred_total : null
  const overrun = engineOverrun(row)
  if (base === null && overrun <= 0) return null
  return (base ?? 0) + overrun
}

function formatCurrency(value: number | null): string {
  if (value === null) return '—'
  return `$${Math.round(value).toLocaleString('en-US')}`
}

function renderEngineLife(row: DealListing): ReactNode {
  const pct = engineLifePct(row)
  const overrun = engineOverrun(row)
  if (overrun > 0) {
    return <span className="font-semibold text-red-300">⚠ Over</span>
  }
  if (pct === null || typeof row.ev_hours_smoh !== 'number') {
    return <span className="text-[#777]">--</span>
  }
  const filled = Math.max(0, Math.min(5, Math.round(pct * 5)))
  const dots = '●'.repeat(filled).padEnd(5, '○')
  return (
    <span className="font-semibold text-brand-muted">
      {dots} <span className="text-white">{`${Math.round(pct * 100)}%`}</span>
    </span>
  )
}

function marketIntelHref(row: DealListing): string {
  const make = (row.make ?? '').trim()
  const model = (row.model ?? '').trim()
  if (make && model) {
    return `/internal/market-intel?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`
  }
  const titleFallback = parseMakeModelFromTitle((row as unknown as Record<string, unknown>).title as string | null | undefined)
  if (titleFallback) {
    return `/internal/market-intel?make=${encodeURIComponent(titleFallback.make)}&model=${encodeURIComponent(titleFallback.model)}`
  }
  return '/internal/market-intel'
}

export default function DealsTable({
  displayedRows,
  expandedId,
  setExpandedId,
  watchlist,
  toggleWatch,
  updateWatchNote,
  buildDealExplanation,
  dealScoreColor,
  formatScore,
  normalizeTier,
  toTierBadgeText,
  tierBadgeClass,
  aircraftName,
  formatPrice,
  formatVsMarket,
  formatComponentGap,
  formatInteger,
  formatLocation,
  daysListedClass,
  formatDaysListed,
  isHighPriorityDeal,
  sortKey,
  setSortKey,
}: DealsTableProps) {
  return (
    <div className="overflow-x-auto rounded border border-brand-dark bg-[#111]">
      <table className="min-w-[1600px] w-full text-xs">
        <thead className="bg-[#1c1c1c] text-brand-muted">
          <tr>
            <th className="px-2 py-2 text-left">Watch</th>
            <th className="px-2 py-2 text-left">Deal Score</th>
            <th className="px-2 py-2 text-left">Deal Tier</th>
            <th className="px-2 py-2 text-left">Aircraft</th>
            <th className="px-2 py-2 text-left">Price</th>
            <th className="px-2 py-2 text-left">vs Market</th>
            <th className="px-2 py-2 text-left">Component Gap</th>
            <th className="px-2 py-2 text-left">Deferred</th>
            <th className="px-2 py-2 text-left">
              <button
                type="button"
                onClick={() => setSortKey(sortKey === 'engine_life_desc' ? 'engine_life_asc' : 'engine_life_desc')}
                className="inline-flex items-center gap-1 text-left font-semibold hover:text-brand-orange"
                title="Sort by engine life"
              >
                Engine
                <span>{sortKey === 'engine_life_desc' ? '↓' : sortKey === 'engine_life_asc' ? '↑' : ''}</span>
              </button>
            </th>
            <th className="px-2 py-2 text-left">TT / SMOH</th>
            <th className="px-2 py-2 text-left">Avionics</th>
            <th className="px-2 py-2 text-left">Location</th>
            <th className="px-2 py-2 text-left">Days Listed</th>
            <th className="px-2 py-2 text-left">FAA Alert</th>
            <th className="px-2 py-2 text-left">Action</th>
          </tr>
        </thead>
        <tbody>
          {displayedRows.map((row) => {
            const isExpanded = expandedId === row.id
            const isStarred = Boolean(watchlist[row.id])
            const summary = buildDealExplanation(row)
            return (
              <FragmentRow key={row.id}>
                <tr
                  className={`cursor-pointer border-t border-brand-dark ${isExpanded ? 'bg-[#181818]' : 'bg-[#131313] hover:bg-[#1a1a1a]'}`}
                  onClick={() => setExpandedId((previous) => (previous === row.id ? null : row.id))}
                >
                  <td className="px-2 py-2 align-top">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        toggleWatch(row.id)
                      }}
                      className={`text-lg ${isStarred ? 'text-brand-orange' : 'text-[#666] hover:text-brand-orange'}`}
                      aria-label={isStarred ? 'Unstar listing' : 'Star listing'}
                    >
                      {isStarred ? '★' : '☆'}
                    </button>
                  </td>
                  <td className="px-2 py-2 align-top">
                    <span className={`text-lg font-extrabold ${dealScoreColor(row.deal_rating)}`}>{formatScore(row.deal_rating)}</span>
                  </td>
                  <td className="px-2 py-2 align-top">
                    <span className={`rounded px-2 py-1 text-[10px] font-bold ${tierBadgeClass(normalizeTier(row.deal_tier))}`}>
                      {toTierBadgeText(normalizeTier(row.deal_tier))}
                    </span>
                  </td>
                  <td className="px-2 py-2 align-top font-semibold text-white">{aircraftName(row)}</td>
                  <td className="px-2 py-2 align-top font-bold text-brand-orange">{formatPrice(row)}</td>
                  <td className="px-2 py-2 align-top">{formatVsMarket(row.vs_median_price)}</td>
                  <td className="px-2 py-2 align-top">{formatComponentGap(row.component_gap_value)}</td>
                  <td className="px-2 py-2 align-top font-semibold">{formatCurrency(deferredTotal(row))}</td>
                  <td className="px-2 py-2 align-top">{renderEngineLife(row)}</td>
                  <td className="px-2 py-2 align-top">
                    {formatInteger(row.total_time_airframe)} TT / {formatInteger(row.time_since_overhaul)} SMOH
                  </td>
                  <td className="px-2 py-2 align-top">
                    <span className="rounded bg-[#252525] px-2 py-1 text-[10px] text-white">A {Math.round(row.avionics_score ?? 0)}</span>{' '}
                    <span className="text-brand-muted">${formatInteger(row.avionics_installed_value)}</span>
                  </td>
                  <td className="px-2 py-2 align-top">{formatLocation(row)}</td>
                  <td className="px-2 py-2 align-top">
                    <div className="flex flex-col gap-1">
                      <span className={`inline-flex w-fit rounded px-2 py-1 text-[10px] font-bold ${daysListedClass(row.days_on_market)}`}>
                        {formatDaysListed(row.days_on_market)}
                      </span>
                      {row.price_reduced ? (
                        <span className="inline-flex w-fit rounded bg-emerald-900 px-2 py-1 text-[10px] font-bold text-emerald-100">
                          Price reduced
                        </span>
                      ) : null}
                      {isHighPriorityDeal(row) ? (
                        <span className="inline-flex w-fit rounded bg-red-900 px-2 py-1 text-[10px] font-bold text-red-100">
                          High priority
                        </span>
                      ) : null}
                      {row.flip_candidate_triggered ? (
                        <span className="inline-flex w-fit rounded bg-emerald-900 px-2 py-1 text-[10px] font-bold text-emerald-100">
                          Flip trigger
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-2 py-2 align-top">
                    {row.faa_registration_alert ? (
                      <span className="rounded bg-red-900 px-2 py-1 text-[10px] font-bold text-red-100">FAA ALERT</span>
                    ) : (
                      <span className="text-[#777]">None</span>
                    )}
                  </td>
                  <td className="px-2 py-2 align-top">
                    <div className="flex flex-col gap-1">
                      <a
                        href={row.listing_url || row.url || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded bg-brand-orange px-2 py-1 text-center text-[10px] font-bold !text-black hover:bg-brand-burn hover:!text-black"
                        onClick={(event) => event.stopPropagation()}
                      >
                        View Listing
                      </a>
                      <a
                        href={`/listings/${row.id}`}
                        className="text-[10px] text-brand-muted underline hover:text-brand-orange"
                        onClick={(event) => event.stopPropagation()}
                      >
                        Full Report
                      </a>
                      <button
                        type="button"
                        className="rounded border border-brand-dark px-2 py-1 text-center text-[10px] font-bold text-brand-muted hover:border-brand-orange hover:text-brand-orange"
                        onClick={(event) => {
                          event.stopPropagation()
                          copyText(row.id)
                        }}
                      >
                        Copy ID
                      </button>
                      <a
                        href={`/internal/deal-desk/${row.id}`}
                        className="rounded border border-brand-dark px-2 py-1 text-center text-[10px] font-bold text-brand-muted hover:border-brand-orange hover:text-brand-orange"
                        onClick={(event) => event.stopPropagation()}
                      >
                        Open Deal Desk
                      </a>
                      <a
                        href={marketIntelHref(row)}
                        className="rounded border border-brand-dark px-2 py-1 text-center text-[10px] font-bold text-brand-muted hover:border-brand-orange hover:text-brand-orange"
                        onClick={(event) => event.stopPropagation()}
                      >
                        Research Market →
                      </a>
                    </div>
                  </td>
                </tr>
                {isExpanded ? (
                  <tr className="border-t border-brand-dark bg-[#0f0f0f]">
                    <td colSpan={15} className="p-3">
                      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        <div className="rounded border border-brand-dark bg-[#161616] p-3 text-xs">
                          <div className="mb-2 text-sm font-bold text-brand-orange">Deal Explanation</div>
                          <p className="mb-1">{summary.price}</p>
                          <p className="mb-1">{summary.engine}</p>
                          <p className="mb-1">{summary.avionics}</p>
                          <p className="mb-1">{summary.component}</p>
                          <p className="mb-1">{summary.deferred}</p>
                          <p className="mb-1">{summary.risk}</p>
                          <p className="mt-2 font-semibold text-white">{summary.recommendation}</p>
                        </div>
                        <div className="rounded border border-brand-dark bg-[#161616] p-3 text-xs">
                          <div className="mb-2 text-sm font-bold text-brand-orange">Watchlist Note</div>
                          {isStarred ? (
                            <textarea
                              value={watchlist[row.id]?.note ?? ''}
                              onChange={(event) => updateWatchNote(row.id, event.target.value)}
                              placeholder="Add purchase notes, call follow-up, annual status, broker details..."
                              className="h-24 w-full rounded border border-brand-dark bg-[#0f0f0f] p-2 text-xs text-white focus:border-brand-orange focus:outline-none"
                            />
                          ) : (
                            <p className="text-brand-muted">Star this listing to save a private note.</p>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </FragmentRow>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
