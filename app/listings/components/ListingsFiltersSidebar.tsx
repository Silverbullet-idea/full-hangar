import type { ReactNode } from 'react'

type ListingSourceKey =
  | 'trade-a-plane'
  | 'controller'
  | 'aerotrader'
  | 'aircraftforsale'
  | 'aso'
  | 'globalair'
  | 'barnstormers'
  | 'controller_cdp'
  | 'unknown'

type ListingsFiltersSidebarProps = {
  makeFilter: string
  setMakeFilter: (value: string) => void
  modelFilter: string
  setModelFilter: (value: string) => void
  subModelFilter: string
  setSubModelFilter: (value: string) => void
  sourceFilter: 'all' | ListingSourceKey
  setSourceFilter: (value: 'all' | ListingSourceKey) => void
  maxPrice: number
  setMaxPrice: (value: number) => void
  riskFilter: string
  setRiskFilter: (value: string) => void
  ownershipType: 'all' | 'full' | 'fractional'
  setOwnershipType: (value: 'all' | 'full' | 'fractional') => void
  makeOptions: string[]
  modelOptions: string[]
  subModelOptions: string[]
  onResetFilters: () => void
  onApplyFilters: () => void
  riskTooltip: ReactNode
}

export default function ListingsFiltersSidebar({
  makeFilter,
  setMakeFilter,
  modelFilter,
  setModelFilter,
  subModelFilter,
  setSubModelFilter,
  sourceFilter,
  setSourceFilter,
  maxPrice,
  setMaxPrice,
  riskFilter,
  setRiskFilter,
  ownershipType,
  setOwnershipType,
  makeOptions,
  modelOptions,
  subModelOptions,
  onResetFilters,
  onApplyFilters,
  riskTooltip,
}: ListingsFiltersSidebarProps) {
  return (
    <aside className="h-fit rounded-lg border border-[#3A4454] bg-[#1A1A1A] p-4">
      <div className="mb-3 text-sm font-semibold text-white">Filters</div>
      <div className="flex flex-col gap-3">
        <label className="text-xs text-brand-muted">
          Make
          <select
            value={makeFilter}
            onChange={(e) => {
              setMakeFilter(e.target.value)
              setModelFilter('')
              setSubModelFilter('')
            }}
            className="mt-1 block w-full rounded border border-[#3A4454] bg-[#141922] px-3 py-2 text-sm text-white focus:border-brand-orange focus:outline-none"
          >
            <option value="all">All makes</option>
            {makeOptions.map((make) => (
              <option key={make} value={make}>
                {make}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-brand-muted">
          Model
          <select
            value={modelFilter}
            onChange={(e) => {
              setModelFilter(e.target.value)
              setSubModelFilter('')
            }}
            className="mt-1 block w-full rounded border border-[#3A4454] bg-[#141922] px-3 py-2 text-sm text-white focus:border-brand-orange focus:outline-none"
          >
            <option value="">{makeFilter === 'all' ? 'Any model family...' : 'Model family within selected make...'}</option>
            {modelOptions.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
        {modelFilter ? (
          <label className="text-xs text-brand-muted">
            Sub Model
            <select
              value={subModelFilter}
              onChange={(e) => setSubModelFilter(e.target.value)}
              className="mt-1 block w-full rounded border border-[#3A4454] bg-[#141922] px-3 py-2 text-sm text-white focus:border-brand-orange focus:outline-none"
            >
              <option value="">Any sub model...</option>
              {subModelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="text-xs text-brand-muted">
          Source
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as 'all' | ListingSourceKey)}
            className="mt-1 block w-full rounded border border-[#3A4454] bg-[#141922] px-3 py-2 text-sm text-white focus:border-brand-orange focus:outline-none"
          >
            <option value="all">All sources</option>
            <option value="controller">Controller</option>
            <option value="trade-a-plane">Trade-A-Plane</option>
            <option value="aerotrader">AeroTrader</option>
            <option value="aircraftforsale">AircraftForSale</option>
            <option value="aso">ASO</option>
            <option value="globalair">GlobalAir</option>
            <option value="barnstormers">Barnstormers</option>
            <option value="controller_cdp">Controller CDP</option>
          </select>
        </label>
        <label className="text-xs text-brand-muted">
          Max Price
          <select
            value={maxPrice}
            onChange={(e) => setMaxPrice(Number(e.target.value))}
            className="mt-1 block w-full rounded border border-[#3A4454] bg-[#141922] px-3 py-2 text-sm text-white focus:border-brand-orange focus:outline-none"
          >
            <option value={0}>Any price</option>
            <option value={50000}>Under $50,000</option>
            <option value={100000}>Under $100,000</option>
            <option value={200000}>Under $200,000</option>
            <option value={500000}>Under $500,000</option>
          </select>
        </label>
        <label className="text-xs text-brand-muted">
          Risk Level
          {riskTooltip}
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="mt-1 block w-full rounded border border-[#3A4454] bg-[#141922] px-3 py-2 text-sm text-white focus:border-brand-orange focus:outline-none"
          >
            <option value="all">All</option>
            <option value="low">Low</option>
            <option value="moderate">Moderate</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <label className="text-xs text-brand-muted">
          Ownership Type
          <select
            value={ownershipType}
            onChange={(e) => setOwnershipType(e.target.value as 'all' | 'full' | 'fractional')}
            className="mt-1 block w-full rounded border border-[#3A4454] bg-[#141922] px-3 py-2 text-sm text-white focus:border-brand-orange focus:outline-none"
          >
            <option value="all">All ownership types</option>
            <option value="full">Full ownership only</option>
            <option value="fractional">Fractional ownership only</option>
          </select>
        </label>
        <button
          type="button"
          onClick={onResetFilters}
          className="rounded border border-[#3A4454] bg-transparent px-3 py-2 text-sm text-[#B2B2B2] hover:border-[#FF9900] hover:text-[#FF9900]"
        >
          Reset Filters
        </button>
        <button
          type="button"
          onClick={onApplyFilters}
          className="rounded border border-[#FF9900] bg-[#FF9900] px-3 py-2 text-sm font-bold text-black hover:bg-[#AF4D27] hover:text-white"
        >
          Search
        </button>
      </div>
    </aside>
  )
}
