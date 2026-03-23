import type { ReactNode } from 'react'
import { toggleFacetToken } from './listingsClientUtils'

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
type EngineTimeFilter = 'any' | 'fresh' | 'mid' | 'approaching' | 'hasHours'

function SidebarSection({ title, badge, children }: { title: string; badge?: string; children: ReactNode }) {
  return (
    <div className="mb-2.5 border-b border-[var(--fh-border)] px-0 pb-2.5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className="font-bold uppercase tracking-[1.5px] text-[var(--fh-text-muted)]"
          style={{ fontFamily: 'var(--font-barlow-condensed), system-ui', fontSize: '10px' }}
        >
          {title}
        </span>
        {badge ? (
          <span
            className="rounded bg-[var(--fh-orange-dim)] px-1 py-px text-[9px] font-bold text-[var(--fh-orange)]"
            style={{ fontFamily: 'var(--font-dm-sans), monospace' }}
          >
            {badge}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  )
}

function PillarMinRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (n: number) => void
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span
        className="w-[76px] shrink-0 text-[11px] text-[var(--fh-text-dim)]"
        style={{ fontFamily: 'var(--font-dm-sans), system-ui' }}
      >
        {label}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="fh-checkbox-orange h-2 flex-1 accent-[var(--fh-orange)]"
        aria-label={`${label} minimum score`}
      />
      <span
        className="w-8 shrink-0 text-right font-mono text-[9px] text-[var(--fh-text-muted)]"
        style={{ fontFamily: 'var(--font-dm-sans), monospace' }}
      >
        {value > 0 ? value : '—'}
      </span>
    </div>
  )
}

type ListingsFiltersSidebarProps = {
  className?: string
  embedded?: boolean
  /** Phase 2D — score pillar floors (0 = off) */
  pillarMinEngine: number
  setPillarMinEngine: (n: number) => void
  pillarMinAvionics: number
  setPillarMinAvionics: (n: number) => void
  pillarMinQuality: number
  setPillarMinQuality: (n: number) => void
  pillarMinMkt: number
  setPillarMinMkt: (n: number) => void
  locationDraft: string
  setLocationDraft: (s: string) => void
  engineLifeTokens: string[]
  setEngineLifeTokens: (next: string[] | ((prev: string[]) => string[])) => void
  avionicsTokens: string[]
  setAvionicsTokens: (next: string[] | ((prev: string[]) => string[])) => void
  dealPatternTokens: string[]
  setDealPatternTokens: (next: string[] | ((prev: string[]) => string[])) => void
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
  engineTime: EngineTimeFilter
  setEngineTime: (value: EngineTimeFilter) => void
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

const ENGINE_LIFE_OPTS: Array<{ token: string; label: string }> = [
  { token: 'snew', label: 'SNEW / very fresh' },
  { token: 'high', label: '75%+ life' },
  { token: 'mid', label: '50–75% life' },
  { token: 'low', label: '25–50% life' },
  { token: 'neartbo', label: 'Near / over TBO' },
]

const AVIONICS_OPTS: Array<{ token: string; label: string }> = [
  { token: 'glass', label: 'Glass / G1000' },
  { token: 'gtn', label: 'GTN 750/650 family' },
  { token: 'adsb', label: 'ADS-B Out' },
  { token: 'autopilot', label: 'Autopilot' },
  { token: 'steam', label: 'Steam gauge only' },
]

const DEAL_PATTERN_OPTS: Array<{ token: string; label: string }> = [
  { token: 'deferred', label: 'Deferred annual' },
  { token: 'steam', label: 'Steam gauge discount' },
  { token: 'geo', label: 'Geographic arbitrage' },
  { token: 'reduced', label: 'Price reduced' },
  { token: 'longdom', label: 'Long DOM (60+ d)' },
]

export default function ListingsFiltersSidebar({
  className = '',
  embedded = false,
  pillarMinEngine,
  setPillarMinEngine,
  pillarMinAvionics,
  setPillarMinAvionics,
  pillarMinQuality,
  setPillarMinQuality,
  pillarMinMkt,
  setPillarMinMkt,
  locationDraft,
  setLocationDraft,
  engineLifeTokens,
  setEngineLifeTokens,
  avionicsTokens,
  setAvionicsTokens,
  dealPatternTokens,
  setDealPatternTokens,
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
  engineTime,
  setEngineTime,
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

  const applyPricePreset = (lo: number, hi: number) => {
    setMinPrice(lo)
    setMaxPrice(hi)
  }

  return (
    <aside
      className={`h-fit rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg2)] p-3 ${embedded ? 'border-0 bg-transparent p-0' : ''} ${className}`.trim()}
    >
      {!embedded ? (
        <div className="mb-3 text-sm font-semibold text-[var(--fh-text)]" style={{ fontFamily: 'var(--font-barlow-condensed)' }}>
          Filters
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <SidebarSection title="Score pillars" badge="MIN">
          <PillarMinRow label="Engine" value={pillarMinEngine} onChange={setPillarMinEngine} />
          <PillarMinRow label="Avionics" value={pillarMinAvionics} onChange={setPillarMinAvionics} />
          <PillarMinRow label="Quality" value={pillarMinQuality} onChange={setPillarMinQuality} />
          <PillarMinRow label="Mkt value" value={pillarMinMkt} onChange={setPillarMinMkt} />
        </SidebarSection>

        <SidebarSection title="Price">
          <div className="mb-2 grid grid-cols-2 gap-2">
            <label className="text-[10px] text-[var(--fh-text-dim)]" style={{ fontFamily: 'var(--font-dm-sans), monospace' }}>
              $
              <input
                type="text"
                inputMode="numeric"
                value={minPrice > 0 ? String(minPrice) : ''}
                onChange={(e) => setMinPrice(parseNumberInput(e.target.value))}
                placeholder="0"
                className="mt-0.5 block w-full rounded-[5px] border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-2 py-1.5 text-[10px] text-[var(--fh-text)] placeholder:text-[var(--fh-text-muted)]"
              />
            </label>
            <label className="text-[10px] text-[var(--fh-text-dim)]" style={{ fontFamily: 'var(--font-dm-sans), monospace' }}>
              $
              <input
                type="text"
                inputMode="numeric"
                value={maxPrice > 0 ? String(maxPrice) : ''}
                onChange={(e) => setMaxPrice(parseNumberInput(e.target.value))}
                placeholder="Any"
                className="mt-0.5 block w-full rounded-[5px] border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-2 py-1.5 text-[10px] text-[var(--fh-text)] placeholder:text-[var(--fh-text-muted)]"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { label: 'Under $30K', lo: 0, hi: 30_000 },
                { label: '$30–50K', lo: 30_000, hi: 50_000 },
                { label: '$50–100K', lo: 50_000, hi: 100_000 },
                { label: '$100K+', lo: 100_000, hi: 0 },
              ] as const
            ).map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPricePreset(p.lo, p.hi)}
                className="rounded-[10px] border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-2 py-0.5 text-[9px] font-semibold text-[var(--fh-text-dim)] hover:border-[var(--fh-orange)] hover:text-[var(--fh-orange)]"
                style={{ fontFamily: 'var(--font-dm-sans)' }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </SidebarSection>

        <SidebarSection title="Year">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={yearMin > 0 ? String(yearMin) : ''}
              onChange={(e) => setYearMin(parseNumberInput(e.target.value))}
              placeholder="1960"
              className="rounded-[5px] border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-2 py-1.5 text-[10px] text-[var(--fh-text)] placeholder:text-[var(--fh-text-muted)]"
              style={{ fontFamily: 'var(--font-dm-sans), monospace' }}
            />
            <input
              type="text"
              inputMode="numeric"
              value={yearMax > 0 ? String(yearMax) : ''}
              onChange={(e) => setYearMax(parseNumberInput(e.target.value))}
              placeholder="2025"
              className="rounded-[5px] border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-2 py-1.5 text-[10px] text-[var(--fh-text)] placeholder:text-[var(--fh-text-muted)]"
              style={{ fontFamily: 'var(--font-dm-sans), monospace' }}
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <select
              value={yearMin}
              onChange={(e) => setYearMin(Number(e.target.value))}
              className="rounded border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-1 py-1 text-[10px] text-[var(--fh-text)]"
            >
              {yearSteps.map((step) => (
                <option key={`sy-${step}`} value={step}>
                  {step === 0 ? 'Min preset' : String(step)}
                </option>
              ))}
            </select>
            <select
              value={yearMax}
              onChange={(e) => setYearMax(Number(e.target.value))}
              className="rounded border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-1 py-1 text-[10px] text-[var(--fh-text)]"
            >
              {yearSteps.map((step) => (
                <option key={`ey-${step}`} value={step}>
                  {step === 0 ? 'Max preset' : String(step)}
                </option>
              ))}
            </select>
          </div>
        </SidebarSection>

        <SidebarSection title="Total time (hrs)">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={totalTimeMin > 0 ? String(totalTimeMin) : ''}
              onChange={(e) => setTotalTimeMin(parseNumberInput(e.target.value))}
              placeholder="0"
              className="rounded-[5px] border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-2 py-1.5 text-[10px] text-[var(--fh-text)]"
              style={{ fontFamily: 'var(--font-dm-sans), monospace' }}
            />
            <input
              type="text"
              inputMode="numeric"
              value={totalTimeMax > 0 ? String(totalTimeMax) : ''}
              onChange={(e) => setTotalTimeMax(parseNumberInput(e.target.value))}
              placeholder="Any"
              className="rounded-[5px] border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-2 py-1.5 text-[10px] text-[var(--fh-text)]"
              style={{ fontFamily: 'var(--font-dm-sans), monospace' }}
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <select
              value={totalTimeMin}
              onChange={(e) => setTotalTimeMin(Number(e.target.value))}
              className="rounded border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-1 py-1 text-[10px] text-[var(--fh-text)]"
            >
              {totalTimeSteps.map((step) => (
                <option key={`ttmin-${step}`} value={step}>
                  {step === 0 ? 'Min preset' : step.toLocaleString('en-US')}
                </option>
              ))}
            </select>
            <select
              value={totalTimeMax}
              onChange={(e) => setTotalTimeMax(Number(e.target.value))}
              className="rounded border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-1 py-1 text-[10px] text-[var(--fh-text)]"
            >
              {totalTimeSteps.map((step) => (
                <option key={`ttmax-${step}`} value={step}>
                  {step === 0 ? 'Max preset' : step.toLocaleString('en-US')}
                </option>
              ))}
            </select>
          </div>
        </SidebarSection>

        <SidebarSection title="Engine life">
          <div className="space-y-1.5">
            {ENGINE_LIFE_OPTS.map((o) => (
              <label key={o.token} className="flex cursor-pointer items-center gap-2 text-[11px] text-[var(--fh-text-dim)]" style={{ fontFamily: 'var(--font-dm-sans)' }}>
                <input
                  type="checkbox"
                  className="fh-checkbox-orange h-3 w-3 rounded border-[var(--fh-border)]"
                  checked={engineLifeTokens.includes(o.token)}
                  onChange={() => setEngineLifeTokens((prev) => toggleFacetToken(prev, o.token))}
                />
                {o.label}
              </label>
            ))}
          </div>
        </SidebarSection>

        <SidebarSection title="Avionics">
          <div className="space-y-1.5">
            {AVIONICS_OPTS.map((o) => (
              <label key={o.token} className="flex cursor-pointer items-center gap-2 text-[11px] text-[var(--fh-text-dim)]" style={{ fontFamily: 'var(--font-dm-sans)' }}>
                <input
                  type="checkbox"
                  className="fh-checkbox-orange h-3 w-3 rounded border-[var(--fh-border)]"
                  checked={avionicsTokens.includes(o.token)}
                  onChange={() => setAvionicsTokens((prev) => toggleFacetToken(prev, o.token))}
                />
                {o.label}
              </label>
            ))}
          </div>
        </SidebarSection>

        <SidebarSection title="Deal patterns">
          <div className="space-y-1.5">
            {DEAL_PATTERN_OPTS.map((o) => (
              <label key={o.token} className="flex cursor-pointer items-center gap-2 text-[11px] text-[var(--fh-text-dim)]" style={{ fontFamily: 'var(--font-dm-sans)' }}>
                <input
                  type="checkbox"
                  className="fh-checkbox-orange h-3 w-3 rounded border-[var(--fh-border)]"
                  checked={dealPatternTokens.includes(o.token)}
                  onChange={() => setDealPatternTokens((prev) => toggleFacetToken(prev, o.token))}
                />
                {o.label}
              </label>
            ))}
          </div>
        </SidebarSection>

        <SidebarSection title="Location">
          <input
            type="text"
            value={locationDraft}
            onChange={(e) => setLocationDraft(e.target.value)}
            placeholder="City, state, region…"
            className="w-full rounded-[5px] border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-2 py-1.5 text-[10px] text-[var(--fh-text)] placeholder:text-[var(--fh-text-muted)]"
            style={{ fontFamily: 'var(--font-dm-sans), monospace' }}
          />
        </SidebarSection>

        <SidebarSection title="Aircraft & source">
          <label className="mb-2 block text-xs text-[var(--fh-text-dim)]">
            Make
            <select
              value={makeFilter}
              onChange={(e) => {
                setMakeFilter(e.target.value)
                setModelFilter('')
                setSubModelFilter('')
              }}
              className="mt-1 block w-full rounded border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-2 py-2 text-sm text-[var(--fh-text)]"
            >
              <option value="all">All makes</option>
              {makeOptions.map((make) => (
                <option key={make} value={make}>
                  {make}
                </option>
              ))}
            </select>
          </label>
          <label className="mb-2 block text-xs text-[var(--fh-text-dim)]">
            Model
            <select
              value={modelFilter}
              onChange={(e) => {
                setModelFilter(e.target.value)
                setSubModelFilter('')
              }}
              className="mt-1 block w-full rounded border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-2 py-2 text-sm text-[var(--fh-text)]"
            >
              <option value="">{makeFilter === 'all' ? 'Any model family…' : 'Model family…'}</option>
              {modelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
          {modelFilter ? (
            <label className="mb-2 block text-xs text-[var(--fh-text-dim)]">
              Sub model
              <select
                value={subModelFilter}
                onChange={(e) => setSubModelFilter(e.target.value)}
                className="mt-1 block w-full rounded border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-2 py-2 text-sm text-[var(--fh-text)]"
              >
                <option value="">Any sub model…</option>
                {subModelOptions.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="mb-2 block text-xs text-[var(--fh-text-dim)]">
            Source
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as 'all' | ListingSourceKey)}
              className="mt-1 block w-full rounded border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-2 py-2 text-sm text-[var(--fh-text)]"
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
          <label className="mb-2 block text-xs text-[var(--fh-text-dim)]">
            Deal type
            <select
              value={dealFilter}
              onChange={(e) => setDealFilter(e.target.value as DealTierFilter)}
              className="mt-1 block w-full rounded border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-2 py-2 text-sm text-[var(--fh-text)]"
            >
              <option value="all">All deals</option>
              <option value="TOP_DEALS">Exceptional + good</option>
              <option value="EXCEPTIONAL_DEAL">Exceptional</option>
              <option value="GOOD_DEAL">Good</option>
              <option value="FAIR_MARKET">Fair market</option>
              <option value="ABOVE_MARKET">Above market</option>
              <option value="OVERPRICED">Overpriced</option>
            </select>
          </label>
          <label className="mb-2 block text-xs text-[var(--fh-text-dim)]">
            Price status
            <select
              value={priceStatus}
              onChange={(e) => setPriceStatus(e.target.value as PriceStatusFilter)}
              className="mt-1 block w-full rounded border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-2 py-2 text-sm text-[var(--fh-text)]"
            >
              <option value="all">All listings</option>
              <option value="priced">Priced only</option>
            </select>
          </label>
        </SidebarSection>

        <SidebarSection title="Maintenance & risk">
          <label className="mb-2 block text-xs text-[var(--fh-text-dim)]">
            Maintenance burden
            <select
              value={maintenanceBand}
              onChange={(e) => setMaintenanceBand(e.target.value as MaintenanceBandFilter)}
              className="mt-1 block w-full rounded border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-2 py-2 text-sm text-[var(--fh-text)]"
            >
              <option value="any">Any</option>
              <option value="light">Light (&lt;= $25k deferred)</option>
              <option value="moderate">Moderate ($25k – $100k)</option>
              <option value="heavy">Heavy ($100k – $250k)</option>
              <option value="severe">Severe (&gt; $250k)</option>
            </select>
          </label>
          <label className="mb-2 block text-xs text-[var(--fh-text-dim)]">
            Legacy engine time (single)
            <select
              value={engineTime}
              onChange={(e) => setEngineTime(e.target.value as EngineTimeFilter)}
              className="mt-1 block w-full rounded border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-2 py-2 text-sm text-[var(--fh-text)]"
            >
              <option value="any">Any (use Engine life checkboxes above)</option>
              <option value="fresh">Fresh (75%+)</option>
              <option value="mid">Mid-life (50–75%)</option>
              <option value="approaching">Approaching TBO</option>
              <option value="hasHours">Has engine hours</option>
            </select>
          </label>
          <label className="mb-2 block text-xs text-[var(--fh-text-dim)]">
            Risk level
            {riskTooltip}
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="mt-1 block w-full rounded border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-2 py-2 text-sm text-[var(--fh-text)]"
            >
              <option value="all">All</option>
              <option value="low">Low</option>
              <option value="moderate">Moderate</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
        </SidebarSection>

        <SidebarSection title="True cost (exact)">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={trueCostMin > 0 ? String(trueCostMin) : ''}
              onChange={(e) => setTrueCostMin(parseNumberInput(e.target.value))}
              placeholder="Min"
              className="rounded border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-2 py-1.5 text-[10px] text-[var(--fh-text)]"
            />
            <input
              type="text"
              inputMode="numeric"
              value={trueCostMax > 0 ? String(trueCostMax) : ''}
              onChange={(e) => setTrueCostMax(parseNumberInput(e.target.value))}
              placeholder="Max"
              className="rounded border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-2 py-1.5 text-[10px] text-[var(--fh-text)]"
            />
          </div>
        </SidebarSection>

        {embedded ? null : (
          <div className="mt-2 flex flex-col gap-2 px-0">
            <button
              type="button"
              onClick={onResetFilters}
              className="rounded border border-[var(--fh-border)] bg-transparent px-3 py-2 text-sm text-[var(--fh-text-dim)] hover:border-[var(--fh-orange)] hover:text-[var(--fh-orange)]"
            >
              Reset filters
            </button>
            <button
              type="button"
              onClick={onApplyFilters}
              className="rounded border border-[var(--fh-orange)] bg-[var(--fh-orange)] px-3 py-2 text-sm font-bold text-black hover:bg-[var(--fh-orange-burn)] hover:text-white"
            >
              Apply filters
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
