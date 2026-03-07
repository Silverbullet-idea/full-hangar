import Link from 'next/link'

type CategoryValue = 'single' | 'multi' | 'turboprop' | 'jet' | 'helicopter' | 'lsp' | 'sea' | null
type DealTierValue = 'all' | 'TOP_DEALS' | 'EXCEPTIONAL_DEAL' | 'GOOD_DEAL' | 'FAIR_MARKET' | 'ABOVE_MARKET' | 'OVERPRICED'
type SortOption =
  | 'value_desc'
  | 'value_asc'
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

type ListingsTopBannerProps = {
  topMenuButtonCount: number
  visibleCategories: Array<{ label: string; value: CategoryValue }>
  categoryFilter: CategoryValue
  makeOptions: string[]
  makeCountMap: Record<string, number>
  categoryMenuData: {
    makesByCategory: Record<Exclude<CategoryValue, null>, Array<{ make: string; count: number }>>
  }
  dealFilter: DealTierValue
  dealTierCountMap: Record<string, number>
  minimumScore: number
  buildCategoryHref: (category: CategoryValue) => string
  buildCategoryMakeHref: (category: CategoryValue, make: string) => string
  buildDealHref: (dealTier: DealTierValue) => string
  onSelectCategory: (category: CategoryValue) => void
  onSelectDealPreset: (preset: 'all' | 'top' | 'exceptional' | 'good' | 'fair' | 'above' | 'overpriced') => void
  onSetDealFilter: (dealFilter: DealTierValue) => void
  onSetMinimumScore: (score: number) => void
  onSetSortBy: (sort: SortOption) => void
}

export default function ListingsTopBanner({
  topMenuButtonCount,
  visibleCategories,
  categoryFilter,
  makeOptions,
  makeCountMap,
  categoryMenuData,
  dealFilter,
  dealTierCountMap,
  minimumScore,
  buildCategoryHref,
  buildCategoryMakeHref,
  buildDealHref,
  onSelectCategory,
  onSelectDealPreset,
  onSetDealFilter,
  onSetMinimumScore,
  onSetSortBy,
}: ListingsTopBannerProps) {
  return (
    <div className="mb-6 flex flex-col gap-3">
      <div className="w-full rounded-lg border border-[#3A4454] bg-[#1A1A1A] p-1.5">
        <div
          className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-1 sm:grid-cols-3 lg:[grid-template-columns:repeat(var(--top-btn-count),minmax(0,1fr))]"
          style={{ ['--top-btn-count' as any]: topMenuButtonCount }}
        >
          {visibleCategories.map((category) => {
            const isActive = categoryFilter === category.value
            const dropdownMakes = category.value === null
              ? makeOptions
                  .map((make) => ({ make, count: makeCountMap[make] ?? 0 }))
                  .filter((entry) => entry.count >= 10)
                  .sort((a, b) => b.count - a.count || a.make.localeCompare(b.make))
              : categoryMenuData.makesByCategory[category.value]
            const hasDropdownMakes = dropdownMakes.length > 0
            return (
              <div key={category.label} className="group relative">
                <Link
                  href={buildCategoryHref(category.value)}
                  onClick={() => onSelectCategory(category.value)}
                  className={`block w-full rounded-md px-2 py-2 text-center text-sm transition-colors ${
                    isActive
                      ? 'h-8 border border-[#FF9900] bg-[#121822] text-xs font-bold text-white visited:text-white hover:text-[#FF9900]'
                      : 'h-8 border border-[#3A4454] bg-[#121822] text-xs font-semibold text-white visited:text-white hover:border-[#FF9900] hover:text-[#FF9900]'
                  }`}
                >
                  {category.label}
                </Link>
                {hasDropdownMakes ? (
                  <div className="absolute left-0 top-full z-30 mt-1 hidden min-w-[240px] rounded-md border border-[#3A4454] bg-[#141922] p-2 shadow-xl group-hover:block">
                    {dropdownMakes.map((entry) => (
                      <Link
                        key={`${category.label}-${entry.make}`}
                        href={buildCategoryMakeHref(category.value, entry.make)}
                        className="block w-full rounded px-2 py-1 text-left text-xs text-[#B2B2B2] hover:bg-[#1d2636] hover:text-[#FF9900]"
                      >
                        {entry.make}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
          <div className="group relative order-last">
            {(() => {
              const isDealsActive = dealFilter === 'TOP_DEALS'
              const menuItemClass = () =>
                "block w-full rounded bg-[#141922] px-2 py-1 text-left text-xs text-[#B2B2B2] hover:bg-[#1d2636] hover:text-[#FF9900]"
              const dealMenuItems: Array<{
                key: DealTierValue
                label: string
                preset: 'all' | 'top' | 'exceptional' | 'good' | 'fair' | 'above' | 'overpriced'
              }> = [
                { key: 'TOP_DEALS', label: 'Exceptional + Good Deals', preset: 'top' },
                { key: 'EXCEPTIONAL_DEAL', label: 'Exceptional Deals', preset: 'exceptional' },
                { key: 'GOOD_DEAL', label: 'Good Deals', preset: 'good' },
                { key: 'all', label: 'All Deals', preset: 'all' },
                { key: 'FAIR_MARKET', label: 'Fair Market', preset: 'fair' },
                { key: 'ABOVE_MARKET', label: 'Above Market', preset: 'above' },
                { key: 'OVERPRICED', label: 'Overpriced', preset: 'overpriced' },
              ]
              const visibleDealItems = dealMenuItems
                .map((item) => ({
                  ...item,
                  count: item.key === 'all'
                    ? (dealTierCountMap.all ?? 0)
                    : (dealTierCountMap[item.key] ?? 0),
                }))
                .filter((item) => item.count >= 10)
              return (
                <>
                  <Link
                    href={buildDealHref('TOP_DEALS')}
                    onClick={() => onSelectDealPreset('top')}
                    className={`flex h-8 w-full items-center justify-center rounded-md border px-2 text-center text-xs font-bold ${isDealsActive ? 'border-[#FF9900] bg-[#FF9900] text-black' : 'border-[#166534] bg-[#166534] text-white hover:bg-[#15803d]'}`}
                  >
                    Deals
                  </Link>
                  <div className="pointer-events-none invisible absolute right-0 top-full z-30 mt-0 min-w-[220px] rounded-md border border-[#3A4454] bg-[#141922] p-2 opacity-0 shadow-xl transition-opacity group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:opacity-100">
                    {visibleDealItems.map((item) => (
                      <Link
                        key={item.key}
                        href={buildDealHref(item.key)}
                        onClick={() => onSelectDealPreset(item.preset)}
                        className={menuItemClass()}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </>
              )
            })()}
          </div>
          <div className="group relative">
            <button
              type="button"
              className="block h-8 w-full rounded-md border border-[#3A4454] bg-[#121822] px-2 text-center text-xs font-semibold text-white hover:border-[#FF9900] hover:text-[#FF9900]"
            >
              Deal Rating
            </button>
            <div className="pointer-events-none invisible absolute left-0 top-full z-30 mt-0 min-w-[220px] rounded-md border border-[#3A4454] bg-[#141922] p-2 opacity-0 shadow-xl transition-opacity group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:opacity-100">
              <button type="button" onClick={() => onSetDealFilter('all')} className="block w-full rounded px-2 py-1 text-left text-xs text-[#B2B2B2] hover:bg-[#1d2636] hover:text-[#FF9900]">All</button>
              <button type="button" onClick={() => { onSetDealFilter('TOP_DEALS'); onSetSortBy('deal_desc') }} className="block w-full rounded px-2 py-1 text-left text-xs text-[#B2B2B2] hover:bg-[#1d2636] hover:text-[#FF9900]">Exceptional + Good Deals</button>
              <button type="button" onClick={() => onSetDealFilter('EXCEPTIONAL_DEAL')} className="block w-full rounded px-2 py-1 text-left text-xs text-[#B2B2B2] hover:bg-[#1d2636] hover:text-[#FF9900]">Exceptional Deals</button>
              <button type="button" onClick={() => onSetDealFilter('GOOD_DEAL')} className="block w-full rounded px-2 py-1 text-left text-xs text-[#B2B2B2] hover:bg-[#1d2636] hover:text-[#FF9900]">Good Deals</button>
              <button type="button" onClick={() => onSetDealFilter('FAIR_MARKET')} className="block w-full rounded px-2 py-1 text-left text-xs text-[#B2B2B2] hover:bg-[#1d2636] hover:text-[#FF9900]">Fair Market</button>
              <button type="button" onClick={() => onSetDealFilter('ABOVE_MARKET')} className="block w-full rounded px-2 py-1 text-left text-xs text-[#B2B2B2] hover:bg-[#1d2636] hover:text-[#FF9900]">Above Market</button>
              <button type="button" onClick={() => onSetDealFilter('OVERPRICED')} className="block w-full rounded px-2 py-1 text-left text-xs text-[#B2B2B2] hover:bg-[#1d2636] hover:text-[#FF9900]">Overpriced</button>
            </div>
          </div>
          <div className="group relative">
            <button
              type="button"
              className="block h-8 w-full rounded-md border border-[#3A4454] bg-[#121822] px-2 text-center text-xs font-semibold text-white hover:border-[#FF9900] hover:text-[#FF9900]"
            >
              Value Score
            </button>
            <div className="pointer-events-none invisible absolute left-0 top-full z-30 mt-0 min-w-[200px] rounded-md border border-[#3A4454] bg-[#141922] p-2 opacity-0 shadow-xl transition-opacity group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:opacity-100">
              <button type="button" onClick={() => onSetMinimumScore(0)} className="block w-full rounded px-2 py-1 text-left text-xs text-[#B2B2B2] hover:bg-[#1d2636] hover:text-[#FF9900]">Any score</button>
              <button type="button" onClick={() => onSetMinimumScore(60)} className="block w-full rounded px-2 py-1 text-left text-xs text-[#B2B2B2] hover:bg-[#1d2636] hover:text-[#FF9900]">60+</button>
              <button type="button" onClick={() => onSetMinimumScore(80)} className="block w-full rounded px-2 py-1 text-left text-xs text-[#B2B2B2] hover:bg-[#1d2636] hover:text-[#FF9900]">80+</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
