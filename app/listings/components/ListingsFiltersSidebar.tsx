'use client'

import { useState, type ReactNode } from 'react'
import { LISTING_PILLAR_MIN_STEPS, normalizeListingPillarMin, toggleFacetToken } from './listingsClientUtils'

type DealTierFilter = 'all' | 'TOP_DEALS' | 'HOT' | 'GOOD' | 'FAIR' | 'PASS'
type PriceStatusFilter = 'all' | 'priced'
type MaintenanceBandFilter = 'any' | 'light' | 'moderate' | 'heavy' | 'severe'
type EngineTimeFilter = 'any' | 'fresh' | 'mid' | 'approaching' | 'hasHours'

function PillarMinSelectRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (n: number) => void
}) {
  const safe = normalizeListingPillarMin(value)
  return (
    <div className="mb-2 grid min-w-0 grid-cols-1 gap-1 sm:grid-cols-[76px_1fr] sm:items-center sm:gap-2">
      <span
        className="text-[11px] text-[var(--fh-text-dim)]"
        style={{ fontFamily: 'var(--font-dm-sans), system-ui' }}
      >
        {label}
      </span>
      <select
        value={safe}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 max-w-full rounded border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-1.5 py-1.5 text-[11px] text-[var(--fh-text)]"
        style={{ fontFamily: 'var(--font-dm-sans), system-ui' }}
        aria-label={`${label} minimum pillar score`}
      >
        {LISTING_PILLAR_MIN_STEPS.map((n) => (
          <option key={n} value={n}>
            {n === 0 ? 'Any' : `${n}+ minimum`}
          </option>
        ))}
      </select>
    </div>
  )
}

function FilterAccordion({
  title,
  badge,
  open,
  onToggle,
  children,
}: {
  title: string
  badge?: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="mb-2.5 border-b border-[var(--fh-border)] pb-2.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full min-w-0 items-center justify-between gap-2 rounded py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--fh-orange)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fh-bg2)]"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            className="text-sm font-bold uppercase tracking-wide text-[var(--fh-text)]"
            style={{ fontFamily: 'var(--font-barlow-condensed), system-ui' }}
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
        </span>
        <span className="shrink-0 text-sm font-bold leading-none text-[var(--fh-text-muted)]" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? <div className="mt-2 min-w-0 max-w-full">{children}</div> : null}
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
  engineLifeTokens: string[]
  setEngineLifeTokens: (next: string[] | ((prev: string[]) => string[])) => void
  dealPatternTokens: string[]
  setDealPatternTokens: (next: string[] | ((prev: string[]) => string[])) => void
  makeFilter: string
  setMakeFilter: (value: string) => void
  modelFilter: string
  setModelFilter: (value: string) => void
  subModelFilter: string
  setSubModelFilter: (value: string) => void
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
  engineLifeTokens,
  setEngineLifeTokens,
  dealPatternTokens,
  setDealPatternTokens,
  makeFilter,
  setMakeFilter,
  modelFilter,
  setModelFilter,
  subModelFilter,
  setSubModelFilter,
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
  const [accOpen, setAccOpen] = useState(() => ({
    scorePillars:
      normalizeListingPillarMin(pillarMinEngine) > 0 ||
      normalizeListingPillarMin(pillarMinAvionics) > 0 ||
      normalizeListingPillarMin(pillarMinQuality) > 0 ||
      normalizeListingPillarMin(pillarMinMkt) > 0,
    price: minPrice > 0 || maxPrice > 0,
    year: yearMin > 0 || yearMax > 0,
    totalTime: totalTimeMin > 0 || totalTimeMax > 0,
    engineLife: engineLifeTokens.length > 0,
    dealPatterns: dealPatternTokens.length > 0,
    aircraft:
      makeFilter !== 'all' ||
      Boolean(modelFilter) ||
      Boolean(subModelFilter) ||
      dealFilter !== 'all' ||
      priceStatus !== 'all',
    maintenanceRisk: maintenanceBand !== 'any' || engineTime !== 'any' || riskFilter !== 'all',
    trueCost: trueCostMin > 0 || trueCostMax > 0,
  }))

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
      className={`h-fit min-w-0 max-w-full rounded-lg border border-[var(--fh-border)] bg-[var(--fh-bg2)] p-3 ${embedded ? 'border-0 bg-transparent p-0' : ''} ${className}`.trim()}
    >
      {!embedded ? (
        <div className="mb-3 text-sm font-semibold text-[var(--fh-text)]" style={{ fontFamily: 'var(--font-barlow-condensed)' }}>
          Filters
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <FilterAccordion
          title="Score pillars"
          badge="MIN"
          open={accOpen.scorePillars}
          onToggle={() => setAccOpen((p) => ({ ...p, scorePillars: !p.scorePillars }))}
        >
          <PillarMinSelectRow label="Engine" value={pillarMinEngine} onChange={setPillarMinEngine} />
          <PillarMinSelectRow label="Avionics" value={pillarMinAvionics} onChange={setPillarMinAvionics} />
          <PillarMinSelectRow label="Quality" value={pillarMinQuality} onChange={setPillarMinQuality} />
          <PillarMinSelectRow label="Mkt value" value={pillarMinMkt} onChange={setPillarMinMkt} />
        </FilterAccordion>

        <FilterAccordion
          title="Price"
          open={accOpen.price}
          onToggle={() => setAccOpen((p) => ({ ...p, price: !p.price }))}
        >
          <div className="mb-2 grid min-w-0 grid-cols-2 gap-2">
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
        </FilterAccordion>

        <FilterAccordion
          title="Year"
          open={accOpen.year}
          onToggle={() => setAccOpen((p) => ({ ...p, year: !p.year }))}
        >
          <div className="grid min-w-0 grid-cols-2 gap-2">
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
        </FilterAccordion>

        <FilterAccordion
          title="Total time (hrs)"
          open={accOpen.totalTime}
          onToggle={() => setAccOpen((p) => ({ ...p, totalTime: !p.totalTime }))}
        >
          <div className="grid min-w-0 grid-cols-2 gap-2">
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
        </FilterAccordion>

        <FilterAccordion
          title="Engine life"
          open={accOpen.engineLife}
          onToggle={() => setAccOpen((p) => ({ ...p, engineLife: !p.engineLife }))}
        >
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
        </FilterAccordion>

        <FilterAccordion
          title="Deal patterns"
          open={accOpen.dealPatterns}
          onToggle={() => setAccOpen((p) => ({ ...p, dealPatterns: !p.dealPatterns }))}
        >
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
        </FilterAccordion>

        <FilterAccordion
          title="Aircraft"
          open={accOpen.aircraft}
          onToggle={() => setAccOpen((p) => ({ ...p, aircraft: !p.aircraft }))}
        >
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
            Deal type
            <select
              value={dealFilter}
              onChange={(e) => setDealFilter(e.target.value as DealTierFilter)}
              className="mt-1 block w-full rounded border border-[var(--fh-border)] bg-[var(--fh-bg3)] px-2 py-2 text-sm text-[var(--fh-text)]"
            >
              <option value="all">All listings</option>
              <option value="TOP_DEALS">HOT + GOOD (top flips)</option>
              <option value="HOT">HOT — top flip opportunities</option>
              <option value="GOOD">GOOD — solid deals</option>
              <option value="FAIR">FAIR — worth a look</option>
              <option value="PASS">PASS — not competitive</option>
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
        </FilterAccordion>

        <FilterAccordion
          title="Maintenance & risk"
          open={accOpen.maintenanceRisk}
          onToggle={() => setAccOpen((p) => ({ ...p, maintenanceRisk: !p.maintenanceRisk }))}
        >
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
        </FilterAccordion>

        <FilterAccordion
          title="True cost (exact)"
          open={accOpen.trueCost}
          onToggle={() => setAccOpen((p) => ({ ...p, trueCost: !p.trueCost }))}
        >
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
        </FilterAccordion>

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
              className="fh-cta-on-orange-fill rounded border border-[var(--fh-orange)] bg-[var(--fh-orange)] px-3 py-2 text-sm font-bold hover:bg-[var(--fh-orange-burn)]"
            >
              Apply filters
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
