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

type DealTierFilter = 'all' | 'TOP_DEALS' | 'EXCEPTIONAL_DEAL' | 'GOOD_DEAL' | 'FAIR_MARKET' | 'ABOVE_MARKET' | 'OVERPRICED'
type PriceStatusFilter = 'all' | 'priced'
type MaintenanceBandFilter = 'any' | 'light' | 'moderate' | 'heavy' | 'severe'

type ListingsFiltersSidebarProps = {
  makeFilter: string
  setMakeFilter: (value: string) => void
  modelFilter: string
  setModelFilter: (value: string) => void
  subModelFilter: string
  setSubModelFilter: (value: string) => void
  sourceFilter: 'all' | ListingSourceKey
  setSourceFilter: (value: 'all' | ListingSourceKey) => void
  dealFilter: DealTierFilter
  setDealFilter: (value: DealTierFilter) => void
  priceStatus: PriceStatusFilter
  setPriceStatus: (value: PriceStatusFilter) => void
  minPrice: number
  setMinPrice: (value: number) => void
  maxPrice: number
  setMaxPrice: (value: number) => void
  yearMin: number
  setYearMin: (value: number) => void
  yearMax: number
  setYearMax: (value: number) => void
  totalTimeMin: number
  setTotalTimeMin: (value: number) => void
  totalTimeMax: number
  setTotalTimeMax: (value: number) => void
  maintenanceBand: MaintenanceBandFilter
  setMaintenanceBand: (value: MaintenanceBandFilter) => void
  trueCostMin: number
  setTrueCostMin: (value: number) => void
  trueCostMax: number
  setTrueCostMax: (value: number) => void
  riskFilter: string
  setRiskFilter: (value: string) => void
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
  dealFilter,
  setDealFilter,
  priceStatus,
  setPriceStatus,
  minPrice,
  setMinPrice,
  maxPrice,
  setMaxPrice,
  yearMin,
  setYearMin,
  yearMax,
  setYearMax,
  totalTimeMin,
  setTotalTimeMin,
  totalTimeMax,
  setTotalTimeMax,
  maintenanceBand,
  setMaintenanceBand,
  trueCostMin,
  setTrueCostMin,
  trueCostMax,
  setTrueCostMax,
  riskFilter,
  setRiskFilter,
  makeOptions,
  modelOptions,
  subModelOptions,
  onResetFilters,
  onApplyFilters,
  riskTooltip,
}: ListingsFiltersSidebarProps) {
  const priceSteps = [0, 50000, 100000, 200000, 300000, 500000, 750000, 1000000, 1500000, 2000000]
  const yearSteps = [0, 1960, 1970, 1980, 1990, 2000, 2010, 2015, 2020, 2023, 2024, 2025, 2026]
  const totalTimeSteps = [0, 1000, 2500, 5000, 7500, 10000, 15000, 20000]

  const parseNumberInput = (value: string) => {
    const cleaned = value.replace(/[^\d]/g, '')
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
  }

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
          Deal Type
          <select
            value={dealFilter}
            onChange={(e) => setDealFilter(e.target.value as DealTierFilter)}
            className="mt-1 block w-full rounded border border-[#3A4454] bg-[#141922] px-3 py-2 text-sm text-white focus:border-brand-orange focus:outline-none"
          >
            <option value="all">All Deals</option>
            <option value="TOP_DEALS">Exceptional + Good</option>
            <option value="EXCEPTIONAL_DEAL">Exceptional Deal</option>
            <option value="GOOD_DEAL">Good Deal</option>
            <option value="FAIR_MARKET">Fair Market</option>
            <option value="ABOVE_MARKET">Above Market</option>
            <option value="OVERPRICED">Overpriced</option>
          </select>
        </label>
        <label className="text-xs text-brand-muted">
          Price Status
          <select
            value={priceStatus}
            onChange={(e) => setPriceStatus(e.target.value as PriceStatusFilter)}
            className="mt-1 block w-full rounded border border-[#3A4454] bg-[#141922] px-3 py-2 text-sm text-white focus:border-brand-orange focus:outline-none"
          >
            <option value="all">All listings</option>
            <option value="priced">Priced only</option>
          </select>
        </label>
        <div className="rounded border border-[#2b3342] bg-[#121822] p-3">
          <div className="mb-2 text-xs font-semibold text-[#d1d5db]">Price Range</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-brand-muted">
              Min
              <select
                value={minPrice}
                onChange={(e) => setMinPrice(Number(e.target.value))}
                className="mt-1 block w-full rounded border border-[#3A4454] bg-[#141922] px-2 py-2 text-xs text-white focus:border-brand-orange focus:outline-none"
              >
                {priceSteps.map((step) => (
                  <option key={`min-price-${step}`} value={step}>
                    {step === 0 ? 'Any' : `$${step.toLocaleString('en-US')}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-brand-muted">
              Max
              <select
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="mt-1 block w-full rounded border border-[#3A4454] bg-[#141922] px-2 py-2 text-xs text-white focus:border-brand-orange focus:outline-none"
              >
                {priceSteps.map((step) => (
                  <option key={`max-price-${step}`} value={step}>
                    {step === 0 ? 'Any' : `$${step.toLocaleString('en-US')}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[11px] text-brand-muted">
              Custom Min
              <input
                type="text"
                inputMode="numeric"
                value={minPrice > 0 ? String(minPrice) : ''}
                onChange={(e) => setMinPrice(parseNumberInput(e.target.value))}
                placeholder="e.g. 185000"
                className="mt-1 block w-full rounded border border-[#3A4454] bg-[#141922] px-2 py-2 text-xs text-white placeholder:text-[#7d8aa0] focus:border-brand-orange focus:outline-none"
              />
            </label>
            <label className="text-[11px] text-brand-muted">
              Custom Max
              <input
                type="text"
                inputMode="numeric"
                value={maxPrice > 0 ? String(maxPrice) : ''}
                onChange={(e) => setMaxPrice(parseNumberInput(e.target.value))}
                placeholder="e.g. 450000"
                className="mt-1 block w-full rounded border border-[#3A4454] bg-[#141922] px-2 py-2 text-xs text-white placeholder:text-[#7d8aa0] focus:border-brand-orange focus:outline-none"
              />
            </label>
          </div>
        </div>
        <div className="rounded border border-[#2b3342] bg-[#121822] p-3">
          <div className="mb-2 text-xs font-semibold text-[#d1d5db]">Year Range</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-brand-muted">
              Min
              <select
                value={yearMin}
                onChange={(e) => setYearMin(Number(e.target.value))}
                className="mt-1 block w-full rounded border border-[#3A4454] bg-[#141922] px-2 py-2 text-xs text-white focus:border-brand-orange focus:outline-none"
              >
                {yearSteps.map((step) => (
                  <option key={`min-year-${step}`} value={step}>
                    {step === 0 ? 'Any' : String(step)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-brand-muted">
              Max
              <select
                value={yearMax}
                onChange={(e) => setYearMax(Number(e.target.value))}
                className="mt-1 block w-full rounded border border-[#3A4454] bg-[#141922] px-2 py-2 text-xs text-white focus:border-brand-orange focus:outline-none"
              >
                {yearSteps.map((step) => (
                  <option key={`max-year-${step}`} value={step}>
                    {step === 0 ? 'Any' : String(step)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[11px] text-brand-muted">
              Custom Min
              <input
                type="text"
                inputMode="numeric"
                value={yearMin > 0 ? String(yearMin) : ''}
                onChange={(e) => setYearMin(parseNumberInput(e.target.value))}
                placeholder="e.g. 2008"
                className="mt-1 block w-full rounded border border-[#3A4454] bg-[#141922] px-2 py-2 text-xs text-white placeholder:text-[#7d8aa0] focus:border-brand-orange focus:outline-none"
              />
            </label>
            <label className="text-[11px] text-brand-muted">
              Custom Max
              <input
                type="text"
                inputMode="numeric"
                value={yearMax > 0 ? String(yearMax) : ''}
                onChange={(e) => setYearMax(parseNumberInput(e.target.value))}
                placeholder="e.g. 2022"
                className="mt-1 block w-full rounded border border-[#3A4454] bg-[#141922] px-2 py-2 text-xs text-white placeholder:text-[#7d8aa0] focus:border-brand-orange focus:outline-none"
              />
            </label>
          </div>
        </div>
        <div className="rounded border border-[#2b3342] bg-[#121822] p-3">
          <div className="mb-2 text-xs font-semibold text-[#d1d5db]">Total Time Airframe (Hours)</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-brand-muted">
              Min
              <select
                value={totalTimeMin}
                onChange={(e) => setTotalTimeMin(Number(e.target.value))}
                className="mt-1 block w-full rounded border border-[#3A4454] bg-[#141922] px-2 py-2 text-xs text-white focus:border-brand-orange focus:outline-none"
              >
                {totalTimeSteps.map((step) => (
                  <option key={`min-tt-${step}`} value={step}>
                    {step === 0 ? 'Any' : step.toLocaleString('en-US')}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-brand-muted">
              Max
              <select
                value={totalTimeMax}
                onChange={(e) => setTotalTimeMax(Number(e.target.value))}
                className="mt-1 block w-full rounded border border-[#3A4454] bg-[#141922] px-2 py-2 text-xs text-white focus:border-brand-orange focus:outline-none"
              >
                {totalTimeSteps.map((step) => (
                  <option key={`max-tt-${step}`} value={step}>
                    {step === 0 ? 'Any' : step.toLocaleString('en-US')}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-[11px] text-brand-muted">
              Custom Min
              <input
                type="text"
                inputMode="numeric"
                value={totalTimeMin > 0 ? String(totalTimeMin) : ''}
                onChange={(e) => setTotalTimeMin(parseNumberInput(e.target.value))}
                placeholder="e.g. 1200"
                className="mt-1 block w-full rounded border border-[#3A4454] bg-[#141922] px-2 py-2 text-xs text-white placeholder:text-[#7d8aa0] focus:border-brand-orange focus:outline-none"
              />
            </label>
            <label className="text-[11px] text-brand-muted">
              Custom Max
              <input
                type="text"
                inputMode="numeric"
                value={totalTimeMax > 0 ? String(totalTimeMax) : ''}
                onChange={(e) => setTotalTimeMax(parseNumberInput(e.target.value))}
                placeholder="e.g. 8500"
                className="mt-1 block w-full rounded border border-[#3A4454] bg-[#141922] px-2 py-2 text-xs text-white placeholder:text-[#7d8aa0] focus:border-brand-orange focus:outline-none"
              />
            </label>
          </div>
        </div>
        <label className="text-xs text-brand-muted">
          Maintenance Burden
          <select
            value={maintenanceBand}
            onChange={(e) => setMaintenanceBand(e.target.value as MaintenanceBandFilter)}
            className="mt-1 block w-full rounded border border-[#3A4454] bg-[#141922] px-3 py-2 text-sm text-white focus:border-brand-orange focus:outline-none"
          >
            <option value="any">Any</option>
            <option value="light">Light (&lt;= $25k deferred)</option>
            <option value="moderate">Moderate ($25k - $100k)</option>
            <option value="heavy">Heavy ($100k - $250k)</option>
            <option value="severe">Severe (&gt; $250k)</option>
          </select>
        </label>
        <div className="rounded border border-[#2b3342] bg-[#121822] p-3">
          <div className="mb-2 text-xs font-semibold text-[#d1d5db]">True Cost Range (Exact)</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-brand-muted">
              Min
              <input
                type="text"
                inputMode="numeric"
                value={trueCostMin > 0 ? String(trueCostMin) : ''}
                onChange={(e) => setTrueCostMin(parseNumberInput(e.target.value))}
                placeholder="e.g. 300000"
                className="mt-1 block w-full rounded border border-[#3A4454] bg-[#141922] px-2 py-2 text-xs text-white placeholder:text-[#7d8aa0] focus:border-brand-orange focus:outline-none"
              />
            </label>
            <label className="text-[11px] text-brand-muted">
              Max
              <input
                type="text"
                inputMode="numeric"
                value={trueCostMax > 0 ? String(trueCostMax) : ''}
                onChange={(e) => setTrueCostMax(parseNumberInput(e.target.value))}
                placeholder="e.g. 700000"
                className="mt-1 block w-full rounded border border-[#3A4454] bg-[#141922] px-2 py-2 text-xs text-white placeholder:text-[#7d8aa0] focus:border-brand-orange focus:outline-none"
              />
            </label>
          </div>
        </div>
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
