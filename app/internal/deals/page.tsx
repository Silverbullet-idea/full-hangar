'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createClient } from '@supabase/supabase-js'
import DealsControlsBar from './components/DealsControlsBar'
import DealsFiltersPanel from './components/DealsFiltersPanel'
import DealsTable from './components/DealsTable'
import RecentSalesPanel from './components/RecentSalesPanel'
import TopStatsRow from './components/TopStatsRow'
import type { DealListing, PresetKey, RecentSoldRecord, SortKey, WatchlistEntry } from './types'

const WATCHLIST_KEY = 'watchlist'
const DEALS_ACTIVE_TAB_KEY = 'internal_deals_active_tab'
const DEALS_SORT_KEY = 'internal_deals_sort'
const DEALS_PRESET_KEY = 'internal_deals_preset'
const NAV_LOADING_START_EVENT = 'fullhangar:navigation-loading-start'
const NAV_LOADING_END_EVENT = 'fullhangar:navigation-loading-end'
const DEAL_TIERS = ['HOT', 'GOOD', 'FAIR', 'PASS'] as const
const DEFAULT_TIERS = new Set(DEAL_TIERS)
const DEFAULT_MAX_PRICE = 2000000
const DEALS_PRICE_FILTER = `asking_price.lte.${DEFAULT_MAX_PRICE},asking_price.is.null`
const DEALS_FALLBACK_COLUMNS_WITH_ENGINE =
  'id,source_id,year,make,model,asking_price,flip_score,flip_tier,vs_median_price,total_time_airframe,time_since_overhaul,avionics_score,avionics_installed_value,location_city,location_state,location_label,days_on_market,price_reduced,price_reduction_amount,faa_registration_alert,url,n_number,deferred_total,description,description_full,risk_level,deal_comparison_source,created_at,scraped_at,listing_date,updated_at,engine_hours_smoh,engine_tbo_hours,ev_hours_smoh,ev_tbo_hours,ev_hours_remaining,ev_pct_life_remaining,ev_engine_overrun_liability,ev_engine_reserve_per_hour,ev_data_quality'
const DEALS_FALLBACK_COLUMNS_BASE =
  'id,source_id,year,make,model,asking_price,flip_score,flip_tier,vs_median_price,total_time_airframe,time_since_overhaul,avionics_score,avionics_installed_value,location_city,location_state,location_label,days_on_market,price_reduced,price_reduction_amount,faa_registration_alert,url,n_number,deferred_total,description,description_full,risk_level,deal_comparison_source,created_at,scraped_at,listing_date,updated_at'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

function buildDealsListingQuery(selectColumns: string | null) {
  const query = supabase
    .from('public_listings')
    .select(selectColumns ?? '*')
    .or(DEALS_PRICE_FILTER)
    .order('flip_score', { ascending: false, nullsFirst: false })
    .limit(2500)
  return query
}

function preferText(primary: string | null | undefined, fallback: string | null | undefined): string | null | undefined {
  const normalizedPrimary = (primary ?? '').trim()
  if (normalizedPrimary.length > 0) return primary
  return fallback
}

function withTimeout<T>(promiseLike: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`))
    }, ms)

    Promise.resolve(promiseLike)
      .then((value) => {
        window.clearTimeout(timeoutId)
        resolve(value)
      })
      .catch((error) => {
        window.clearTimeout(timeoutId)
        reject(error)
      })
  })
}

const startNavigationLoading = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(NAV_LOADING_START_EVENT))
  }
}

const endNavigationLoading = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(NAV_LOADING_END_EVENT))
  }
}

export default function InternalDealsPage() {
  const [rows, setRows] = useState<DealListing[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'all' | 'priority' | 'watchlist'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [maxPrice, setMaxPrice] = useState(DEFAULT_MAX_PRICE)
  const [selectedTiers, setSelectedTiers] = useState<Set<string>>(new Set(DEFAULT_TIERS))
  const [selectedMakes, setSelectedMakes] = useState<string[]>([])
  const [minAvionicsScore, setMinAvionicsScore] = useState(0)
  const [excludeNoPrice, setExcludeNoPrice] = useState(false)
  const [hasNNumberOnly, setHasNNumberOnly] = useState(false)
  const [faaAlertsOnly, setFaaAlertsOnly] = useState(false)
  const [highPriorityOnly, setHighPriorityOnly] = useState(false)
  const [engineFreshOnly, setEngineFreshOnly] = useState(false)
  const [engineMidOnly, setEngineMidOnly] = useState(false)
  const [engineApproachingOnly, setEngineApproachingOnly] = useState(false)
  const [engineOverrunOnly, setEngineOverrunOnly] = useState(false)
  const [hasEngineDataOnly, setHasEngineDataOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('flip_score')
  const [activePreset, setActivePreset] = useState<PresetKey>('none')
  const [watchlist, setWatchlist] = useState<Record<string, WatchlistEntry>>({})
  const [recentSales, setRecentSales] = useState<RecentSoldRecord[]>([])
  const [recentSalesLoading, setRecentSalesLoading] = useState(true)
  const [didAutoRelaxFilters, setDidAutoRelaxFilters] = useState(false)

  useEffect(() => {
    const raw = localStorage.getItem(WATCHLIST_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        setWatchlist(parsed)
      }
    } catch {
      // Ignore malformed localStorage values.
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist))
  }, [watchlist])

  useEffect(() => {
    const raw = localStorage.getItem(DEALS_ACTIVE_TAB_KEY)
    if (raw === 'all' || raw === 'priority' || raw === 'watchlist') {
      setActiveTab(raw)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(DEALS_ACTIVE_TAB_KEY, activeTab)
    setExpandedId(null)
  }, [activeTab])

  useEffect(() => {
    const raw = localStorage.getItem(DEALS_SORT_KEY)
    if (
      raw === 'flip_score' ||
      raw === 'deal_rating' ||
      raw === 'vs_median_price' ||
      raw === 'days_on_market' ||
      raw === 'price_reduction_amount' ||
      raw === 'component_gap_value' ||
      raw === 'engine_life_desc' ||
      raw === 'engine_life_asc'
    ) {
      setSortKey(raw === 'deal_rating' ? 'flip_score' : (raw as SortKey))
    }
    const presetRaw = localStorage.getItem(DEALS_PRESET_KEY)
    if (presetRaw === 'none' || presetRaw === 'flip_fast' || presetRaw === 'motivated_sellers' || presetRaw === 'price_call_followup') {
      setActivePreset(presetRaw)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(DEALS_SORT_KEY, sortKey)
  }, [sortKey])

  useEffect(() => {
    localStorage.setItem(DEALS_PRESET_KEY, activePreset)
  }, [activePreset])

  useEffect(() => {
    ;(async () => {
      try {
        startNavigationLoading()
        let baseRows: DealListing[] = []
        try {
          const apiResponse = await withTimeout(
            fetch('/api/listings?page=1&pageSize=2500&sortBy=flip_desc'),
            12000,
            'internal deals api listings fallback fetch'
          )
          if (apiResponse.ok) {
            const payload = await apiResponse.json()
            const rows = Array.isArray(payload?.data) ? (payload.data as DealListing[]) : []
            if (rows.length > 0) {
              baseRows = rows
            }
          }
        } catch (apiFallbackError) {
          console.warn('Internal deals API fallback fetch failed; continuing with direct public_listings query', apiFallbackError)
        }

        const runDealsQuery = async (selectColumns: string | null, label: string) =>
          withTimeout(
            buildDealsListingQuery(selectColumns) as unknown as Promise<{ data: DealListing[] | null; error: unknown }>,
            12000,
            label
          )

        if (baseRows.length === 0) {
          let listingResult = await runDealsQuery(null, 'internal deals listing query')
          if (listingResult.error) {
            console.warn('Primary internal deals query failed; retrying with explicit columns + engine fields', listingResult.error)
            listingResult = await runDealsQuery(
              DEALS_FALLBACK_COLUMNS_WITH_ENGINE,
              'internal deals fallback query with engine fields'
            )
          }
          if (listingResult.error) {
            console.warn('Engine-field fallback failed; retrying with conservative columns', listingResult.error)
            listingResult = await runDealsQuery(
              DEALS_FALLBACK_COLUMNS_BASE,
              'internal deals conservative fallback query'
            )
          }
          if (listingResult.error) {
            console.error('Failed to load internal deals:', listingResult.error)
            return
          }
          baseRows = (listingResult.data ?? []) as DealListing[]
        }

        if (baseRows.length === 0) {
          setRows(baseRows)
          return
        }

        const idParam = baseRows.map((row) => row.id).filter(Boolean).join(',')
        try {
          const response = await withTimeout(
            fetch(`/api/internal/deal-signals?ids=${encodeURIComponent(idParam)}`),
            10000,
            'internal deal signals fetch'
          )
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const payload = await response.json()
          const signalRows = Array.isArray(payload?.data) ? (payload.data as DealListing[]) : []
          const signalById = new Map(signalRows.map((row) => [String(row.id), row]))
          const merged = baseRows.map((row) => {
            const signal = signalById.get(String(row.id))
            if (!signal) return row
            return {
              ...row,
              ...signal,
              make: preferText(signal.make, row.make),
              model: preferText(signal.model, row.model),
              year: signal.year ?? row.year,
              listing_url: preferText(signal.listing_url, row.listing_url),
              url: preferText(signal.url, row.url),
            }
          })
          setRows(merged)
        } catch (signalError) {
          console.error('Failed to load internal deal signals:', signalError)
          setRows(baseRows)
        }
      } finally {
        setLoading(false)
        endNavigationLoading()
      }
    })()
  }, [])

  useEffect(() => {
    startNavigationLoading()
    withTimeout(fetch('/api/internal/recent-sales?days=30&limit=20'), 10000, 'recent sales fetch')
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const payload = await response.json()
        const rows = Array.isArray(payload?.data) ? (payload.data as RecentSoldRecord[]) : []
        setRecentSales(rows)
      })
      .catch((error) => {
        console.error('Failed to load recent ownership sales:', error)
        setRecentSales([])
      })
      .finally(() => {
        setRecentSalesLoading(false)
        endNavigationLoading()
      })
  }, [])

  const baseUnder50k = useMemo(() => {
    return rows.filter((row) => {
      const price = getAskingPrice(row)
      return price == null || price < 50000
    })
  }, [rows])

  const makeOptions = useMemo(() => {
    return Array.from(new Set(baseUnder50k.map((row) => normalizeText(row.make)).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  }, [baseUnder50k])

  const filteredRows = useMemo(() => {
    return rows
      .filter((row) => {
        const price = getAskingPrice(row)
        if (excludeNoPrice && price == null) return false
        if (price != null && price > maxPrice) return false

        const tier = effectiveFlipTierForFilter(row)
        if (selectedTiers.size > 0 && !selectedTiers.has(tier)) return false

        const normalizedMake = normalizeText(row.make)
        if (selectedMakes.length > 0 && (!normalizedMake || !selectedMakes.includes(normalizedMake))) return false

        const avionicsScore = row.avionics_score ?? 0
        if (avionicsScore < minAvionicsScore) return false

        if (hasNNumberOnly && !normalizeText(row.n_number)) return false
        if (faaAlertsOnly && !normalizeText(row.faa_registration_alert)) return false
        if (highPriorityOnly && !isHighPriorityDeal(row)) return false
        const lifePct = getEngineLifePct(row)
        const overrun = getEngineOverrunLiability(row)
        const engineConditions: boolean[] = []
        if (engineFreshOnly) engineConditions.push(typeof lifePct === 'number' && lifePct >= 0.75)
        if (engineMidOnly) engineConditions.push(typeof lifePct === 'number' && lifePct >= 0.5 && lifePct < 0.75)
        if (engineApproachingOnly) engineConditions.push(typeof lifePct === 'number' && lifePct < 0.5)
        if (engineOverrunOnly) engineConditions.push(overrun > 0)
        if (hasEngineDataOnly) engineConditions.push(hasEngineData(row))
        if (engineConditions.length > 0 && !engineConditions.some(Boolean)) return false

        return true
      })
      .sort((a, b) => compareDeals(a, b, sortKey))
  }, [rows, excludeNoPrice, faaAlertsOnly, hasNNumberOnly, highPriorityOnly, maxPrice, minAvionicsScore, selectedMakes, selectedTiers, sortKey, engineFreshOnly, engineMidOnly, engineApproachingOnly, engineOverrunOnly, hasEngineDataOnly])

  const watchlistRows = useMemo(() => {
    return rows.filter((row) => Boolean(watchlist[row.id])).sort((a, b) => compareDeals(a, b, sortKey))
  }, [rows, watchlist, sortKey])

  const priorityRows = useMemo(() => {
    return filteredRows.filter((row) => isHighPriorityDeal(row))
  }, [filteredRows])

  const displayedRows = activeTab === 'watchlist' ? watchlistRows : activeTab === 'priority' ? priorityRows : filteredRows

  useEffect(() => {
    // QA-safety: if data exists but current filters produce zero rows, auto-relax once.
    if (didAutoRelaxFilters) return
    if (rows.length === 0 || filteredRows.length > 0) return
    if (activeTab === 'watchlist') return
    setMaxPrice(DEFAULT_MAX_PRICE)
    setSelectedTiers(new Set(DEFAULT_TIERS))
    setSelectedMakes([])
    setMinAvionicsScore(0)
    setExcludeNoPrice(false)
    setHasNNumberOnly(false)
    setFaaAlertsOnly(false)
    setHighPriorityOnly(false)
    setEngineFreshOnly(false)
    setEngineMidOnly(false)
    setEngineApproachingOnly(false)
    setEngineOverrunOnly(false)
    setHasEngineDataOnly(false)
    setSortKey('flip_score')
    setActiveTab('all')
    setActivePreset('none')
    setDidAutoRelaxFilters(true)
  }, [activeTab, didAutoRelaxFilters, filteredRows.length, rows.length])

  const topStats = useMemo(() => {
    const hotTierCount = baseUnder50k.filter((row) => effectiveFlipTierForFilter(row) === 'HOT').length
    const withTimestamp = baseUnder50k
      .map((row) => extractTimestamp(row))
      .filter((value): value is number => typeof value === 'number')
    const avgDays =
      withTimestamp.length === 0
        ? null
        : withTimestamp.reduce((sum, timestamp) => sum + (Date.now() - timestamp) / (1000 * 60 * 60 * 24), 0) / withTimestamp.length
    const makesWithComps = new Set(
      baseUnder50k
        .filter((row) => (row.comps_sample_size ?? 0) >= 10)
        .map((row) => normalizeText(row.make))
        .filter(Boolean)
    )
    const highPriorityCount = baseUnder50k.filter((row) => isHighPriorityDeal(row)).length
    return {
      total: baseUnder50k.length,
      hotTierCount,
      avgDays,
      makesWithComps: makesWithComps.size,
      highPriorityCount,
    }
  }, [baseUnder50k])

  const toggleTier = (tier: string) => {
    setSelectedTiers((previous) => {
      const next = new Set(previous)
      if (next.has(tier)) next.delete(tier)
      else next.add(tier)
      return next
    })
  }

  const toggleWatch = (id: string) => {
    setWatchlist((previous) => {
      const next = { ...previous }
      if (next[id]) {
        delete next[id]
      } else {
        next[id] = { note: '' }
      }
      return next
    })
  }

  const updateWatchNote = (id: string, note: string) => {
    setWatchlist((previous) => {
      if (!previous[id]) return previous
      return { ...previous, [id]: { note } }
    })
  }

  const applyPreset = (preset: PresetKey) => {
    setActivePreset(preset)
    if (preset === 'flip_fast') {
      setMaxPrice(50000)
      setSelectedTiers(new Set(['HOT', 'GOOD']))
      setSelectedMakes([])
      setMinAvionicsScore(20)
      setExcludeNoPrice(true)
      setHasNNumberOnly(true)
      setFaaAlertsOnly(false)
      setHighPriorityOnly(false)
      setEngineFreshOnly(false)
      setEngineMidOnly(false)
      setEngineApproachingOnly(false)
      setEngineOverrunOnly(false)
      setHasEngineDataOnly(false)
      setSortKey('flip_score')
      return
    }
    if (preset === 'motivated_sellers') {
      setMaxPrice(60000)
      setSelectedTiers(new Set(DEAL_TIERS))
      setSelectedMakes([])
      setMinAvionicsScore(0)
      setExcludeNoPrice(false)
      setHasNNumberOnly(false)
      setFaaAlertsOnly(false)
      setHighPriorityOnly(true)
      setEngineFreshOnly(false)
      setEngineMidOnly(false)
      setEngineApproachingOnly(false)
      setEngineOverrunOnly(false)
      setHasEngineDataOnly(false)
      setSortKey('days_on_market')
      return
    }
    if (preset === 'price_call_followup') {
      setMaxPrice(60000)
      setSelectedTiers(new Set(DEAL_TIERS))
      setSelectedMakes([])
      setMinAvionicsScore(0)
      setExcludeNoPrice(false)
      setHasNNumberOnly(false)
      setFaaAlertsOnly(false)
      setHighPriorityOnly(false)
      setEngineFreshOnly(false)
      setEngineMidOnly(false)
      setEngineApproachingOnly(false)
      setEngineOverrunOnly(false)
      setHasEngineDataOnly(false)
      setSortKey('price_reduction_amount')
      return
    }

    setMaxPrice(DEFAULT_MAX_PRICE)
    setSelectedTiers(new Set(DEFAULT_TIERS))
    setSelectedMakes([])
    setMinAvionicsScore(0)
    setExcludeNoPrice(false)
    setHasNNumberOnly(false)
    setFaaAlertsOnly(false)
    setHighPriorityOnly(false)
    setEngineFreshOnly(false)
    setEngineMidOnly(false)
    setEngineApproachingOnly(false)
    setEngineOverrunOnly(false)
    setHasEngineDataOnly(false)
    setSortKey('flip_score')
  }

  if (loading) {
    return <div className="text-sm text-brand-muted">Loading internal deals dashboard...</div>
  }

  return (
    <div className="space-y-3">
      <TopStatsRow topStats={topStats} />
      <RecentSalesPanel
        recentSalesLoading={recentSalesLoading}
        recentSales={recentSales}
        normalizeText={normalizeText}
        formatIsoDate={formatIsoDate}
      />
      <div className="rounded border border-brand-dark bg-[#131313] p-2">
        <DealsControlsBar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          filteredCount={filteredRows.length}
          priorityCount={priorityRows.length}
          watchlistCount={watchlistRows.length}
          sortKey={sortKey}
          setSortKey={setSortKey}
          activePreset={activePreset}
          applyPreset={applyPreset}
        />
        <DealsFiltersPanel
          maxPrice={maxPrice}
          setMaxPrice={setMaxPrice}
          selectedTiers={selectedTiers}
          toggleTier={toggleTier}
          selectedMakes={selectedMakes}
          setSelectedMakes={setSelectedMakes}
          makeOptions={makeOptions}
          minAvionicsScore={minAvionicsScore}
          setMinAvionicsScore={setMinAvionicsScore}
          excludeNoPrice={excludeNoPrice}
          setExcludeNoPrice={setExcludeNoPrice}
          hasNNumberOnly={hasNNumberOnly}
          setHasNNumberOnly={setHasNNumberOnly}
          faaAlertsOnly={faaAlertsOnly}
          setFaaAlertsOnly={setFaaAlertsOnly}
          highPriorityOnly={highPriorityOnly}
          setHighPriorityOnly={setHighPriorityOnly}
          engineFreshOnly={engineFreshOnly}
          setEngineFreshOnly={setEngineFreshOnly}
          engineMidOnly={engineMidOnly}
          setEngineMidOnly={setEngineMidOnly}
          engineApproachingOnly={engineApproachingOnly}
          setEngineApproachingOnly={setEngineApproachingOnly}
          engineOverrunOnly={engineOverrunOnly}
          setEngineOverrunOnly={setEngineOverrunOnly}
          hasEngineDataOnly={hasEngineDataOnly}
          setHasEngineDataOnly={setHasEngineDataOnly}
          toTierBadgeText={toTierBadgeText}
        />
      </div>
      <DealsTable
        displayedRows={displayedRows}
        expandedId={expandedId}
        setExpandedId={setExpandedId}
        watchlist={watchlist}
        toggleWatch={toggleWatch}
        updateWatchNote={updateWatchNote}
        buildDealExplanation={buildDealExplanation}
        dealScoreColor={dealScoreColor}
        formatScore={formatScore}
        normalizeTier={normalizeTier}
        toTierBadgeText={toTierBadgeText}
        tierBadgeClass={tierBadgeClass}
        aircraftName={aircraftName}
        formatPrice={formatPrice}
        formatVsMarket={formatVsMarket}
        formatComponentGap={formatComponentGap}
        formatInteger={formatInteger}
        formatLocation={formatLocation}
        daysListedClass={daysListedClass}
        formatDaysListed={formatDaysListed}
        isHighPriorityDeal={isHighPriorityDeal}
        sortKey={sortKey}
        setSortKey={setSortKey}
      />

      {displayedRows.length === 0 ? (
        <div className="rounded border border-brand-dark bg-[#131313] p-4 text-sm text-brand-muted">
          {activeTab === 'watchlist'
            ? 'No watchlisted aircraft yet.'
            : activeTab === 'priority'
            ? 'No high-priority listings match your current filters.'
            : 'No listings match your filter combination.'}
        </div>
      ) : null}
    </div>
  )
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim()
}

function normalizeTier(value: string | null | undefined): string {
  const u = (value ?? '').trim().toUpperCase()
  if (u === 'HOT' || u === 'GOOD' || u === 'FAIR' || u === 'PASS') return u
  if (u === 'EXCEPTIONAL_DEAL' || u === 'EXCEPTIONAL') return 'HOT'
  if (u === 'GOOD_DEAL') return 'GOOD'
  if (u === 'FAIR_MARKET') return 'FAIR'
  if (u === 'ABOVE_MARKET' || u === 'OVERPRICED' || u === 'WEAK' || u === 'POOR') return 'PASS'
  return 'PASS'
}

function effectiveFlipTierForFilter(row: DealListing): string {
  const price = getAskingPrice(row)
  if (price == null || price <= 0) return 'PASS'
  return normalizeTier(row.flip_tier ?? row.deal_tier ?? null)
}

function toTierBadgeText(tier: string): string {
  return tier
}

function tierBadgeClass(tier: string): string {
  if (tier === 'HOT') return 'bg-orange-600 text-white'
  if (tier === 'GOOD') return 'bg-emerald-800 text-emerald-100'
  if (tier === 'FAIR') return 'bg-amber-800 text-amber-100'
  return 'bg-slate-700 text-slate-200'
}

function getAskingPrice(row: DealListing): number | null {
  const price = row.asking_price ?? row.price_asking
  return typeof price === 'number' ? price : null
}

function getEngineLifePct(row: DealListing): number | null {
  const pct = row.ev_pct_life_remaining
  if (typeof pct === 'number' && Number.isFinite(pct)) {
    return Math.max(0, Math.min(1, pct))
  }
  const smohCandidate = row.ev_hours_smoh ?? row.engine_hours_smoh ?? row.time_since_overhaul
  const tboCandidate = row.ev_tbo_hours ?? row.engine_tbo_hours
  if (
    typeof smohCandidate === 'number' &&
    Number.isFinite(smohCandidate) &&
    typeof tboCandidate === 'number' &&
    Number.isFinite(tboCandidate) &&
    tboCandidate > 0
  ) {
    return Math.max(0, Math.min(1, (tboCandidate - smohCandidate) / tboCandidate))
  }
  return null
}

function getEngineOverrunLiability(row: DealListing): number {
  const overrun = row.ev_engine_overrun_liability
  return typeof overrun === 'number' && overrun > 0 ? overrun : 0
}

function hasEngineData(row: DealListing): boolean {
  return typeof row.ev_hours_smoh === 'number' || typeof row.time_since_overhaul === 'number'
}

function getDeferredTotal(row: DealListing): number | null {
  const base = typeof row.deferred_total === 'number' ? row.deferred_total : null
  const overrun = getEngineOverrunLiability(row)
  if (base === null && overrun <= 0) return null
  return (base ?? 0) + overrun
}

function formatScore(value: number | null): string {
  if (typeof value !== 'number') return '--'
  return Math.round(value).toString()
}

function dealScoreColor(value: number | null): string {
  if (value == null) return 'text-[#777]'
  if (value >= 80) return 'text-emerald-400'
  if (value >= 65) return 'text-brand-orange'
  if (value >= 45) return 'text-amber-400'
  return 'text-red-400'
}

function formatInteger(value: number | null): string {
  if (typeof value !== 'number') return '—'
  return Math.round(value).toLocaleString()
}

function aircraftName(row: DealListing): string {
  const built = [row.year, row.make, row.model].filter((part) => part !== null && part !== undefined && part !== '').join(' ')
  return built || 'Unknown Aircraft'
}

function formatPrice(row: DealListing): string {
  const price = getAskingPrice(row)
  if (price == null) return 'CALL'
  return `$${Math.round(price).toLocaleString()}`
}

function formatVsMarket(vsMedianPrice: number | null): ReactNode {
  if (typeof vsMedianPrice !== 'number') return <span className="text-[#777]">N/A</span>
  if (vsMedianPrice < 0) {
    return (
      <span className="font-semibold text-emerald-400">+{Math.abs(Math.round(vsMedianPrice))}% below median</span>
    )
  }
  return <span className="font-semibold text-red-400">-{Math.round(vsMedianPrice)}% above median</span>
}

function formatLocation(row: DealListing): string {
  if (normalizeText(row.location_label)) return normalizeText(row.location_label)
  const parts = [normalizeText(row.location_city), normalizeText(row.location_state)].filter(Boolean)
  return parts.length ? parts.join(', ') : 'Unknown'
}

function formatDaysListed(value: number | null): string {
  if (typeof value !== 'number') return 'Unknown'
  return `${Math.max(0, Math.round(value))} days`
}

function daysListedClass(value: number | null): string {
  if (typeof value !== 'number') return 'bg-[#252525] text-brand-muted'
  if (value < 14) return 'bg-emerald-900 text-emerald-100'
  if (value < 60) return 'bg-yellow-900 text-yellow-100'
  if (value < 90) return 'bg-orange-900 text-orange-100'
  return 'bg-red-900 text-red-100'
}

function formatIsoDate(value: string | null | undefined): string {
  if (!value) return 'Unknown'
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return value
  const date = new Date(timestamp)
  return date.toISOString().slice(0, 10)
}

function isHighPriorityDeal(row: DealListing): boolean {
  const daysOnMarket = typeof row.days_on_market === 'number' ? row.days_on_market : null
  const gap = typeof row.component_gap_value === 'number' ? row.component_gap_value : null
  const trigger = row.flip_candidate_triggered === true
  return trigger || row.price_reduced === true || (daysOnMarket != null && daysOnMarket >= 90) || (gap != null && gap >= 10000)
}

function priorityRank(row: DealListing): number {
  const daysOnMarket = typeof row.days_on_market === 'number' ? row.days_on_market : 0
  const reducedBoost = row.price_reduced ? 1000 : 0
  const staleBoost = daysOnMarket >= 90 ? 500 : 0
  return reducedBoost + staleBoost + Math.min(365, Math.max(0, Math.round(daysOnMarket)))
}

function compareDeals(a: DealListing, b: DealListing, sortKey: SortKey): number {
  if (sortKey === 'flip_score') {
    const aFlip = typeof a.flip_score === 'number' ? a.flip_score : -1
    const bFlip = typeof b.flip_score === 'number' ? b.flip_score : -1
    if (aFlip !== bFlip) return bFlip - aFlip
  }
  if (sortKey === 'vs_median_price') {
    const aVs = a.vs_median_price ?? Number.POSITIVE_INFINITY
    const bVs = b.vs_median_price ?? Number.POSITIVE_INFINITY
    if (aVs !== bVs) return aVs - bVs
  }
  if (sortKey === 'days_on_market') {
    const aDays = a.days_on_market ?? -1
    const bDays = b.days_on_market ?? -1
    if (aDays !== bDays) return bDays - aDays
  }
  if (sortKey === 'price_reduction_amount') {
    const aReduction = a.price_reduction_amount ?? -1
    const bReduction = b.price_reduction_amount ?? -1
    if (aReduction !== bReduction) return bReduction - aReduction
  }
  if (sortKey === 'component_gap_value') {
    const aGap = a.component_gap_value ?? Number.NEGATIVE_INFINITY
    const bGap = b.component_gap_value ?? Number.NEGATIVE_INFINITY
    if (aGap !== bGap) return bGap - aGap
  }
  if (sortKey === 'engine_life_desc' || sortKey === 'engine_life_asc') {
    const aLife = getEngineLifePct(a)
    const bLife = getEngineLifePct(b)
    const aRank = aLife === null ? Number.NEGATIVE_INFINITY : aLife
    const bRank = bLife === null ? Number.NEGATIVE_INFINITY : bLife
    if (aRank !== bRank) return sortKey === 'engine_life_desc' ? bRank - aRank : aRank - bRank
  }

  const priorityDelta = priorityRank(b) - priorityRank(a)
  if (priorityDelta !== 0) return priorityDelta
  const aFlip = typeof a.flip_score === 'number' ? a.flip_score : -1
  const bFlip = typeof b.flip_score === 'number' ? b.flip_score : -1
  return bFlip - aFlip
}

function extractTimestamp(row: DealListing): number | null {
  const candidates = [row.scraped_at, row.created_at, row.listing_date, row.updated_at]
  for (const candidate of candidates) {
    if (!candidate) continue
    const timestamp = Date.parse(candidate)
    if (Number.isFinite(timestamp)) return timestamp
  }
  return null
}

function buildDealExplanation(row: DealListing) {
  const price = getAskingPrice(row)
  const vsMedian = row.vs_median_price
  const smoh = row.time_since_overhaul
  const comps = row.comps_sample_size ?? null
  const comparisonSource = normalizeText(row.deal_comparison_source).toLowerCase()
  const alert = normalizeText(row.faa_registration_alert)
  const risk = normalizeText(row.risk_level).toUpperCase() || 'MODERATE'
  const descriptionText = `${row.description ?? ''} ${row.description_full ?? ''}`.toLowerCase()
  const annualCurrent = descriptionText.includes('annual') && (descriptionText.includes('current') || descriptionText.includes('fresh'))
  const componentGap = typeof row.component_gap_value === 'number' ? row.component_gap_value : null
  const engineOverrun = getEngineOverrunLiability(row)
  const deferredTotal = getDeferredTotal(row)

  let priceLine = 'Price: CALL — insufficient pricing data'
  if (price != null && typeof vsMedian === 'number') {
    const ratio = 1 + vsMedian / 100
    const median = ratio !== 0 ? Math.round(price / ratio) : null
    const direction = vsMedian < 0 ? `${Math.abs(Math.round(vsMedian))}% below` : `${Math.round(vsMedian)}% above`
    const sourceLabel =
      comparisonSource === 'estimated baseline'
        ? 'estimated baseline'
        : comparisonSource === 'live market comps'
        ? 'live market comps'
        : 'market reference'
    priceLine = `Price: $${Math.round(price).toLocaleString()} — ${direction} median ${median ? `$${median.toLocaleString()}` : 'N/A'} for ${row.model ?? 'type'}${comps ? ` (n=${comps})` : ''} [${sourceLabel}]`
  } else if (price != null) {
    priceLine = `Price: $${Math.round(price).toLocaleString()} — market median unavailable`
  }

  let engineLine = 'Engine: SMOH unknown — verify logs and overhaul history'
  if (typeof smoh === 'number') {
    const baselineMedian = 890
    const freshnessPct = Math.max(5, Math.min(95, Math.round(((baselineMedian - smoh) / baselineMedian) * 50 + 50)))
    engineLine = `Engine: ${Math.round(smoh).toLocaleString()} SMOH vs median ${baselineMedian.toLocaleString()} SMOH — fresher than ${freshnessPct}% of comps`
  }

  const avionicsLine =
    (row.avionics_score ?? 0) < 40
      ? `Avionics: Steam gauges profile — upgrade potential to $${Math.max(12000, Math.round((row.avionics_installed_value ?? 0) + 6000)).toLocaleString()}+ panel`
      : `Avionics: Score ${Math.round(row.avionics_score ?? 0)} with installed value $${Math.round(row.avionics_installed_value ?? 0).toLocaleString()}`
  const componentLine =
    componentGap == null
      ? 'Component gap: unavailable (waiting for engine/avionics comps)'
      : componentGap >= 0
      ? `Component gap: +$${Math.round(componentGap).toLocaleString()} (estimated component value above ask)`
      : `Component gap: -$${Math.abs(Math.round(componentGap)).toLocaleString()}`
  const deferredLine =
    deferredTotal == null
      ? 'Deferred: unavailable'
      : engineOverrun > 0
        ? `Deferred: $${Math.round(deferredTotal).toLocaleString()} total (includes $${Math.round(engineOverrun).toLocaleString()} engine overrun)`
        : `Deferred: $${Math.round(deferredTotal).toLocaleString()}`

  const riskLine =
    alert.length > 0
      ? 'Risk: HIGH — FAA registration alert present'
      : annualCurrent
      ? `Risk: ${risk === 'LOW' ? 'LOW' : 'MODERATE'} — no FAA alerts, annual current`
      : `Risk: ${risk === 'CRITICAL' ? 'HIGH' : risk || 'MODERATE'} — no FAA alerts, annual status not confirmed`

  let recommendation = '⚠️ Investigate annual status before proceeding'
  if (alert.length > 0) {
    recommendation = '❌ FAA registration issue — verify before any action'
  } else if (price == null) {
    recommendation = '📞 Call for price — insufficient data for deal rating'
  } else if ((vsMedian ?? 0) <= -10 && (smoh ?? 9999) <= 900) {
    recommendation = '🔥 Strong buy candidate — price and engine both favorable'
  }
  if (row.flip_candidate_triggered) {
    recommendation = '🔥 Flip trigger hit — sub-$50k, high deal rating, and strong component gap'
  }

  return {
    price: priceLine,
    engine: engineLine,
    avionics: avionicsLine,
    component: componentLine,
    deferred: deferredLine,
    risk: riskLine,
    recommendation,
  }
}

function formatComponentGap(value: number | null | undefined): ReactNode {
  if (typeof value !== 'number') return <span className="text-[#777]">N/A</span>
  if (value >= 0) return <span className="font-semibold text-emerald-400">+${Math.round(value).toLocaleString()}</span>
  return <span className="font-semibold text-red-400">-${Math.abs(Math.round(value)).toLocaleString()}</span>
}
