type LayoutMode = 'tiles' | 'rows' | 'compact'

/** Sort options shown in the compact toolbar (aligned with former DealTierBar). */
type CompactSortOption =
  | 'flip_desc'
  | 'flip_asc'
  | 'price_low'
  | 'price_high'
  | 'engine_life'
  | 'dom_asc'
  | 'recent_add'

type SortOption =
  | CompactSortOption
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
  mobileFilterCount?: number
  onOpenMobileFilters?: () => void
  hidePriceUndisclosed: boolean
  onHidePriceUndisclosedChange: (checked: boolean) => void
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
  mobileFilterCount = 0,
  onOpenMobileFilters,
  hidePriceUndisclosed,
  onHidePriceUndisclosedChange,
}: ListingsResultsToolbarProps) {
  const showingStart = totalFiltered > 0 && visibleCount > 0
    ? (safePage - 1) * pageSize + 1
    : 0
  const showingEnd = totalFiltered > 0 && visibleCount > 0
    ? Math.min(totalFiltered, showingStart + visibleCount - 1)
    : 0

  return (
    <>
      <div className="sticky top-0 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[#3A4454] bg-[#1A1A1A]/95 p-2.5 backdrop-blur-sm md:static md:z-auto md:bg-[#1A1A1A] md:backdrop-blur-none">
        {onOpenMobileFilters ? (
          <button
            type="button"
            onClick={onOpenMobileFilters}
            className="order-first flex min-h-[44px] items-center rounded border border-[#FF9900] bg-[#141922] px-3 text-sm font-bold text-[#FF9900] hover:bg-[#FF9900] hover:text-black md:hidden"
            aria-label="Open filters"
          >
            Filters{mobileFilterCount > 0 ? ` (${mobileFilterCount})` : ''}
          </button>
        ) : null}
        <div className="min-w-[82px] rounded border border-[#3A4454] bg-[#141922] px-2 py-2 text-center text-xs font-semibold text-[#B2B2B2]" title="Current page / total pages">
          Page {safePage} of {totalPages}
        </div>
        <div className="ml-auto flex items-center gap-2">
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
      </div>

      <div className="mb-3 flex flex-col gap-3 min-[480px]:flex-row min-[480px]:flex-wrap min-[480px]:items-center min-[480px]:justify-between">
        <p className="text-[12px] font-bold text-[#D1D5DB] [data-theme='light']:text-[var(--fh-text)]">
          Showing {showingStart.toLocaleString('en-US')}-{showingEnd.toLocaleString('en-US')} of {totalFiltered.toLocaleString('en-US')} Listings.
        </p>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <label
            className="flex cursor-pointer items-center gap-1.5 text-xs text-[var(--fh-text-dim)]"
            style={{ fontFamily: 'var(--font-dm-sans)' }}
          >
            <input
              type="checkbox"
              className="fh-checkbox-orange h-3 w-3 shrink-0 rounded border-[var(--fh-border)]"
              checked={hidePriceUndisclosed}
              onChange={(e) => onHidePriceUndisclosedChange(e.target.checked)}
            />
            Hide &quot;Call for Price&quot;
          </label>
          <select
            value={sortBy === 'deal_desc' ? 'flip_desc' : sortBy}
            onChange={(e) => setSortBy(e.target.value as CompactSortOption)}
            className="rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-2 py-1.5 text-xs text-[var(--fh-text)]"
            style={{ fontFamily: 'var(--font-dm-sans), system-ui' }}
            aria-label="Sort listings"
          >
            <option value="flip_desc">Best flip opportunity</option>
            <option value="flip_asc">Flip score (low first)</option>
            <option value="price_low">Price ↑</option>
            <option value="price_high">Price ↓</option>
            <option value="engine_life">Engine Life ↓</option>
            <option value="dom_asc">Days Listed ↑</option>
            <option value="recent_add">Recently Added</option>
          </select>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Grid layout"
              onClick={() => setLayoutMode('tiles')}
              className={`rounded-md border p-1.5 ${layoutMode === 'tiles' ? 'bg-[var(--fh-bg4)] border-[var(--fh-border)]' : 'border-[var(--fh-border)] text-[var(--fh-text-dim)]'}`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="List layout"
              onClick={() => setLayoutMode('rows')}
              className={`rounded-md border p-1.5 ${layoutMode === 'rows' ? 'bg-[var(--fh-bg4)] border-[var(--fh-border)]' : 'border-[var(--fh-border)] text-[var(--fh-text-dim)]'}`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Compact layout"
              onClick={() => setLayoutMode('compact')}
              className={`rounded-md border p-1.5 ${layoutMode === 'compact' ? 'bg-[var(--fh-bg4)] border-[var(--fh-border)]' : 'border-[var(--fh-border)] text-[var(--fh-text-dim)]'}`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M4 5h16v3H4V5zm0 6h10v3H4v-3zm0 6h16v3H4v-3z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {fetchError && (
        <div className="mb-4 rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">
          Unable to load listings: {fetchError}
        </div>
      )}
    </>
  )
}
