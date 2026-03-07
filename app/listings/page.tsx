import ListingsClient from './ListingsClient'
import { getListingFilterOptions, getListingsPage } from '../../lib/db/listingsRepository'

type SearchParams = Record<string, string | string[] | undefined>
type CategoryValue = 'single' | 'multi' | 'turboprop' | 'jet' | 'helicopter' | 'lsp' | 'sea' | null
type DealTierValue = 'all' | 'TOP_DEALS' | 'EXCEPTIONAL_DEAL' | 'GOOD_DEAL' | 'FAIR_MARKET' | 'ABOVE_MARKET' | 'OVERPRICED'
type OwnershipTypeValue = 'all' | 'full' | 'fractional'
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

function parseParam(searchParams: SearchParams | undefined, key: string): string {
  const raw = searchParams?.[key]
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' ? value.trim() : ''
}

function parseSearchTerm(searchParams?: SearchParams): string {
  return parseParam(searchParams, 'q')
}

function normalizeSourceKey(sourceRaw: string): string {
  const value = sourceRaw.trim().toLowerCase()
  if (!value) return 'unknown'
  if (value === 'tap' || value === 'trade-a-plane' || value === 'tradaplane') return 'trade-a-plane'
  if (value === 'controller_cdp') return 'controller_cdp'
  if (value === 'controller' || value === 'ctrl' || value.startsWith('controller_')) return 'controller'
  if (value === 'aerotrader' || value === 'aero_trader') return 'aerotrader'
  if (value === 'aircraftforsale' || value === 'aircraft_for_sale' || value === 'afs') return 'aircraftforsale'
  if (value === 'aso') return 'aso'
  if (value === 'globalair' || value === 'global_air') return 'globalair'
  if (value === 'barnstormers') return 'barnstormers'
  return value
}

function parseCategory(searchParams?: SearchParams): CategoryValue {
  const raw = searchParams?.category
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase()
  if (!value) return null
  if (value === 'single' || value === 'multi' || value === 'turboprop' || value === 'jet' || value === 'helicopter' || value === 'lsp' || value === 'sea') {
    return value
  }
  return null
}

function parseDealTier(searchParams?: SearchParams): DealTierValue {
  const raw = searchParams?.dealTier
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toUpperCase()
  if (!value) return 'all'
  if (value === 'TOP_DEALS' || value === 'EXCEPTIONAL_DEAL' || value === 'GOOD_DEAL' || value === 'FAIR_MARKET' || value === 'ABOVE_MARKET' || value === 'OVERPRICED') {
    return value
  }
  return 'all'
}

function parseSortBy(searchParams?: SearchParams): SortOption {
  const value = parseParam(searchParams, 'sortBy').toLowerCase()
  const validSorts: SortOption[] = [
    'value_desc', 'value_asc', 'price_low', 'price_high', 'deal_desc',
    'market_best', 'market_worst', 'risk_low', 'risk_high',
    'deferred_low', 'deferred_high', 'tt_low', 'tt_high', 'year_newest', 'year_oldest',
  ]
  if (value && validSorts.includes(value as SortOption)) return value as SortOption
  return 'value_desc'
}

function parsePositiveInt(searchParams: SearchParams | undefined, key: string, fallback = 0): number {
  const value = Number(parseParam(searchParams, key))
  if (!Number.isFinite(value)) return fallback
  const normalized = Math.floor(value)
  return normalized > 0 ? normalized : fallback
}

function parseOwnershipType(searchParams?: SearchParams): OwnershipTypeValue {
  const value = parseParam(searchParams, 'ownershipType').toLowerCase()
  if (value === 'full' || value === 'fractional') return value
  return 'all'
}

function buildFilterOptions(rows: Array<{ make: string | null; model: string | null; state: string | null; source: string | null; dealTier: string | null; valueScore: number | null }>) {
  const makes = new Set<string>()
  const models = new Set<string>()
  const states = new Set<string>()
  const modelPairs = new Set<string>()
  const makeCounts = new Map<string, number>()
  const modelCounts = new Map<string, number>()
  const modelPairCounts = new Map<string, number>()
  const sourceCounts = new Map<string, number>()
  const dealTierCounts = new Map<string, number>()
  let score60Count = 0
  let score80Count = 0

  for (const row of rows) {
    const make = String(row.make ?? '').trim()
    const model = String(row.model ?? '').trim()
    const state = String(row.state ?? '').trim().toUpperCase()
    const source = normalizeSourceKey(String(row.source ?? ''))
    const dealTier = String(row.dealTier ?? '').trim().toUpperCase()
    const valueScore = typeof row.valueScore === 'number' ? row.valueScore : null
    const normalizedMake = make.toUpperCase()
    const isValidMake = make.length > 0 && normalizedMake !== '-' && normalizedMake !== 'N/A' && normalizedMake !== 'UNKNOWN'
    if (isValidMake) makes.add(make)
    if (model) models.add(model)
    if (state) states.add(state)
    if (isValidMake && model) modelPairs.add(`${make}|||${model}`)
    if (isValidMake) makeCounts.set(make, (makeCounts.get(make) ?? 0) + 1)
    if (model) modelCounts.set(model, (modelCounts.get(model) ?? 0) + 1)
    if (isValidMake && model) {
      const pairKey = `${make}|||${model}`
      modelPairCounts.set(pairKey, (modelPairCounts.get(pairKey) ?? 0) + 1)
    }
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1)
    if (dealTier) dealTierCounts.set(dealTier, (dealTierCounts.get(dealTier) ?? 0) + 1)
    if (typeof valueScore === 'number') {
      if (valueScore >= 60) score60Count += 1
      if (valueScore >= 80) score80Count += 1
    }
  }

  const exceptionalDeals = dealTierCounts.get('EXCEPTIONAL_DEAL') ?? 0
  const goodDeals = dealTierCounts.get('GOOD_DEAL') ?? 0
  const allCount = rows.length

  return {
    makes: Array.from(makes).sort((a, b) => a.localeCompare(b)),
    models: Array.from(models).sort((a, b) => a.localeCompare(b)),
    states: Array.from(states).sort((a, b) => a.localeCompare(b)),
    modelPairs: Array.from(modelPairs)
      .map((entry) => {
        const [make, model] = entry.split('|||')
        return { make, model }
      })
      .sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model)),
    makeCounts: Object.fromEntries(makeCounts),
    modelCounts: Object.fromEntries(modelCounts),
    modelPairCounts: Object.fromEntries(modelPairCounts),
    sourceCounts: Object.fromEntries(sourceCounts),
    dealTierCounts: {
      all: allCount,
      TOP_DEALS: exceptionalDeals + goodDeals,
      EXCEPTIONAL_DEAL: exceptionalDeals,
      GOOD_DEAL: goodDeals,
      FAIR_MARKET: dealTierCounts.get('FAIR_MARKET') ?? 0,
      ABOVE_MARKET: dealTierCounts.get('ABOVE_MARKET') ?? 0,
      OVERPRICED: dealTierCounts.get('OVERPRICED') ?? 0,
    },
    minimumValueScoreCounts: {
      any: allCount,
      '60': score60Count,
      '80': score80Count,
    },
  }
}

export default async function ListingsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const resolvedSearchParams = await searchParams
  const initialSearchTerm = parseSearchTerm(resolvedSearchParams)
  const initialCategoryFilter = parseCategory(resolvedSearchParams)
  const initialDealFilter = parseDealTier(resolvedSearchParams)
  const requestedSortBy = parseSortBy(resolvedSearchParams)
  const initialMakeFilter = parseParam(resolvedSearchParams, 'make')
  const initialModelFamilyFilter = parseParam(resolvedSearchParams, 'modelFamily')
  const initialSubModelFilter = parseParam(resolvedSearchParams, 'subModel')
  const initialSourceFilter = parseParam(resolvedSearchParams, 'source')
  const initialStateFilter = parseParam(resolvedSearchParams, 'state')
  const initialRiskFilter = parseParam(resolvedSearchParams, 'risk')
  const initialOwnershipType = parseOwnershipType(resolvedSearchParams)
  const initialMinimumScore = parsePositiveInt(resolvedSearchParams, 'minValueScore', 0)
  const initialMaxPrice = parsePositiveInt(resolvedSearchParams, 'maxPrice', 0)
  const initialPage = parsePositiveInt(resolvedSearchParams, 'page', 1)
  const requestedPageSize = parsePositiveInt(resolvedSearchParams, 'pageSize', 24)
  const initialPageSize = Math.min(48, Math.max(12, requestedPageSize))
  const initialSortBy: SortOption =
    initialDealFilter === 'TOP_DEALS' ? 'deal_desc' : requestedSortBy

  const [initialPageData, optionRows] = await Promise.all([
    getListingsPage({
      page: initialPage,
      pageSize: initialPageSize,
      sortBy: initialSortBy,
      q: initialSearchTerm,
      make: initialMakeFilter,
      modelFamily: initialModelFamilyFilter,
      subModel: initialSubModelFilter,
      source: initialSourceFilter,
      state: initialStateFilter,
      risk: initialRiskFilter,
      minValueScore: initialMinimumScore,
      maxPrice: initialMaxPrice,
      category: initialCategoryFilter ?? '',
      dealTier: initialDealFilter === 'all' ? '' : initialDealFilter,
      ownershipType: initialOwnershipType,
    }),
    getListingFilterOptions(),
  ])

  return (
    <ListingsClient
      initialListings={initialPageData.rows}
      initialTotalFiltered={initialPageData.total}
      initialFilterOptions={buildFilterOptions(optionRows)}
      initialSearchTerm={initialSearchTerm}
      initialCategoryFilter={initialCategoryFilter}
      initialDealFilter={initialDealFilter}
      initialSortBy={initialSortBy}
      initialMakeFilter={initialMakeFilter}
      initialModelFilter={initialModelFamilyFilter}
      initialSubModelFilter={initialSubModelFilter}
      initialSourceFilter={initialSourceFilter}
      initialStateFilter={initialStateFilter}
      initialRiskFilter={initialRiskFilter}
      initialOwnershipType={initialOwnershipType}
      initialMinimumScore={initialMinimumScore}
      initialMaxPrice={initialMaxPrice}
      initialPage={initialPage}
      initialPageSize={initialPageSize}
    />
  )
}
