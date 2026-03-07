import Link from 'next/link'

type CategoryValue = 'single' | 'multi' | 'se_turboprop' | 'me_turboprop' | 'jet' | 'helicopter' | 'lsp' | 'sea' | null
type DealTierValue = 'all' | 'TOP_DEALS' | 'EXCEPTIONAL_DEAL' | 'GOOD_DEAL' | 'FAIR_MARKET' | 'ABOVE_MARKET' | 'OVERPRICED'

type ListingsTopBannerProps = {
  topMenuButtonCount: number
  visibleCategories: ReadonlyArray<{ label: string; value: CategoryValue }>
  categoryFilter: CategoryValue
  makeOptions: string[]
  makeCountMap: Record<string, number>
  categoryMenuData: {
    makesByCategory: Record<Exclude<CategoryValue, null>, Array<{ make: string; count: number }>>
  }
  dealFilter: DealTierValue
  dealTierCountMap: Record<string, number>
  buildCategoryHref: (category: CategoryValue) => string
  buildCategoryMakeHref: (category: CategoryValue, make: string) => string
  buildDealHref: (dealTier: DealTierValue) => string
  onSelectCategory: (category: CategoryValue) => void
  onSelectDealPreset: (preset: 'all' | 'top' | 'exceptional' | 'good' | 'fair' | 'above' | 'overpriced') => void
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
  buildCategoryHref,
  buildCategoryMakeHref,
  buildDealHref,
  onSelectCategory,
  onSelectDealPreset,
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
                  .filter((entry) => entry.count > 1)
                  .sort((a, b) => a.make.localeCompare(b.make))
              : categoryMenuData.makesByCategory[category.value]
            const hasDropdownMakes = dropdownMakes.length > 0
            return (
              <div key={category.label} className="group relative -mb-2 pb-2">
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
                  <div className="pointer-events-none invisible absolute left-0 top-full z-30 mt-0 min-w-[250px] rounded-md border border-[#3A4454] bg-[#141922] p-2 opacity-0 shadow-xl transition-all duration-150 delay-75 group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100 group-hover:delay-0 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:opacity-100 group-focus-within:delay-0">
                    <div className="max-h-72 overflow-y-auto pr-1">
                    {dropdownMakes.map((entry) => (
                      <Link
                        key={`${category.label}-${entry.make}`}
                        href={buildCategoryMakeHref(category.value, entry.make)}
                        className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs text-[#B2B2B2] hover:bg-[#1d2636] hover:text-[#FF9900]"
                      >
                        <span>{entry.make}</span>
                        <span className="shrink-0 text-[10px] text-[#7d8aa0]">{entry.count.toLocaleString('en-US')}</span>
                      </Link>
                    ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
          <div className="group relative order-last -mb-2 pb-2">
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
                  <div className="pointer-events-none invisible absolute right-0 top-full z-30 mt-0 min-w-[220px] rounded-md border border-[#3A4454] bg-[#141922] p-2 opacity-0 shadow-xl transition-all duration-150 delay-75 group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100 group-hover:delay-0 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:opacity-100 group-focus-within:delay-0">
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
        </div>
      </div>
    </div>
  )
}
