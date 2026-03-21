type LayoutMode = 'tiles' | 'rows' | 'compact'
type SortOption =
  | 'price_low'
  | 'price_high'
  | 'deal_desc'
  | 'market_best'
  | 'market_worst'
  | 'risk_low'
  | 'risk_high'
  | 'deferred_low'
  | 'deferred_high'
  | 'tt_low'
  | 'tt_high'
  | 'year_newest'
  | 'year_oldest'
  | 'engine_life'

type ListingsResultsToolbarProps = {
  safePage: number
  totalPages: number
  visibleCount: number
  totalFiltered: number
  sortBy: SortOption
  setSortBy: (value: SortOption) => void
  pageSize: number
  setPageSize: (value: number) => void
  layoutMode: LayoutMode
  setLayoutMode: (value: LayoutMode) => void
  fetchError: string | null
}

export default function ListingsResultsToolbar({
  safePage,
  totalPages,
  visibleCount,
  totalFiltered,
  sortBy,
  setSortBy,
  pageSize,
  setPageSize,
  layoutMode,
  setLayoutMode,
  fetchError,
}: ListingsResultsToolbarProps) {
  const showingStart = totalFiltered > 0 && visibleCount > 0
    ? (safePage - 1) * pageSize + 1
    : 0
  const showingEnd = totalFiltered > 0 && visibleCount > 0
    ? Math.min(totalFiltered, showingStart + visibleCount - 1)
    : 0

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[#3A4454] bg-[#1A1A1A] p-2.5">
        <div className="min-w-[82px] rounded border border-[#3A4454] bg-[#141922] px-2 py-2 text-center text-xs font-semibold text-[#B2B2B2]" title="Current page / total pages">
          Page {safePage} of {totalPages}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="sort-by" className="text-xs font-semibold text-[#B2B2B2]">Sort By</label>
          <select
            id="sort-by"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="rounded border border-[#3A4454] bg-[#141922] px-2 py-2 text-xs text-white focus:border-brand-orange focus:outline-none"
          >
            <option value="market_best">Best Market Delta (most below)</option>
            <option value="deal_desc">Deal Tier (best first)</option>
            <option value="price_low">Price (low to high)</option>
            <option value="price_high">Price (high to low)</option>
            <option value="risk_low">Risk (low to critical)</option>
            <option value="risk_high">Risk (critical to low)</option>
            <option value="deferred_low">Deferred Cost (low to high)</option>
            <option value="deferred_high">Deferred Cost (high to low)</option>
            <option value="tt_low">Total Time (low to high)</option>
            <option value="tt_high">Total Time (high to low)</option>
            <option value="year_newest">Year (newest first)</option>
            <option value="year_oldest">Year (oldest first)</option>
            <option value="engine_life">Engine Life (most remaining first)</option>
            <option value="market_worst">Worst Market Delta (most above)</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="page-size" className="text-xs font-semibold text-[#B2B2B2]">Per Page</label>
          <select
            id="page-size"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded border border-[#3A4454] bg-[#141922] px-2 py-2 text-xs text-white focus:border-brand-orange focus:outline-none"
          >
            <option value={12}>12</option>
            <option value={24}>24</option>
            <option value={36}>36</option>
            <option value={48}>48</option>
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLayoutMode('tiles')}
            className={`inline-flex h-11 w-11 items-center justify-center rounded border transition-colors ${layoutMode === 'tiles' ? 'border-[#FF9900] bg-[#FF9900] text-black' : 'border-[#3A4454] bg-[#141922] text-[#B2B2B2] hover:border-[#FF9900] hover:text-[#FF9900]'}`}
            aria-label="Tile layout"
            title="Tile layout"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current" aria-hidden="true">
              <rect x="3" y="3" width="8" height="8" rx="1.2" />
              <rect x="13" y="3" width="8" height="8" rx="1.2" />
              <rect x="3" y="13" width="8" height="8" rx="1.2" />
              <rect x="13" y="13" width="8" height="8" rx="1.2" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setLayoutMode('rows')}
            className={`inline-flex h-11 w-11 items-center justify-center rounded border transition-colors ${layoutMode === 'rows' ? 'border-[#FF9900] bg-[#FF9900] text-black' : 'border-[#3A4454] bg-[#141922] text-[#B2B2B2] hover:border-[#FF9900] hover:text-[#FF9900]'}`}
            aria-label="Row layout"
            title="Row layout"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current" aria-hidden="true">
              <rect x="3" y="4" width="5" height="4" rx="1" />
              <rect x="10" y="4" width="11" height="4" rx="1" />
              <rect x="3" y="10" width="5" height="4" rx="1" />
              <rect x="10" y="10" width="11" height="4" rx="1" />
              <rect x="3" y="16" width="5" height="4" rx="1" />
              <rect x="10" y="16" width="11" height="4" rx="1" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setLayoutMode('compact')}
            className={`inline-flex h-11 w-11 items-center justify-center rounded border transition-colors ${layoutMode === 'compact' ? 'border-[#FF9900] bg-[#FF9900] text-black' : 'border-[#3A4454] bg-[#141922] text-[#B2B2B2] hover:border-[#FF9900] hover:text-[#FF9900]'}`}
            aria-label="Compact row layout"
            title="Compact row layout"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current" aria-hidden="true">
              <rect x="3" y="4" width="18" height="4" rx="1.2" />
              <rect x="3" y="10" width="18" height="4" rx="1.2" />
              <rect x="3" y="16" width="18" height="4" rx="1.2" />
            </svg>
          </button>
        </div>
      </div>
      <p className="mb-3 text-[12px] font-bold text-[#D1D5DB]">
        Showing {showingStart.toLocaleString('en-US')}-{showingEnd.toLocaleString('en-US')} of {totalFiltered.toLocaleString('en-US')} Listings.
      </p>
      {fetchError && (
        <div className="mb-4 rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">
          Unable to load listings: {fetchError}
        </div>
      )}
    </>
  )
}
