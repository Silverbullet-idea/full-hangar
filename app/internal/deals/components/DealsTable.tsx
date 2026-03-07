import type { ReactNode } from 'react'
import type { DealExplanation, DealListing, WatchlistEntry } from '../types'

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
}

function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>
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
                        className="rounded bg-brand-orange px-2 py-1 text-center text-[10px] font-bold text-black hover:bg-brand-burn hover:text-white"
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
                    </div>
                  </td>
                </tr>
                {isExpanded ? (
                  <tr className="border-t border-brand-dark bg-[#0f0f0f]">
                    <td colSpan={13} className="p-3">
                      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        <div className="rounded border border-brand-dark bg-[#161616] p-3 text-xs">
                          <div className="mb-2 text-sm font-bold text-brand-orange">Deal Explanation</div>
                          <p className="mb-1">{summary.price}</p>
                          <p className="mb-1">{summary.engine}</p>
                          <p className="mb-1">{summary.avionics}</p>
                          <p className="mb-1">{summary.component}</p>
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
