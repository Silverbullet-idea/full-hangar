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
const DEFAULT_TIERS = new Set(['EXCEPTIONAL_DEAL', 'GOOD_DEAL'])
const DEAL_TIERS = ['EXCEPTIONAL_DEAL', 'GOOD_DEAL', 'FAIR_MARKET', 'ABOVE_MARKET', 'OVERPRICED'] as const

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

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
  const [activeTab, setActiveTab] = useState<'all' | 'priority' | 'watchlist'>('priority')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [maxPrice, setMaxPrice] = useState(50000)
  const [selectedTiers, setSelectedTiers] = useState<Set<string>>(new Set(DEFAULT_TIERS))
  const [selectedMakes, setSelectedMakes] = useState<string[]>([])
  const [minAvionicsScore, setMinAvionicsScore] = useState(0)
  const [excludeNoPrice, setExcludeNoPrice] = useState(false)
  const [hasNNumberOnly, setHasNNumberOnly] = useState(false)
  const [faaAlertsOnly, setFaaAlertsOnly] = useState(false)
  const [highPriorityOnly, setHighPriorityOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('deal_rating')
  const [activePreset, setActivePreset] = useState<PresetKey>('none')
  const [watchlist, setWatchlist] = useState<Record<string, WatchlistEntry>>({})
  const [recentSales, setRecentSales] = useState<RecentSoldRecord[]>([])
  const [recentSalesLoading, setRecentSalesLoading] = useState(true)

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
    if (raw === 'deal_rating' || raw === 'vs_median_price' || raw === 'days_on_market' || raw === 'price_reduction_amount' || raw === 'component_gap_value') {
      setSortKey(raw)
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
        const listingQuery = supabase
          .from('public_listings')
          .select('*')
          .or('asking_price.lte.60000,asking_price.is.null')
          .order('deal_rating', { ascending: false, nullsFirst: false })
          .limit(2500)
        const listingResult = await withTimeout(
          listingQuery as unknown as Promise<{ data: DealListing[] | null; error: unknown }>,
          12000,
          'internal deals listing query'
        )
        const data = listingResult.data
        const error = listingResult.error

        if (error) {
          console.error('Failed to load internal deals:', error)
          return
        }

        const baseRows = (data ?? []) as DealListing[]
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

        const tier = normalizeTier(row.deal_tier)
        if (selectedTiers.size > 0 && !selectedTiers.has(tier)) return false

        const normalizedMake = normalizeText(row.make)
        if (selectedMakes.length > 0 && (!normalizedMake || !selectedMakes.includes(normalizedMake))) return false

        const avionicsScore = row.avionics_score ?? 0
        if (avionicsScore < minAvionicsScore) return false

        if (hasNNumberOnly && !normalizeText(row.n_number)) return false
        if (faaAlertsOnly && !normalizeText(row.faa_registration_alert)) return false
        if (highPriorityOnly && !isHighPriorityDeal(row)) return false

        return true
      })
      .sort((a, b) => compareDeals(a, b, sortKey))
  }, [rows, excludeNoPrice, faaAlertsOnly, hasNNumberOnly, highPriorityOnly, maxPrice, minAvionicsScore, selectedMakes, selectedTiers, sortKey])

  const watchlistRows = useMemo(() => {
    return rows.filter((row) => Boolean(watchlist[row.id])).sort((a, b) => compareDeals(a, b, sortKey))
  }, [rows, watchlist, sortKey])

  const priorityRows = useMemo(() => {
    return filteredRows.filter((row) => isHighPriorityDeal(row))
  }, [filteredRows])

  const displayedRows = activeTab === 'watchlist' ? watchlistRows : activeTab === 'priority' ? priorityRows : filteredRows

  const topStats = useMemo(() => {
    const exceptionalCount = baseUnder50k.filter((row) => normalizeTier(row.deal_tier) === 'EXCEPTIONAL_DEAL').length
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
      exceptionalCount,
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
      setSelectedTiers(new Set(['EXCEPTIONAL_DEAL', 'GOOD_DEAL']))
      setSelectedMakes([])
      setMinAvionicsScore(20)
      setExcludeNoPrice(true)
      setHasNNumberOnly(true)
      setFaaAlertsOnly(false)
      setHighPriorityOnly(false)
      setSortKey('deal_rating')
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
      setSortKey('price_reduction_amount')
      return
    }

    setMaxPrice(50000)
    setSelectedTiers(new Set(DEFAULT_TIERS))
    setSelectedMakes([])
    setMinAvionicsScore(0)
    setExcludeNoPrice(false)
    setHasNNumberOnly(false)
    setFaaAlertsOnly(false)
    setHighPriorityOnly(false)
    setSortKey('deal_rating')
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
  const normalized = (value ?? '').trim().toUpperCase()
  if (normalized === 'EXCEPTIONAL') return 'EXCEPTIONAL_DEAL'
  if (normalized === 'GOOD') return 'GOOD_DEAL'
  if (normalized === 'FAIR') return 'FAIR_MARKET'
  if (normalized === 'ABOVE') return 'ABOVE_MARKET'
  return normalized || 'OVERPRICED'
}

function toTierBadgeText(tier: string): string {
  if (tier === 'EXCEPTIONAL_DEAL') return 'EXCEPTIONAL'
  if (tier === 'GOOD_DEAL') return 'GOOD'
  if (tier === 'FAIR_MARKET') return 'FAIR'
  if (tier === 'ABOVE_MARKET') return 'ABOVE'
  return 'OVERPRICED'
}

function tierBadgeClass(tier: string): string {
  if (tier === 'EXCEPTIONAL_DEAL') return 'bg-emerald-800 text-emerald-100'
  if (tier === 'GOOD_DEAL') return 'bg-green-900 text-green-100'
  if (tier === 'FAIR_MARKET') return 'bg-slate-700 text-slate-100'
  if (tier === 'ABOVE_MARKET') return 'bg-amber-900 text-amber-100'
  return 'bg-red-900 text-red-100'
}

function getAskingPrice(row: DealListing): number | null {
  const price = row.asking_price ?? row.price_asking
  return typeof price === 'number' ? price : null
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

  const priorityDelta = priorityRank(b) - priorityRank(a)
  if (priorityDelta !== 0) return priorityDelta
  return (b.deal_rating ?? -1) - (a.deal_rating ?? -1)
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
    risk: riskLine,
    recommendation,
  }
}

function formatComponentGap(value: number | null | undefined): ReactNode {
  if (typeof value !== 'number') return <span className="text-[#777]">N/A</span>
  if (value >= 0) return <span className="font-semibold text-emerald-400">+${Math.round(value).toLocaleString()}</span>
  return <span className="font-semibold text-red-400">-${Math.abs(Math.round(value)).toLocaleString()}</span>
}
