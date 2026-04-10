'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReadonlyURLSearchParams } from 'next/navigation'
import { useRouter, useSearchParams } from 'next/navigation'
import FilterDrawer from '../components/FilterDrawer'
import DealTierBar from './components/DealTierBar'
import ListingCard from './components/ListingCard'
import ListingsFiltersSidebar from './components/ListingsFiltersSidebar'
import ListingsGridAndPagination from './components/ListingsGridAndPagination'
import ListingsMetaBar from './components/ListingsMetaBar'
import ListingsResultsToolbar from './components/ListingsResultsToolbar'
import PillarLegendBar from './components/PillarLegendBar'
import { formatHours, formatListingSourceLabel, formatPriceOrCall, formatScore } from '../../lib/listings/format'
import { parseListingFacetTokens } from '../../lib/listings/listingsQueryFromSearchParams'
import { mergeListingsQueryParams } from './components/listingsCategoryNav'
import {
  collectImageCandidates,
  deriveModelFamily,
  inferCategoriesForMakeModel,
  normalizeListingPillarMin,
  normalizeTopMenuMakeLabel,
  normalizeSourceKey,
  parseCategoryParam,
  type CategoryValue,
  type ListingSourceKey,
} from './components/listingsClientUtils'
import { beechcraftFamilyTokenLabel } from '../../lib/listings/beechcraftDisplayNames'

function mergeListingsUrlSnapshot(params: URLSearchParams, searchParams: ReadonlyURLSearchParams) {
  const keys = [
    'dealScore',
    'priceDropOnly',
    'addedToday',
    'hidePriceUndisclosed',
    'location',
    'minEngine',
    'minAvionics',
    'minQuality',
    'minValue',
    'maxValueScore',
    'engineLife',
    'avionics',
    'dealPattern',
  ] as const
  for (const k of keys) {
    const v = searchParams.get(k)
    if (v) params.set(k, v)
  }
}

type LayoutMode = 'tiles' | 'rows' | 'compact'
type SortOption =
  | 'price_low'
  | 'price_high'
  | 'flip_desc'
  | 'flip_asc'
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
  | 'engine_life'
  | 'dom_asc'
  | 'recent_add'
type DealTierFilter = 'all' | 'TOP_DEALS' | 'HOT' | 'GOOD' | 'FAIR' | 'PASS'
type PriceStatusFilter = 'all' | 'priced'
type MaintenanceBandFilter = 'any' | 'light' | 'moderate' | 'heavy' | 'severe'
type EngineTimeFilter = 'any' | 'fresh' | 'mid' | 'approaching' | 'hasHours'

type FilterOptions = {
  makes: string[]
  models: string[]
  states: string[]
  modelPairs: Array<{ make: string; model: string }>
  /** Beechcraft sub-model display names keyed by `make|||model` (from `/api/listings/options`). */
  modelPairLabels?: Record<string, string>
  makeCounts: Record<string, number>
  modelCounts: Record<string, number>
  modelPairCounts: Record<string, number>
  sourceCounts: Record<string, number>
  dealTierCounts: Record<string, number>
  minimumValueScoreCounts: Record<string, number>
}

type ListingsClientProps = {
  initialListings: any[]
  initialTotalFiltered: number
  initialFilterOptions: FilterOptions
  initialSearchTerm?: string
  initialCategoryFilter?: CategoryValue
  initialDealFilter?: DealTierFilter
  initialSortBy?: SortOption
  initialMakeFilter?: string
  initialModelFilter?: string
  initialSubModelFilter?: string
  initialSourceFilter?: 'all' | ListingSourceKey | string
  initialStateFilter?: string
  initialRiskFilter?: string
  initialMinimumScore?: number
  initialMaxValueScore?: number
  initialDealScore?: string
  initialLocation?: string
  initialMinEngine?: number
  initialMinAvionics?: number
  initialMinQuality?: number
  initialMinMktValue?: number
  initialPriceReducedOnly?: boolean
  initialAddedToday?: boolean
  initialMinPrice?: number
  initialMaxPrice?: number
  initialPriceStatus?: PriceStatusFilter
  initialYearMin?: number
  initialYearMax?: number
  initialTotalTimeMin?: number
  initialTotalTimeMax?: number
  initialMaintenanceBand?: MaintenanceBandFilter
  initialEngineTime?: EngineTimeFilter
  initialTrueCostMin?: number
  initialTrueCostMax?: number
  initialPage?: number
  initialPageSize?: number
  initialEngineLife?: string
  initialAvionics?: string
  initialDealPattern?: string
}

type AppliedListingsUrlSnapshot = {
  page: number
  pageSize: number
  sortBy: SortOption
  q: string
  categoryFilter: CategoryValue
  makeFilter: string
  modelFilter: string
  subModelFilter: string
  sourceFilter: 'all' | ListingSourceKey
  riskFilter: string
  dealFilter: DealTierFilter
  minimumScore: number
  minPrice: number
  maxPrice: number
  priceStatus: PriceStatusFilter
  yearMin: number
  yearMax: number
  totalTimeMin: number
  totalTimeMax: number
  maintenanceBand: MaintenanceBandFilter
  engineTime: EngineTimeFilter
  engineLife: string[]
  trueCostMin: number
  trueCostMax: number
  pillarMinEngine: number
  pillarMinAvionics: number
  pillarMinQuality: number
  pillarMinMkt: number
  location: string
  avionics: string[]
  dealPattern: string[]
}

function parseCategoryFromSearchParams(sp: ReadonlyURLSearchParams): CategoryValue {
  return parseCategoryParam(sp.get('category'))
}

function mergePreservedNavKeys(
  params: URLSearchParams,
  base: ReadonlyURLSearchParams,
  opts: { dealTierActive: boolean }
) {
  if (!opts.dealTierActive) {
    const ds = base.get('dealScore')
    if (ds) params.set('dealScore', ds)
  }
  const mv = base.get('maxValueScore')
  if (mv) params.set('maxValueScore', mv)
  for (const key of ['priceDropOnly', 'addedToday', 'hidePriceUndisclosed'] as const) {
    const v = base.get(key)
    if (v) params.set(key, v)
  }
}

function buildAppliedListingsSearchParams(
  base: ReadonlyURLSearchParams,
  s: AppliedListingsUrlSnapshot,
  opts?: { preserveNavExtras?: boolean }
): URLSearchParams {
  const params = new URLSearchParams()

  if (s.page > 1) params.set('page', String(s.page))
  if (s.pageSize !== 24) params.set('pageSize', String(s.pageSize))
  if (s.sortBy !== 'flip_desc' && s.sortBy !== 'deal_desc') params.set('sortBy', s.sortBy)

  const q = s.q.trim()
  if (q) params.set('q', q)

  if (s.categoryFilter) params.set('category', s.categoryFilter)

  if (s.makeFilter && s.makeFilter !== 'all') params.set('make', s.makeFilter)
  if (s.modelFilter.trim()) params.set('modelFamily', s.modelFilter.trim())
  if (s.subModelFilter.trim()) params.set('subModel', s.subModelFilter.trim())
  if (s.sourceFilter !== 'all') params.set('source', s.sourceFilter)
  if (s.riskFilter && s.riskFilter !== 'all') params.set('risk', s.riskFilter)

  const dealTierActive = s.dealFilter !== 'all'
  if (dealTierActive) params.set('dealTier', s.dealFilter)

  if (s.minimumScore > 0) params.set('minValueScore', String(s.minimumScore))

  if (s.minPrice > 0) params.set('minPrice', String(s.minPrice))
  if (s.maxPrice > 0) params.set('maxPrice', String(s.maxPrice))
  if (s.priceStatus !== 'all') params.set('priceStatus', s.priceStatus)

  if (s.yearMin > 0) params.set('yearMin', String(s.yearMin))
  if (s.yearMax > 0) params.set('yearMax', String(s.yearMax))
  if (s.totalTimeMin > 0) params.set('totalTimeMin', String(s.totalTimeMin))
  if (s.totalTimeMax > 0) params.set('totalTimeMax', String(s.totalTimeMax))

  if (s.maintenanceBand !== 'any') params.set('maintenanceBand', s.maintenanceBand)
  if (s.engineLife.length === 0 && s.engineTime !== 'any') {
    params.set('engineTime', s.engineTime)
  }

  if (s.trueCostMin > 0) params.set('trueCostMin', String(s.trueCostMin))
  if (s.trueCostMax > 0) params.set('trueCostMax', String(s.trueCostMax))

  const loc = s.location.trim()
  if (loc) params.set('location', loc)
  const pe = normalizeListingPillarMin(s.pillarMinEngine)
  const pa = normalizeListingPillarMin(s.pillarMinAvionics)
  const pq = normalizeListingPillarMin(s.pillarMinQuality)
  const pm = normalizeListingPillarMin(s.pillarMinMkt)
  if (pe > 0) params.set('minEngine', String(pe))
  if (pa > 0) params.set('minAvionics', String(pa))
  if (pq > 0) params.set('minQuality', String(pq))
  if (pm > 0) params.set('minValue', String(pm))

  const el = s.engineLife.join(',')
  if (el) params.set('engineLife', el)
  const av = s.avionics.join(',')
  if (av) params.set('avionics', av)
  const dp = s.dealPattern.join(',')
  if (dp) params.set('dealPattern', dp)

  if (opts?.preserveNavExtras !== false) {
    mergePreservedNavKeys(params, base, { dealTierActive })
  }

  return params
}

function InfoTooltip({ title, body }: { title: string; body: string }) {
  return (
    <span className="group relative ml-1 inline-flex align-middle">
      <button
        type="button"
        aria-label={`More info about ${title}`}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#3A4454] text-[10px] font-bold text-[#B2B2B2] transition-colors hover:border-[#FF9900] hover:text-[#FF9900]"
      >
        i
      </button>
      <span className="pointer-events-none absolute left-5 top-1/2 z-30 hidden w-72 -translate-y-1/2 rounded-md border border-[#3A4454] bg-[#141922] p-2 text-[11px] leading-relaxed text-[#D1D5DB] shadow-xl group-hover:block group-focus-within:block">
        <strong className="block text-[#FF9900]">{title}</strong>
        {body}
      </span>
    </span>
  )
}

export default function ListingsClient({
  initialListings,
  initialTotalFiltered,
  initialFilterOptions,
  initialSearchTerm = '',
  initialCategoryFilter = null,
  initialDealFilter = 'all',
  initialSortBy = 'flip_desc',
  initialMakeFilter = 'all',
  initialModelFilter = '',
  initialSubModelFilter = '',
  initialSourceFilter = 'all',
  initialStateFilter = '',
  initialRiskFilter = 'all',
  initialMinimumScore = 0,
  initialMaxValueScore = 0,
  initialDealScore = '',
  initialLocation = '',
  initialMinEngine = 0,
  initialMinAvionics = 0,
  initialMinQuality = 0,
  initialMinMktValue = 0,
  initialPriceReducedOnly = false,
  initialAddedToday = false,
  initialMinPrice = 0,
  initialMaxPrice = 0,
  initialPriceStatus = 'all',
  initialYearMin = 0,
  initialYearMax = 0,
  initialTotalTimeMin = 0,
  initialTotalTimeMax = 0,
  initialMaintenanceBand = 'any',
  initialEngineTime = 'any',
  initialTrueCostMin = 0,
  initialTrueCostMax = 0,
  initialPage = 1,
  initialPageSize = 24,
  initialEngineLife = '',
  initialAvionics = '',
  initialDealPattern = '',
}: ListingsClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchParamsKey = searchParams.toString()
  const canApplySavedSort =
    (initialSortBy === 'flip_desc' || initialSortBy === 'deal_desc') && initialDealFilter === 'all'
  const [listings, setListings] = useState<any[]>(Array.isArray(initialListings) ? initialListings : [])
  const [totalFiltered, setTotalFiltered] = useState(Number.isFinite(initialTotalFiltered) ? initialTotalFiltered : 0)
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(initialFilterOptions)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [imageCursor, setImageCursor] = useState<Record<string, number>>({})
  const [appliedSearchTerm, setAppliedSearchTerm] = useState(initialSearchTerm)
  const [currentPage, setCurrentPage] = useState(Math.max(1, initialPage))
  const [pageSize, setPageSize] = useState(Math.min(48, Math.max(12, initialPageSize)))
  const [makeFilter, setMakeFilter] = useState(initialMakeFilter || 'all')
  const [modelFilter, setModelFilter] = useState(initialModelFilter || '')
  const [subModelFilter, setSubModelFilter] = useState(initialSubModelFilter || '')
  const [appliedMakeFilter, setAppliedMakeFilter] = useState(initialMakeFilter || 'all')
  const [appliedModelFilter, setAppliedModelFilter] = useState(initialModelFilter || '')
  const [appliedSubModelFilter, setAppliedSubModelFilter] = useState(initialSubModelFilter || '')
  const normalizedInitialSourceFilter = (initialSourceFilter && initialSourceFilter !== 'all'
    ? normalizeSourceKey(String(initialSourceFilter))
    : 'all') as 'all' | ListingSourceKey
  const [sourceFilter, setSourceFilter] = useState<'all' | ListingSourceKey>(normalizedInitialSourceFilter)
  const [appliedSourceFilter, setAppliedSourceFilter] = useState<'all' | ListingSourceKey>(normalizedInitialSourceFilter)
  const [riskFilter, setRiskFilter] = useState(initialRiskFilter || 'all')
  const [appliedRiskFilter, setAppliedRiskFilter] = useState(initialRiskFilter || 'all')
  const [dealFilter, setDealFilter] = useState<DealTierFilter>(initialDealFilter)
  const [minimumScore, setMinimumScore] = useState(Math.max(0, initialMinimumScore))
  const [minPrice, setMinPrice] = useState(Math.max(0, initialMinPrice))
  const [maxPrice, setMaxPrice] = useState(Math.max(0, initialMaxPrice))
  const [priceStatus, setPriceStatus] = useState<PriceStatusFilter>(initialPriceStatus)
  const [yearMin, setYearMin] = useState(Math.max(0, initialYearMin))
  const [yearMax, setYearMax] = useState(Math.max(0, initialYearMax))
  const [totalTimeMin, setTotalTimeMin] = useState(Math.max(0, initialTotalTimeMin))
  const [totalTimeMax, setTotalTimeMax] = useState(Math.max(0, initialTotalTimeMax))
  const [maintenanceBand, setMaintenanceBand] = useState<MaintenanceBandFilter>(initialMaintenanceBand)
  const [engineTime, setEngineTime] = useState<EngineTimeFilter>(initialEngineTime)
  const [trueCostMin, setTrueCostMin] = useState(Math.max(0, initialTrueCostMin))
  const [trueCostMax, setTrueCostMax] = useState(Math.max(0, initialTrueCostMax))
  const [appliedMinPrice, setAppliedMinPrice] = useState(Math.max(0, initialMinPrice))
  const [appliedMaxPrice, setAppliedMaxPrice] = useState(Math.max(0, initialMaxPrice))
  const [appliedPriceStatus, setAppliedPriceStatus] = useState<PriceStatusFilter>(initialPriceStatus)
  const [appliedYearMin, setAppliedYearMin] = useState(Math.max(0, initialYearMin))
  const [appliedYearMax, setAppliedYearMax] = useState(Math.max(0, initialYearMax))
  const [appliedTotalTimeMin, setAppliedTotalTimeMin] = useState(Math.max(0, initialTotalTimeMin))
  const [appliedTotalTimeMax, setAppliedTotalTimeMax] = useState(Math.max(0, initialTotalTimeMax))
  const [appliedMaintenanceBand, setAppliedMaintenanceBand] = useState<MaintenanceBandFilter>(initialMaintenanceBand)
  const [appliedEngineTime, setAppliedEngineTime] = useState<EngineTimeFilter>(initialEngineTime)
  const [appliedTrueCostMin, setAppliedTrueCostMin] = useState(Math.max(0, initialTrueCostMin))
  const [appliedTrueCostMax, setAppliedTrueCostMax] = useState(Math.max(0, initialTrueCostMax))
  const [pillarMinEngine, setPillarMinEngine] = useState(() => normalizeListingPillarMin(initialMinEngine))
  const [appliedPillarMinEngine, setAppliedPillarMinEngine] = useState(() => normalizeListingPillarMin(initialMinEngine))
  const [pillarMinAvionics, setPillarMinAvionics] = useState(() => normalizeListingPillarMin(initialMinAvionics))
  const [appliedPillarMinAvionics, setAppliedPillarMinAvionics] = useState(() =>
    normalizeListingPillarMin(initialMinAvionics)
  )
  const [pillarMinQuality, setPillarMinQuality] = useState(() => normalizeListingPillarMin(initialMinQuality))
  const [appliedPillarMinQuality, setAppliedPillarMinQuality] = useState(() => normalizeListingPillarMin(initialMinQuality))
  const [pillarMinMkt, setPillarMinMkt] = useState(() => normalizeListingPillarMin(initialMinMktValue))
  const [appliedPillarMinMkt, setAppliedPillarMinMkt] = useState(() => normalizeListingPillarMin(initialMinMktValue))
  const [locationDraft, setLocationDraft] = useState(initialLocation)
  const [appliedLocation, setAppliedLocation] = useState(initialLocation)
  const [engineLifeDraft, setEngineLifeDraft] = useState(() =>
    [...new Set(parseListingFacetTokens(initialEngineLife))].sort()
  )
  const [appliedEngineLife, setAppliedEngineLife] = useState(() =>
    [...new Set(parseListingFacetTokens(initialEngineLife))].sort()
  )
  const [avionicsDraft, setAvionicsDraft] = useState(() =>
    [...new Set(parseListingFacetTokens(initialAvionics))].sort()
  )
  const [appliedAvionics, setAppliedAvionics] = useState(() =>
    [...new Set(parseListingFacetTokens(initialAvionics))].sort()
  )
  const [dealPatternDraft, setDealPatternDraft] = useState(() =>
    [...new Set(parseListingFacetTokens(initialDealPattern))].sort()
  )
  const [appliedDealPattern, setAppliedDealPattern] = useState(() =>
    [...new Set(parseListingFacetTokens(initialDealPattern))].sort()
  )
  const [categoryFilter, setCategoryFilter] = useState<CategoryValue>(initialCategoryFilter)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('tiles')
  const [sortBy, setSortBy] = useState<SortOption>(initialSortBy)
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false)
  const hasSkippedInitialFetch = useRef(false)
  const filterOptionsFetchCompletedRef = useRef(false)

  const commitListingsUrl = useCallback(
    (snapshot: AppliedListingsUrlSnapshot, opts?: { preserveNavExtras?: boolean }) => {
      const params = buildAppliedListingsSearchParams(searchParams, snapshot, opts)
      const qs = params.toString()
      router.replace(`/listings${qs ? `?${qs}` : ''}`, { scroll: false })
    },
    [router, searchParams]
  )

  const makeAppliedUrlSnapshot = useCallback(
    (overrides?: Partial<AppliedListingsUrlSnapshot>): AppliedListingsUrlSnapshot => ({
      page: currentPage,
      pageSize,
      sortBy,
      q: appliedSearchTerm,
      categoryFilter: categoryFilter ?? parseCategoryFromSearchParams(searchParams),
      makeFilter: appliedMakeFilter,
      modelFilter: appliedModelFilter,
      subModelFilter: appliedSubModelFilter,
      sourceFilter: appliedSourceFilter,
      riskFilter: appliedRiskFilter,
      dealFilter,
      minimumScore,
      minPrice: appliedMinPrice,
      maxPrice: appliedMaxPrice,
      priceStatus: appliedPriceStatus,
      yearMin: appliedYearMin,
      yearMax: appliedYearMax,
      totalTimeMin: appliedTotalTimeMin,
      totalTimeMax: appliedTotalTimeMax,
      maintenanceBand: appliedMaintenanceBand,
      engineTime: appliedEngineTime,
      engineLife: appliedEngineLife,
      trueCostMin: appliedTrueCostMin,
      trueCostMax: appliedTrueCostMax,
      pillarMinEngine: appliedPillarMinEngine,
      pillarMinAvionics: appliedPillarMinAvionics,
      pillarMinQuality: appliedPillarMinQuality,
      pillarMinMkt: appliedPillarMinMkt,
      location: appliedLocation,
      avionics: appliedAvionics,
      dealPattern: appliedDealPattern,
      ...overrides,
    }),
    [
      currentPage,
      pageSize,
      sortBy,
      appliedSearchTerm,
      categoryFilter,
      searchParams,
      appliedMakeFilter,
      appliedModelFilter,
      appliedSubModelFilter,
      appliedSourceFilter,
      appliedRiskFilter,
      dealFilter,
      minimumScore,
      appliedMinPrice,
      appliedMaxPrice,
      appliedPriceStatus,
      appliedYearMin,
      appliedYearMax,
      appliedTotalTimeMin,
      appliedTotalTimeMax,
      appliedMaintenanceBand,
      appliedEngineTime,
      appliedEngineLife,
      appliedTrueCostMin,
      appliedTrueCostMax,
      appliedPillarMinEngine,
      appliedPillarMinAvionics,
      appliedPillarMinQuality,
      appliedPillarMinMkt,
      appliedLocation,
      appliedAvionics,
      appliedDealPattern,
    ]
  )

  const setPageSizeWithUrl = useCallback(
    (next: number) => {
      const clamped = Math.min(48, Math.max(12, Math.floor(next)))
      setPageSize(clamped)
      setCurrentPage(1)
      commitListingsUrl(makeAppliedUrlSnapshot({ pageSize: clamped, page: 1 }))
    },
    [commitListingsUrl, makeAppliedUrlSnapshot]
  )

  const applySortByToUrl = useCallback(
    (raw: string) => {
      const valid: SortOption[] = [
        'price_low',
        'price_high',
        'flip_desc',
        'flip_asc',
        'deal_desc',
        'market_best',
        'market_worst',
        'risk_low',
        'risk_high',
        'deferred_low',
        'deferred_high',
        'tt_low',
        'tt_high',
        'year_newest',
        'year_oldest',
        'engine_life',
        'dom_asc',
        'recent_add',
      ]
      if (!valid.includes(raw as SortOption)) return
      const next = raw as SortOption
      setSortBy(next)
      setCurrentPage(1)
      commitListingsUrl(makeAppliedUrlSnapshot({ sortBy: next, page: 1 }))
    },
    [commitListingsUrl, makeAppliedUrlSnapshot]
  )

  const categoryAccordionInitiallyOpen =
    Boolean(initialCategoryFilter) ||
    initialMaxPrice === 50000 ||
    initialPriceReducedOnly ||
    initialAddedToday

  const onCategoryNav = useCallback(
    (updates: Record<string, string | null>) => {
      const next = mergeListingsQueryParams(searchParams, updates)
      setCurrentPage(1)
      setCategoryFilter(parseCategoryParam(next.get('category')))
      const mpRaw = next.get('maxPrice')
      const mp = mpRaw ? Math.floor(Number(mpRaw)) : 0
      const safeMax = Number.isFinite(mp) && mp > 0 ? mp : 0
      setMaxPrice(safeMax)
      setAppliedMaxPrice(safeMax)
      const qs = next.toString()
      router.replace(`/listings${qs ? `?${qs}` : ''}`, { scroll: false })
    },
    [router, searchParams]
  )

  const toggleHidePriceUndisclosed = useCallback(
    (checked: boolean) => {
      const next = mergeListingsQueryParams(searchParams, {
        hidePriceUndisclosed: checked ? 'true' : null,
      })
      setCurrentPage(1)
      const qs = next.toString()
      router.replace(`/listings${qs ? `?${qs}` : ''}`, { scroll: false })
    },
    [router, searchParams]
  )

  const urlCategoryLower = (searchParams.get('category') ?? '').toLowerCase()
  const urlMaxPriceParam = searchParams.get('maxPrice') ?? ''
  const urlPriceDropOnlyParam = searchParams.get('priceDropOnly') ?? ''
  const urlAddedTodayParam = searchParams.get('addedToday') ?? ''

  const mobileActiveFilterCount = useMemo(() => {
    let count = 0
    if (categoryFilter) count += 1
    if (appliedMakeFilter !== 'all') count += 1
    if (appliedModelFilter.trim()) count += 1
    if (appliedSubModelFilter.trim()) count += 1
    if (appliedSourceFilter !== 'all') count += 1
    if (appliedRiskFilter !== 'all') count += 1
    if (dealFilter !== 'all') count += 1
    if (minimumScore > 0) count += 1
    if (appliedMinPrice > 0) count += 1
    if (appliedMaxPrice > 0) count += 1
    if (appliedPriceStatus !== 'all') count += 1
    if (appliedYearMin > 0) count += 1
    if (appliedYearMax > 0) count += 1
    if (appliedTotalTimeMin > 0) count += 1
    if (appliedTotalTimeMax > 0) count += 1
    if (appliedMaintenanceBand !== 'any') count += 1
    if (appliedEngineLife.length === 0 && appliedEngineTime !== 'any') count += 1
    if (appliedTrueCostMin > 0) count += 1
    if (appliedTrueCostMax > 0) count += 1
    if (appliedPillarMinEngine > 0) count += 1
    if (appliedPillarMinAvionics > 0) count += 1
    if (appliedPillarMinQuality > 0) count += 1
    if (appliedPillarMinMkt > 0) count += 1
    if (appliedLocation.trim()) count += 1
    if (appliedEngineLife.length > 0) count += 1
    if (appliedAvionics.length > 0) count += 1
    if (appliedDealPattern.length > 0) count += 1
    return count
  }, [
    categoryFilter,
    appliedMakeFilter,
    appliedModelFilter,
    appliedSubModelFilter,
    appliedSourceFilter,
    appliedRiskFilter,
    dealFilter,
    minimumScore,
    appliedMinPrice,
    appliedMaxPrice,
    appliedPriceStatus,
    appliedYearMin,
    appliedYearMax,
    appliedTotalTimeMin,
    appliedTotalTimeMax,
    appliedMaintenanceBand,
    appliedEngineTime,
    appliedTrueCostMin,
    appliedTrueCostMax,
    appliedPillarMinEngine,
    appliedPillarMinAvionics,
    appliedPillarMinQuality,
    appliedPillarMinMkt,
    appliedLocation,
    appliedEngineLife,
    appliedAvionics,
    appliedDealPattern,
  ])

  useEffect(() => {
    // Keep UI state in sync when URL/search params change within /listings.
    // Do not reset `hasSkippedInitialFetch`: that ref means "SSR initial load handled" so the
    // listings fetch effect only skips once on mount; resetting it here skipped client `/api/listings`
    // fetches after every soft navigation and left stale/empty SSR payloads visible (filters looked broken).
    setListings(Array.isArray(initialListings) ? initialListings : [])
    setTotalFiltered(Number.isFinite(initialTotalFiltered) ? initialTotalFiltered : 0)
    setFilterOptions((prev) => {
      const hasIncoming =
        initialFilterOptions.makes.length > 0 ||
        initialFilterOptions.models.length > 0 ||
        initialFilterOptions.states.length > 0 ||
        initialFilterOptions.modelPairs.length > 0
      if (hasIncoming) return initialFilterOptions
      const hasPrev =
        prev.makes.length > 0 ||
        prev.models.length > 0 ||
        prev.states.length > 0 ||
        prev.modelPairs.length > 0
      return hasPrev ? prev : initialFilterOptions
    })
    setAppliedSearchTerm(initialSearchTerm)
    setCurrentPage(Math.max(1, initialPage))
    setPageSize(Math.min(48, Math.max(12, initialPageSize)))
    setMakeFilter(initialMakeFilter || 'all')
    setModelFilter(initialModelFilter || '')
    setSubModelFilter(initialSubModelFilter || '')
    setAppliedMakeFilter(initialMakeFilter || 'all')
    setAppliedModelFilter(initialModelFilter || '')
    setAppliedSubModelFilter(initialSubModelFilter || '')
    setSourceFilter(normalizedInitialSourceFilter)
    setAppliedSourceFilter(normalizedInitialSourceFilter)
    setRiskFilter(initialRiskFilter || 'all')
    setAppliedRiskFilter(initialRiskFilter || 'all')
    setDealFilter(initialDealFilter)
    setMinimumScore(Math.max(0, initialMinimumScore))
    setMinPrice(Math.max(0, initialMinPrice))
    setMaxPrice(Math.max(0, initialMaxPrice))
    setPriceStatus(initialPriceStatus)
    setYearMin(Math.max(0, initialYearMin))
    setYearMax(Math.max(0, initialYearMax))
    setTotalTimeMin(Math.max(0, initialTotalTimeMin))
    setTotalTimeMax(Math.max(0, initialTotalTimeMax))
    setMaintenanceBand(initialMaintenanceBand)
    setEngineTime(initialEngineTime)
    setTrueCostMin(Math.max(0, initialTrueCostMin))
    setTrueCostMax(Math.max(0, initialTrueCostMax))
    setAppliedMinPrice(Math.max(0, initialMinPrice))
    setAppliedMaxPrice(Math.max(0, initialMaxPrice))
    setAppliedPriceStatus(initialPriceStatus)
    setAppliedYearMin(Math.max(0, initialYearMin))
    setAppliedYearMax(Math.max(0, initialYearMax))
    setAppliedTotalTimeMin(Math.max(0, initialTotalTimeMin))
    setAppliedTotalTimeMax(Math.max(0, initialTotalTimeMax))
    setAppliedMaintenanceBand(initialMaintenanceBand)
    setAppliedEngineTime(initialEngineTime)
    setAppliedTrueCostMin(Math.max(0, initialTrueCostMin))
    setAppliedTrueCostMax(Math.max(0, initialTrueCostMax))
    setPillarMinEngine(normalizeListingPillarMin(initialMinEngine))
    setAppliedPillarMinEngine(normalizeListingPillarMin(initialMinEngine))
    setPillarMinAvionics(normalizeListingPillarMin(initialMinAvionics))
    setAppliedPillarMinAvionics(normalizeListingPillarMin(initialMinAvionics))
    setPillarMinQuality(normalizeListingPillarMin(initialMinQuality))
    setAppliedPillarMinQuality(normalizeListingPillarMin(initialMinQuality))
    setPillarMinMkt(normalizeListingPillarMin(initialMinMktValue))
    setAppliedPillarMinMkt(normalizeListingPillarMin(initialMinMktValue))
    setLocationDraft(initialLocation)
    setAppliedLocation(initialLocation)
    const el = [...new Set(parseListingFacetTokens(initialEngineLife))].sort()
    setEngineLifeDraft(el)
    setAppliedEngineLife(el)
    const av = [...new Set(parseListingFacetTokens(initialAvionics))].sort()
    setAvionicsDraft(av)
    setAppliedAvionics(av)
    const dp = [...new Set(parseListingFacetTokens(initialDealPattern))].sort()
    setDealPatternDraft(dp)
    setAppliedDealPattern(dp)
    setCategoryFilter(initialCategoryFilter)
    setSortBy(initialSortBy)
    if (typeof window !== 'undefined') {
      // Release navigation overlay only after new listings payload is mounted.
      window.dispatchEvent(new Event('fullhangar:navigation-loading-end'))
    }
  }, [
    initialListings,
    initialTotalFiltered,
    initialFilterOptions,
    initialSearchTerm,
    initialPage,
    initialPageSize,
    initialMakeFilter,
    initialModelFilter,
    initialSubModelFilter,
    normalizedInitialSourceFilter,
    initialRiskFilter,
    initialDealFilter,
    initialMinimumScore,
    initialMinPrice,
    initialMaxPrice,
    initialPriceStatus,
    initialYearMin,
    initialYearMax,
    initialTotalTimeMin,
    initialTotalTimeMax,
    initialMaintenanceBand,
    initialEngineTime,
    initialTrueCostMin,
    initialTrueCostMax,
    initialCategoryFilter,
    initialSortBy,
    initialMinEngine,
    initialMinAvionics,
    initialMinQuality,
    initialMinMktValue,
    initialLocation,
    initialEngineLife,
    initialAvionics,
    initialDealPattern,
  ])

  useEffect(() => {
    if (
      filterOptions.makes.length > 0 ||
      filterOptions.models.length > 0 ||
      filterOptions.states.length > 0 ||
      filterOptions.modelPairs.length > 0
    ) {
      return
    }
    if (filterOptionsFetchCompletedRef.current) {
      return
    }
    filterOptionsFetchCompletedRef.current = true

    const loadFilterOptions = async () => {
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('fullhangar:navigation-loading-start'))
        }
        const response = await fetch('/api/listings/options', { cache: 'no-store' })
        const payload = await response.json()
        if (!response.ok || payload?.error) throw new Error(payload?.error ?? 'Unable to load options')
        const data = payload?.data ?? {}
        setFilterOptions({
          makes: Array.isArray(data.makes) ? data.makes : [],
          models: Array.isArray(data.models) ? data.models : [],
          states: Array.isArray(data.states) ? data.states : [],
          modelPairs: Array.isArray(data.modelPairs) ? data.modelPairs : [],
          modelPairLabels:
            data.modelPairLabels && typeof data.modelPairLabels === 'object' ? (data.modelPairLabels as Record<string, string>) : {},
          makeCounts: data.makeCounts && typeof data.makeCounts === 'object' ? data.makeCounts : {},
          modelCounts: data.modelCounts && typeof data.modelCounts === 'object' ? data.modelCounts : {},
          modelPairCounts: data.modelPairCounts && typeof data.modelPairCounts === 'object' ? data.modelPairCounts : {},
          sourceCounts: data.sourceCounts && typeof data.sourceCounts === 'object' ? data.sourceCounts : {},
          dealTierCounts: data.dealTierCounts && typeof data.dealTierCounts === 'object' ? data.dealTierCounts : {},
          minimumValueScoreCounts: data.minimumValueScoreCounts && typeof data.minimumValueScoreCounts === 'object' ? data.minimumValueScoreCounts : {},
        })
      } catch {
        // Keep empty options if request fails.
      } finally {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('fullhangar:navigation-loading-end'))
        }
      }
    }
    loadFilterOptions()
  }, [filterOptions])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const savedLayout = window.localStorage.getItem('listings_layout_mode')
    const savedSort = window.localStorage.getItem('listings_sort_by')
    if (savedLayout === 'tiles' || savedLayout === 'rows' || savedLayout === 'compact') {
      setLayoutMode(savedLayout)
    }
    const validSorts: SortOption[] = [
      'price_low', 'price_high', 'flip_desc', 'flip_asc', 'deal_desc',
      'market_best', 'market_worst', 'risk_low', 'risk_high',
      'deferred_low', 'deferred_high', 'tt_low', 'tt_high', 'year_newest', 'year_oldest', 'engine_life',
      'dom_asc', 'recent_add',
    ]
    if (canApplySavedSort && savedSort && validSorts.includes(savedSort as SortOption)) {
      setSortBy(savedSort as SortOption)
    }
  }, [canApplySavedSort])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('listings_layout_mode', layoutMode)
  }, [layoutMode])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('listings_sort_by', sortBy)
  }, [sortBy])

  const makeOptions = useMemo(() => filterOptions.makes, [filterOptions.makes])
  const modelPairCountMap = useMemo(() => filterOptions.modelPairCounts ?? {}, [filterOptions.modelPairCounts])

  const modelOptions = useMemo(() => {
    const pairs = makeFilter === 'all'
      ? filterOptions.modelPairs
      : filterOptions.modelPairs.filter((pair) => pair.make.toLowerCase() === makeFilter.toLowerCase())
    const families = Array.from(
      new Set(pairs.map((pair) => deriveModelFamily(String(pair.model ?? ''))).filter(Boolean))
    )
    const isBeech = makeFilter.toLowerCase() === 'beechcraft'
    const rows = families.map((token) => ({
      value: token,
      label: isBeech ? beechcraftFamilyTokenLabel(token) : token,
    }))
    return rows.sort((a, b) => a.label.localeCompare(b.label))
  }, [filterOptions.modelPairs, makeFilter])

  const subModelOptions = useMemo(() => {
    if (!modelFilter) return [] as Array<{ value: string; label: string }>
    const labels = filterOptions.modelPairLabels ?? {}
    const pairs = makeFilter === 'all'
      ? filterOptions.modelPairs
      : filterOptions.modelPairs.filter((pair) => pair.make.toLowerCase() === makeFilter.toLowerCase())
    const byValue = new Map<string, string>()
    for (const pair of pairs) {
      if (deriveModelFamily(String(pair.model ?? '')) !== modelFilter) continue
      const value = String(pair.model ?? '').trim()
      if (!value) continue
      const key = `${pair.make}|||${value}`
      const label = labels[key] ?? value
      const prev = byValue.get(value)
      if (prev === undefined || label.length > prev.length) {
        byValue.set(value, label)
      }
    }
    return Array.from(byValue.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [filterOptions.modelPairLabels, filterOptions.modelPairs, makeFilter, modelFilter])


  const categoryMenuData = useMemo(() => {
    const makeBuckets: Record<Exclude<CategoryValue, null>, Map<string, number>> = {
      single: new Map<string, number>(),
      multi: new Map<string, number>(),
      se_turboprop: new Map<string, number>(),
      me_turboprop: new Map<string, number>(),
      jet: new Map<string, number>(),
      helicopter: new Map<string, number>(),
      lsp: new Map<string, number>(),
      sea: new Map<string, number>(),
    }
    const categoryCounts: Record<Exclude<CategoryValue, null>, number> = {
      single: 0,
      multi: 0,
      se_turboprop: 0,
      me_turboprop: 0,
      jet: 0,
      helicopter: 0,
      lsp: 0,
      sea: 0,
    }

    for (const pair of filterOptions.modelPairs) {
      const make = String(pair.make ?? '').trim()
      const model = String(pair.model ?? '').trim()
      if (!make || !model) continue
      const pairCount = modelPairCountMap[`${make}|||${model}`] ?? 0
      if (pairCount <= 0) continue
      const normalizedMake = normalizeTopMenuMakeLabel(make, model)
      if (!normalizedMake) continue

      const categories = inferCategoriesForMakeModel(make, model)
      for (const category of categories) {
        makeBuckets[category].set(normalizedMake, (makeBuckets[category].get(normalizedMake) ?? 0) + pairCount)
        categoryCounts[category] += pairCount
      }
    }

    const makesByCategory = {
      single: Array.from(makeBuckets.single.entries())
        .filter(([, count]) => count > 0)
        .map(([make, count]) => ({ make, count }))
        .sort((a, b) => a.make.localeCompare(b.make)),
      multi: Array.from(makeBuckets.multi.entries())
        .filter(([, count]) => count > 0)
        .map(([make, count]) => ({ make, count }))
        .sort((a, b) => a.make.localeCompare(b.make)),
      se_turboprop: Array.from(makeBuckets.se_turboprop.entries())
        .filter(([, count]) => count > 0)
        .map(([make, count]) => ({ make, count }))
        .sort((a, b) => a.make.localeCompare(b.make)),
      me_turboprop: Array.from(makeBuckets.me_turboprop.entries())
        .filter(([, count]) => count > 0)
        .map(([make, count]) => ({ make, count }))
        .sort((a, b) => a.make.localeCompare(b.make)),
      jet: Array.from(makeBuckets.jet.entries())
        .filter(([, count]) => count > 0)
        .map(([make, count]) => ({ make, count }))
        .sort((a, b) => a.make.localeCompare(b.make)),
      helicopter: Array.from(makeBuckets.helicopter.entries())
        .filter(([, count]) => count > 0)
        .map(([make, count]) => ({ make, count }))
        .sort((a, b) => a.make.localeCompare(b.make)),
      lsp: Array.from(makeBuckets.lsp.entries())
        .filter(([, count]) => count > 0)
        .map(([make, count]) => ({ make, count }))
        .sort((a, b) => a.make.localeCompare(b.make)),
      sea: Array.from(makeBuckets.sea.entries())
        .filter(([, count]) => count > 0)
        .map(([make, count]) => ({ make, count }))
        .sort((a, b) => a.make.localeCompare(b.make)),
    }

    return { makesByCategory, categoryCounts }
  }, [filterOptions.modelPairs, modelPairCountMap])

  const categoryBarCounts = useMemo(() => {
    const c = categoryMenuData.categoryCounts
    return {
      all: totalFiltered,
      single: c.single,
      multi: c.multi,
      turboprop: (c.se_turboprop ?? 0) + (c.me_turboprop ?? 0),
      jet: c.jet,
      helicopter: c.helicopter,
    }
  }, [categoryMenuData.categoryCounts, totalFiltered])

  useEffect(() => {
    const s = searchParams.get('sortBy')
    if (!s) return
    const valid: SortOption[] = [
      'price_low',
      'price_high',
      'flip_desc',
      'flip_asc',
      'deal_desc',
      'market_best',
      'market_worst',
      'risk_low',
      'risk_high',
      'deferred_low',
      'deferred_high',
      'tt_low',
      'tt_high',
      'year_newest',
      'year_oldest',
      'engine_life',
      'dom_asc',
      'recent_add',
    ]
    const normalized = s === 'deal_desc' ? 'flip_desc' : s
    if (valid.includes(normalized as SortOption)) setSortBy(normalized as SortOption)
  }, [searchParamsKey, searchParams])

  useEffect(() => {
    const raw = searchParams.get('pageSize')
    if (!raw) return
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    const clamped = Math.min(48, Math.max(12, Math.floor(n)))
    setPageSize((prev) => (prev === clamped ? prev : clamped))
  }, [searchParamsKey, searchParams])

  useEffect(() => {
    setCurrentPage(1)
  }, [
    appliedSearchTerm,
    appliedMakeFilter,
    appliedModelFilter,
    appliedSubModelFilter,
    appliedSourceFilter,
    minimumScore,
    appliedMinPrice,
    appliedMaxPrice,
    appliedPriceStatus,
    appliedYearMin,
    appliedYearMax,
    appliedTotalTimeMin,
    appliedTotalTimeMax,
    appliedMaintenanceBand,
    appliedEngineTime,
    appliedTrueCostMin,
    appliedTrueCostMax,
    categoryFilter,
    appliedRiskFilter,
    dealFilter,
    pageSize,
    appliedPillarMinEngine,
    appliedPillarMinAvionics,
    appliedPillarMinQuality,
    appliedPillarMinMkt,
    appliedLocation,
    appliedEngineLife,
    appliedAvionics,
    appliedDealPattern,
  ])

  useEffect(() => {
    if (!hasSkippedInitialFetch.current) {
      hasSkippedInitialFetch.current = true
      return
    }

    const controller = new AbortController()
    const loadListings = async () => {
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('fullhangar:navigation-loading-start'))
        }
        setLoading(true)
        setFetchError(null)
        const params = new URLSearchParams()
        params.set('page', String(currentPage))
        params.set('pageSize', String(pageSize))
        params.set('sortBy', sortBy)
        if (appliedSearchTerm.trim()) params.set('q', appliedSearchTerm.trim())
        if (appliedMakeFilter !== 'all') params.set('make', appliedMakeFilter)
        if (appliedModelFilter.trim()) params.set('modelFamily', appliedModelFilter.trim())
        if (appliedSubModelFilter.trim()) params.set('subModel', appliedSubModelFilter.trim())
        if (appliedSourceFilter !== 'all') params.set('source', appliedSourceFilter)
        if (appliedRiskFilter !== 'all') params.set('risk', appliedRiskFilter)
        const urlParams =
          typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
        if (urlParams.get('dealScore')) {
          params.set('dealScore', urlParams.get('dealScore')!)
        } else if (dealFilter !== 'all') {
          params.set('dealTier', dealFilter)
        }
        if (minimumScore > 0) params.set('minValueScore', String(minimumScore))
        if (appliedMinPrice > 0) params.set('minPrice', String(appliedMinPrice))
        if (appliedMaxPrice > 0) params.set('maxPrice', String(appliedMaxPrice))
        if (appliedPriceStatus !== 'all') params.set('priceStatus', appliedPriceStatus)
        if (appliedYearMin > 0) params.set('yearMin', String(appliedYearMin))
        if (appliedYearMax > 0) params.set('yearMax', String(appliedYearMax))
        if (appliedTotalTimeMin > 0) params.set('totalTimeMin', String(appliedTotalTimeMin))
        if (appliedTotalTimeMax > 0) params.set('totalTimeMax', String(appliedTotalTimeMax))
        if (appliedMaintenanceBand !== 'any') params.set('maintenanceBand', appliedMaintenanceBand)
        if (appliedEngineLife.length === 0 && appliedEngineTime !== 'any') {
          params.set('engineTime', appliedEngineTime)
        }
        if (appliedTrueCostMin > 0) params.set('trueCostMin', String(appliedTrueCostMin))
        if (appliedTrueCostMax > 0) params.set('trueCostMax', String(appliedTrueCostMax))
        const categoryParam = categoryFilter || urlParams.get('category')
        if (categoryParam) params.set('category', categoryParam)
        for (const key of ['priceDropOnly', 'addedToday', 'hidePriceUndisclosed'] as const) {
          const v = urlParams.get(key)
          if (v) params.set(key, v)
        }
        const urlMax = urlParams.get('maxPrice')
        if (urlMax && !params.has('maxPrice')) params.set('maxPrice', urlMax)
        if (appliedLocation.trim()) params.set('location', appliedLocation.trim())
        if (appliedPillarMinEngine > 0) params.set('minEngine', String(appliedPillarMinEngine))
        if (appliedPillarMinAvionics > 0) params.set('minAvionics', String(appliedPillarMinAvionics))
        if (appliedPillarMinQuality > 0) params.set('minQuality', String(appliedPillarMinQuality))
        if (appliedPillarMinMkt > 0) params.set('minValue', String(appliedPillarMinMkt))
        const elCsv = appliedEngineLife.join(',')
        if (elCsv) params.set('engineLife', elCsv)
        const avCsv = appliedAvionics.join(',')
        if (avCsv) params.set('avionics', avCsv)
        const dpCsv = appliedDealPattern.join(',')
        if (dpCsv) params.set('dealPattern', dpCsv)
        const mv = urlParams.get('maxValueScore')
        if (mv) params.set('maxValueScore', mv)

        // If React state missed URL-driven filters (hydration/streaming), keep the address bar as source of truth.
        const listingKeysFromAddressBar = [
          'yearMin',
          'yearMax',
          'totalTimeMin',
          'totalTimeMax',
          'minEngine',
          'minAvionics',
          'minQuality',
          'minValue',
          'minValueScore',
          'maxValueScore',
          'engineLife',
          'avionics',
          'dealPattern',
          'maintenanceBand',
          'engineTime',
          'trueCostMin',
          'trueCostMax',
          'minPrice',
          'maxPrice',
          'priceStatus',
          'q',
          'make',
          'modelFamily',
          'subModel',
          'source',
          'risk',
          'dealTier',
          'category',
          'location',
        ] as const
        for (const key of listingKeysFromAddressBar) {
          const v = urlParams.get(key)
          if (v != null && v !== '' && !params.has(key)) params.set(key, v)
        }

        const response = await fetch(`/api/listings?${params.toString()}`, {
          signal: controller.signal,
          cache: 'no-store',
        })
        const payload = await response.json()
        if (!response.ok || payload?.error) throw new Error(payload?.error ?? 'Unable to load listings')
        const rows = Array.isArray(payload?.data) ? payload.data : []
        const total = Number(payload?.meta?.total ?? rows.length)
        setListings(rows)
        setTotalFiltered(Number.isFinite(total) ? total : rows.length)
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
        setFetchError(error instanceof Error ? error.message : 'Unable to load listings')
        setListings([])
        setTotalFiltered(0)
      } finally {
        setLoading(false)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('fullhangar:navigation-loading-end'))
        }
      }
    }

    loadListings()
    return () => controller.abort()
  }, [
    appliedSearchTerm,
    currentPage,
    pageSize,
    appliedMakeFilter,
    appliedModelFilter,
    appliedSubModelFilter,
    appliedSourceFilter,
    appliedRiskFilter,
    dealFilter,
    minimumScore,
    appliedMinPrice,
    appliedMaxPrice,
    appliedPriceStatus,
    appliedYearMin,
    appliedYearMax,
    appliedTotalTimeMin,
    appliedTotalTimeMax,
    appliedMaintenanceBand,
    appliedEngineTime,
    appliedTrueCostMin,
    appliedTrueCostMax,
    categoryFilter,
    sortBy,
    searchParamsKey,
    appliedPillarMinEngine,
    appliedPillarMinAvionics,
    appliedPillarMinQuality,
    appliedPillarMinMkt,
    appliedLocation,
    appliedEngineLife,
    appliedAvionics,
    appliedDealPattern,
  ])

  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const listingsReturnTo = useMemo(() => {
    const params = new URLSearchParams()
    if (appliedSearchTerm.trim()) params.set('q', appliedSearchTerm.trim())
    if (categoryFilter) params.set('category', categoryFilter)
    if (dealFilter !== 'all') params.set('dealTier', dealFilter)
    if (sortBy !== 'flip_desc' && sortBy !== 'deal_desc') params.set('sortBy', sortBy)
    if (appliedMakeFilter !== 'all') params.set('make', appliedMakeFilter)
    if (appliedModelFilter.trim()) params.set('modelFamily', appliedModelFilter.trim())
    if (appliedSubModelFilter.trim()) params.set('subModel', appliedSubModelFilter.trim())
    if (appliedSourceFilter !== 'all') params.set('source', appliedSourceFilter)
    if (appliedRiskFilter !== 'all') params.set('risk', appliedRiskFilter)
    if (minimumScore > 0) params.set('minValueScore', String(minimumScore))
    if (appliedMinPrice > 0) params.set('minPrice', String(appliedMinPrice))
    if (appliedMaxPrice > 0) params.set('maxPrice', String(appliedMaxPrice))
    if (appliedPriceStatus !== 'all') params.set('priceStatus', appliedPriceStatus)
    if (appliedYearMin > 0) params.set('yearMin', String(appliedYearMin))
    if (appliedYearMax > 0) params.set('yearMax', String(appliedYearMax))
    if (appliedTotalTimeMin > 0) params.set('totalTimeMin', String(appliedTotalTimeMin))
    if (appliedTotalTimeMax > 0) params.set('totalTimeMax', String(appliedTotalTimeMax))
    if (appliedMaintenanceBand !== 'any') params.set('maintenanceBand', appliedMaintenanceBand)
    if (appliedEngineLife.length === 0 && appliedEngineTime !== 'any') {
      params.set('engineTime', appliedEngineTime)
    }
    if (appliedTrueCostMin > 0) params.set('trueCostMin', String(appliedTrueCostMin))
    if (appliedTrueCostMax > 0) params.set('trueCostMax', String(appliedTrueCostMax))
    if (appliedLocation.trim()) params.set('location', appliedLocation.trim())
    if (appliedPillarMinEngine > 0) params.set('minEngine', String(appliedPillarMinEngine))
    if (appliedPillarMinAvionics > 0) params.set('minAvionics', String(appliedPillarMinAvionics))
    if (appliedPillarMinQuality > 0) params.set('minQuality', String(appliedPillarMinQuality))
    if (appliedPillarMinMkt > 0) params.set('minValue', String(appliedPillarMinMkt))
    if (appliedEngineLife.length) params.set('engineLife', appliedEngineLife.join(','))
    if (appliedAvionics.length) params.set('avionics', appliedAvionics.join(','))
    if (appliedDealPattern.length) params.set('dealPattern', appliedDealPattern.join(','))
    if (safePage > 1) params.set('page', String(safePage))
    if (pageSize !== 24) params.set('pageSize', String(pageSize))
    mergeListingsUrlSnapshot(params, searchParams)
    return `/listings${params.toString() ? `?${params.toString()}` : ''}`
  }, [
    appliedSearchTerm,
    categoryFilter,
    dealFilter,
    sortBy,
    appliedMakeFilter,
    appliedModelFilter,
    appliedSubModelFilter,
    appliedSourceFilter,
    appliedRiskFilter,
    minimumScore,
    appliedMinPrice,
    appliedMaxPrice,
    appliedPriceStatus,
    appliedYearMin,
    appliedYearMax,
    appliedTotalTimeMin,
    appliedTotalTimeMax,
    appliedMaintenanceBand,
    appliedEngineTime,
    appliedTrueCostMin,
    appliedTrueCostMax,
    safePage,
    pageSize,
    searchParamsKey,
    searchParams,
    appliedPillarMinEngine,
    appliedPillarMinAvionics,
    appliedPillarMinQuality,
    appliedPillarMinMkt,
    appliedLocation,
    appliedEngineLife,
    appliedAvionics,
    appliedDealPattern,
  ])
  const buildPageHref = (page: number) => {
    const params = new URLSearchParams()
    if (appliedSearchTerm.trim()) params.set('q', appliedSearchTerm.trim())
    if (categoryFilter) params.set('category', categoryFilter)
    if (dealFilter !== 'all') params.set('dealTier', dealFilter)
    if (sortBy !== 'flip_desc' && sortBy !== 'deal_desc') params.set('sortBy', sortBy)
    if (appliedMakeFilter !== 'all') params.set('make', appliedMakeFilter)
    if (appliedModelFilter.trim()) params.set('modelFamily', appliedModelFilter.trim())
    if (appliedSubModelFilter.trim()) params.set('subModel', appliedSubModelFilter.trim())
    if (appliedSourceFilter !== 'all') params.set('source', appliedSourceFilter)
    if (appliedRiskFilter !== 'all') params.set('risk', appliedRiskFilter)
    if (minimumScore > 0) params.set('minValueScore', String(minimumScore))
    if (appliedMinPrice > 0) params.set('minPrice', String(appliedMinPrice))
    if (appliedMaxPrice > 0) params.set('maxPrice', String(appliedMaxPrice))
    if (appliedPriceStatus !== 'all') params.set('priceStatus', appliedPriceStatus)
    if (appliedYearMin > 0) params.set('yearMin', String(appliedYearMin))
    if (appliedYearMax > 0) params.set('yearMax', String(appliedYearMax))
    if (appliedTotalTimeMin > 0) params.set('totalTimeMin', String(appliedTotalTimeMin))
    if (appliedTotalTimeMax > 0) params.set('totalTimeMax', String(appliedTotalTimeMax))
    if (appliedMaintenanceBand !== 'any') params.set('maintenanceBand', appliedMaintenanceBand)
    if (appliedEngineLife.length === 0 && appliedEngineTime !== 'any') {
      params.set('engineTime', appliedEngineTime)
    }
    if (appliedTrueCostMin > 0) params.set('trueCostMin', String(appliedTrueCostMin))
    if (appliedTrueCostMax > 0) params.set('trueCostMax', String(appliedTrueCostMax))
    if (appliedLocation.trim()) params.set('location', appliedLocation.trim())
    if (appliedPillarMinEngine > 0) params.set('minEngine', String(appliedPillarMinEngine))
    if (appliedPillarMinAvionics > 0) params.set('minAvionics', String(appliedPillarMinAvionics))
    if (appliedPillarMinQuality > 0) params.set('minQuality', String(appliedPillarMinQuality))
    if (appliedPillarMinMkt > 0) params.set('minValue', String(appliedPillarMinMkt))
    if (appliedEngineLife.length) params.set('engineLife', appliedEngineLife.join(','))
    if (appliedAvionics.length) params.set('avionics', appliedAvionics.join(','))
    if (appliedDealPattern.length) params.set('dealPattern', appliedDealPattern.join(','))
    if (page > 1) params.set('page', String(page))
    if (pageSize !== 24) params.set('pageSize', String(pageSize))
    mergeListingsUrlSnapshot(params, searchParams)
    return `/listings${params.toString() ? `?${params.toString()}` : ''}`
  }
  const paginatedListings = listings
  const prioritizedListings = useMemo(() => {
    const rows = [...paginatedListings]
    const preferredSlots = layoutMode === 'tiles' ? 6 : 2
    if (rows.length <= preferredSlots) return rows

    const hasPhoto = (listing: any) => collectImageCandidates(listing).length > 0
    const firstBlock = rows.slice(0, preferredSlots)
    const remaining = rows.slice(preferredSlots)
    const photoPool = remaining.filter(hasPhoto)
    if (!photoPool.length) return rows

    const rebuiltFirst = [...firstBlock]
    for (let i = 0; i < rebuiltFirst.length && photoPool.length > 0; i += 1) {
      if (!hasPhoto(rebuiltFirst[i])) {
        rebuiltFirst[i] = photoPool.shift() as any
      }
    }

    const usedIds = new Set(rebuiltFirst.map((item) => String(item?.id ?? item?.source_id ?? '')))
    const rebuiltRemaining = rows.filter((item) => !usedIds.has(String(item?.id ?? item?.source_id ?? '')))
    return [...rebuiltFirst, ...rebuiltRemaining]
  }, [paginatedListings, layoutMode])

  const noPriceDividerIndex = useMemo(() => {
    return prioritizedListings.findIndex((l) => {
      const p = l?.asking_price
      return p == null || (typeof p === 'number' && p <= 0)
    })
  }, [prioritizedListings])

  const noPriceCountOnPage = useMemo(() => {
    return prioritizedListings.filter((l) => {
      const p = l?.asking_price
      return p == null || (typeof p === 'number' && p <= 0)
    }).length
  }, [prioritizedListings])

  const renderListingCard = (l: any, mode: LayoutMode, listingIndex = 0) => {
    const listingKey = String(l.source_id ?? l.id)
    const detailHref = `/listings/${l.source_id ?? l.id}?returnTo=${encodeURIComponent(listingsReturnTo)}`
    const imageCandidates = collectImageCandidates(l)
    const currentImageIndex = imageCursor[listingKey] ?? 0
    const imageUrl = imageCandidates[currentImageIndex] ?? ''
    const rawTail = String(l.n_number ?? '').trim().toUpperCase()
    const tailText = rawTail ? (rawTail.startsWith('N') ? rawTail : `N${rawTail}`) : 'N/A'
    const rawYear = typeof l.year === 'number' ? String(l.year) : String(l.year ?? '').trim()
    const rawMake = String(l.make ?? '').trim()
    const rawModel = String(l.model ?? '').trim()
    const primaryTitle = [rawYear, rawMake, rawModel].filter(Boolean).join(' ').trim()
    const fallbackTitle = [rawMake, rawModel].filter(Boolean).join(' ').trim()
    const titleText =
      primaryTitle && !/^\d+\.?$/.test(primaryTitle)
        ? primaryTitle
        : (fallbackTitle || 'Aircraft Listing')
    const priceText = formatPriceOrCall(typeof l.asking_price === 'number' ? l.asking_price : null)
    const isFractional = l.is_fractional_ownership === true
    const sharePriceText =
      typeof l.fractional_share_price === 'number' && l.fractional_share_price > 0
        ? formatPriceOrCall(l.fractional_share_price)
        : 'N/A'
    const ownershipBadgeText = isFractional ? 'Fractional' : undefined
    const locationText = l.location_label ?? 'Location unavailable'
    const flipScoreText = formatScore(typeof l.flip_score === 'number' ? l.flip_score : null)
    const evPctLifeRemainingRaw = typeof l.ev_pct_life_remaining === 'number' ? l.ev_pct_life_remaining : null
    const evHoursRemainingRaw = typeof l.ev_hours_remaining === 'number' ? l.ev_hours_remaining : null
    const evHoursSmohRaw =
      typeof l.ev_hours_smoh === 'number'
        ? l.ev_hours_smoh
        : typeof l.engine_hours_smoh === 'number'
          ? l.engine_hours_smoh
          : typeof l.time_since_overhaul === 'number'
            ? l.time_since_overhaul
            : null
    const evDataQuality = String(l.ev_data_quality ?? '').trim().toLowerCase()
    const evPctLifeRemaining =
      typeof evPctLifeRemainingRaw === 'number' && Number.isFinite(evPctLifeRemainingRaw)
        ? evPctLifeRemainingRaw
        : 0
    const hasEngineBadgeData =
      evDataQuality !== 'none' &&
      typeof evHoursSmohRaw === 'number' &&
      Number.isFinite(evHoursSmohRaw) &&
      evHoursSmohRaw >= 0 &&
      typeof evPctLifeRemainingRaw === 'number' &&
      Number.isFinite(evPctLifeRemainingRaw)
    const isPastTbo = typeof evHoursRemainingRaw === 'number' && evHoursRemainingRaw < 0
    const isOverdue = hasEngineBadgeData && (isPastTbo || evPctLifeRemaining < 0.05)
    const badgeBaseClass = isOverdue
      ? 'border-red-500 bg-red-500/15 text-red-300'
      : evPctLifeRemaining >= 0.75
        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
        : evPctLifeRemaining >= 0.5
          ? 'border-emerald-400 bg-emerald-400/10 text-emerald-200'
          : evPctLifeRemaining >= 0.25
            ? 'border-amber-500 bg-amber-500/15 text-amber-300'
            : 'border-orange-500 bg-orange-500/15 text-orange-300'
    const hoursRemainingRounded =
      typeof evHoursRemainingRaw === 'number' && Number.isFinite(evHoursRemainingRaw)
        ? Math.max(0, Math.round(evHoursRemainingRaw))
        : null
    const fullEngineBadgeText = !hasEngineBadgeData
      ? undefined
      : isOverdue
        ? 'Engine: Overdue'
        : evPctLifeRemaining >= 0.75
          ? 'Engine: Fresh'
          : evPctLifeRemaining >= 0.5
            ? 'Engine: Mid-life'
            : evPctLifeRemaining >= 0.25
              ? `Engine: ${hoursRemainingRounded?.toLocaleString('en-US') ?? '0'}hrs left`
              : 'Engine: Low'
    const compactEngineBadgeText = !hasEngineBadgeData
      ? undefined
      : isOverdue
        ? '⚠ Overdue'
        : evPctLifeRemaining >= 0.75
          ? '●'
          : evPctLifeRemaining >= 0.25
            ? `~${hoursRemainingRounded?.toLocaleString('en-US') ?? '0'}hrs`
            : 'Low'

    const domDisplay =
      typeof l.days_on_market === 'number' && Number.isFinite(l.days_on_market) && l.days_on_market >= 0
        ? `${Math.round(l.days_on_market)}d`
        : '—'
    const sourceDisplay = formatListingSourceLabel(String(l.source ?? 'unknown'))
    const ttafDisplay = formatHours(typeof l.total_time_airframe === 'number' ? l.total_time_airframe : null)

    const specRows: Array<[string, string]> =
      mode === 'compact'
        ? isFractional
          ? [
              ['N-Number', tailText],
              ['Price', priceText],
              ['Share Price', sharePriceText],
              ['TTAF', ttafDisplay],
              ['DOM', domDisplay],
              ['Flip score', flipScoreText],
              ['Source', sourceDisplay],
            ]
          : [
              ['N-Number', tailText],
              ['Price', priceText],
              ['TTAF', ttafDisplay],
              ['DOM', domDisplay],
              ['Flip score', flipScoreText],
              ['Source', sourceDisplay],
            ]
        : [
            ['N-Number', tailText],
            ['Price', priceText],
            ...(isFractional ? [['Share Price', sharePriceText] as [string, string]] : []),
            ['Flip score', flipScoreText],
          ]

    const askingNum = typeof l.asking_price === 'number' ? l.asking_price : null
    const hasDisclosedPrice = askingNum != null && askingNum > 0
    const imagePriority =
      (mode === 'tiles' && listingIndex < 12) ||
      (mode === 'rows' && listingIndex < 4) ||
      (mode === 'compact' && listingIndex < 10)

    const tileMeta = {
      hasDisclosedPrice,
      daysOnMarket: typeof l.days_on_market === 'number' ? l.days_on_market : null,
      priceReduced: l.price_reduced === true,
      priceReductionAmount: typeof l.price_reduction_amount === 'number' ? l.price_reduction_amount : null,
      trueCost: typeof l.true_cost === 'number' ? l.true_cost : null,
      askingPrice: hasDisclosedPrice ? askingNum : null,
      flipScore: typeof l.flip_score === 'number' ? l.flip_score : null,
      engineScore: typeof l.engine_score === 'number' ? l.engine_score : null,
      avionicsScore: typeof l.avionics_score === 'number' ? l.avionics_score : null,
      qualityScore: typeof l.condition_score === 'number' ? l.condition_score : null,
      marketValueScore: typeof l.market_opportunity_score === 'number' ? l.market_opportunity_score : null,
      executionScore: typeof l.execution_score === 'number' ? l.execution_score : null,
      totalTimeAirframe: typeof l.total_time_airframe === 'number' ? l.total_time_airframe : null,
      engineSmoh: typeof evHoursSmohRaw === 'number' ? evHoursSmohRaw : null,
      engineLifePct:
        typeof evPctLifeRemainingRaw === 'number' && Number.isFinite(evPctLifeRemainingRaw)
          ? evPctLifeRemainingRaw
          : null,
      engineModelLabel: null,
      sourceKey: String(l.source ?? 'unknown'),
      faaMatched: l.faa_matched === true,
    }

    return (
      <ListingCard
        key={listingKey}
        listingKey={listingKey}
        detailHref={detailHref}
        mode={mode}
        imageUrl={imageUrl}
        titleText={titleText}
        locationText={locationText}
        ownershipBadgeText={ownershipBadgeText}
        engineBadgeText={mode === 'compact' ? compactEngineBadgeText : fullEngineBadgeText}
        engineBadgeTitle={fullEngineBadgeText}
        engineBadgeClass={hasEngineBadgeData ? badgeBaseClass : undefined}
        flipTier={typeof l.flip_tier === 'string' ? l.flip_tier : null}
        specRows={specRows}
        tileStaggerIndex={listingIndex}
        tileMeta={tileMeta}
        imagePriority={imagePriority}
        onImageError={() => {
          setImageCursor((prev) => ({ ...prev, [listingKey]: currentImageIndex + 1 }))
        }}
      />
    )
  }

  if (loading) return <div className="text-brand-muted">Loading listings...</div>

  return (
    <div>
      <Suspense
        fallback={<div className="min-h-[80px] border-b border-[var(--fh-border)] bg-[var(--fh-bg)]" aria-hidden />}
      >
        <DealTierBar />
        <PillarLegendBar />
      </Suspense>
      <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <div className="hidden min-w-0 overflow-x-hidden md:block md:sticky md:top-[64px] md:self-start md:border-r md:border-[var(--fh-border)] md:bg-[var(--fh-bg2)] md:py-2.5 md:pr-2">
          <ListingsFiltersSidebar
            categoryBarCounts={categoryBarCounts}
            urlCategory={urlCategoryLower}
            urlMaxPrice={urlMaxPriceParam}
            urlPriceDropOnly={urlPriceDropOnlyParam}
            urlAddedToday={urlAddedTodayParam}
            onCategoryNav={onCategoryNav}
            categoryAccordionInitiallyOpen={categoryAccordionInitiallyOpen}
            pillarMinEngine={pillarMinEngine}
            setPillarMinEngine={setPillarMinEngine}
            pillarMinAvionics={pillarMinAvionics}
            setPillarMinAvionics={setPillarMinAvionics}
            pillarMinQuality={pillarMinQuality}
            setPillarMinQuality={setPillarMinQuality}
            pillarMinMkt={pillarMinMkt}
            setPillarMinMkt={setPillarMinMkt}
            engineLifeTokens={engineLifeDraft}
            setEngineLifeTokens={setEngineLifeDraft}
            dealPatternTokens={dealPatternDraft}
            setDealPatternTokens={setDealPatternDraft}
            makeFilter={makeFilter}
            setMakeFilter={setMakeFilter}
            modelFilter={modelFilter}
            setModelFilter={setModelFilter}
            subModelFilter={subModelFilter}
            setSubModelFilter={setSubModelFilter}
            dealFilter={dealFilter}
            setDealFilter={setDealFilter}
            priceStatus={priceStatus}
            setPriceStatus={setPriceStatus}
            minPrice={minPrice}
            setMinPrice={setMinPrice}
            maxPrice={maxPrice}
            setMaxPrice={setMaxPrice}
            yearMin={yearMin}
            setYearMin={setYearMin}
            yearMax={yearMax}
            setYearMax={setYearMax}
            totalTimeMin={totalTimeMin}
            setTotalTimeMin={setTotalTimeMin}
            totalTimeMax={totalTimeMax}
            setTotalTimeMax={setTotalTimeMax}
            maintenanceBand={maintenanceBand}
            setMaintenanceBand={setMaintenanceBand}
            engineTime={engineTime}
            setEngineTime={setEngineTime}
            trueCostMin={trueCostMin}
            setTrueCostMin={setTrueCostMin}
            trueCostMax={trueCostMax}
            setTrueCostMax={setTrueCostMax}
            riskFilter={riskFilter}
            setRiskFilter={setRiskFilter}
            makeOptions={makeOptions}
            modelOptions={modelOptions}
            subModelOptions={subModelOptions}
            onResetFilters={() => {
              setMakeFilter('all')
              setModelFilter('')
              setSubModelFilter('')
              setSourceFilter('all')
              setDealFilter('all')
              setPriceStatus('all')
              setMinPrice(0)
              setMaxPrice(0)
              setYearMin(0)
              setYearMax(0)
              setTotalTimeMin(0)
              setTotalTimeMax(0)
              setMaintenanceBand('any')
              setEngineTime('any')
              setTrueCostMin(0)
              setTrueCostMax(0)
              setRiskFilter('all')
              setPillarMinEngine(0)
              setPillarMinAvionics(0)
              setPillarMinQuality(0)
              setPillarMinMkt(0)
              setLocationDraft('')
              setEngineLifeDraft([])
              setAvionicsDraft([])
              setDealPatternDraft([])
            }}
            onApplyFilters={() => {
              setAppliedMakeFilter(makeFilter)
              setAppliedModelFilter(modelFilter)
              setAppliedSubModelFilter(subModelFilter)
              setAppliedSourceFilter(sourceFilter)
              setAppliedRiskFilter(riskFilter)
              setAppliedMinPrice(minPrice)
              setAppliedMaxPrice(maxPrice)
              setAppliedPriceStatus(priceStatus)
              setAppliedYearMin(yearMin)
              setAppliedYearMax(yearMax)
              setAppliedTotalTimeMin(totalTimeMin)
              setAppliedTotalTimeMax(totalTimeMax)
              setAppliedMaintenanceBand(maintenanceBand)
              setAppliedEngineTime(engineTime)
              setAppliedTrueCostMin(trueCostMin)
              setAppliedTrueCostMax(trueCostMax)
              setAppliedPillarMinEngine(normalizeListingPillarMin(pillarMinEngine))
              setAppliedPillarMinAvionics(normalizeListingPillarMin(pillarMinAvionics))
              setAppliedPillarMinQuality(normalizeListingPillarMin(pillarMinQuality))
              setAppliedPillarMinMkt(normalizeListingPillarMin(pillarMinMkt))
              setAppliedLocation(locationDraft.trim())
              setAppliedEngineLife([...new Set(engineLifeDraft)].sort())
              setAppliedAvionics([...new Set(avionicsDraft)].sort())
              setAppliedDealPattern([...new Set(dealPatternDraft)].sort())
              setCurrentPage(1)
              commitListingsUrl(
                makeAppliedUrlSnapshot({
                  page: 1,
                  makeFilter,
                  modelFilter,
                  subModelFilter,
                  sourceFilter,
                  riskFilter,
                  minPrice,
                  maxPrice,
                  priceStatus,
                  yearMin,
                  yearMax,
                  totalTimeMin,
                  totalTimeMax,
                  maintenanceBand,
                  engineTime,
                  engineLife: [...new Set(engineLifeDraft)].sort(),
                  trueCostMin,
                  trueCostMax,
                  pillarMinEngine: normalizeListingPillarMin(pillarMinEngine),
                  pillarMinAvionics: normalizeListingPillarMin(pillarMinAvionics),
                  pillarMinQuality: normalizeListingPillarMin(pillarMinQuality),
                  pillarMinMkt: normalizeListingPillarMin(pillarMinMkt),
                  location: locationDraft.trim(),
                  avionics: [...new Set(avionicsDraft)].sort(),
                  dealPattern: [...new Set(dealPatternDraft)].sort(),
                })
              )
            }}
            riskTooltip={(
              <InfoTooltip
                title="Risk Level"
                body="Overall downside-risk flag (LOW/MODERATE/HIGH/CRITICAL) driven by maintenance burden, registration/safety alerts, and condition signals. Critical issues cap upside and push listings down the queue."
              />
            )}
          />
        </div>
        <FilterDrawer
          open={filterDrawerOpen}
          onClose={() => setFilterDrawerOpen(false)}
          onApply={() => {
            setAppliedMakeFilter(makeFilter)
            setAppliedModelFilter(modelFilter)
            setAppliedSubModelFilter(subModelFilter)
            setAppliedSourceFilter(sourceFilter)
            setAppliedRiskFilter(riskFilter)
            setAppliedMinPrice(minPrice)
            setAppliedMaxPrice(maxPrice)
            setAppliedPriceStatus(priceStatus)
            setAppliedYearMin(yearMin)
            setAppliedYearMax(yearMax)
            setAppliedTotalTimeMin(totalTimeMin)
            setAppliedTotalTimeMax(totalTimeMax)
            setAppliedMaintenanceBand(maintenanceBand)
            setAppliedEngineTime(engineTime)
            setAppliedTrueCostMin(trueCostMin)
            setAppliedTrueCostMax(trueCostMax)
            setAppliedPillarMinEngine(normalizeListingPillarMin(pillarMinEngine))
            setAppliedPillarMinAvionics(normalizeListingPillarMin(pillarMinAvionics))
            setAppliedPillarMinQuality(normalizeListingPillarMin(pillarMinQuality))
            setAppliedPillarMinMkt(normalizeListingPillarMin(pillarMinMkt))
            setAppliedLocation(locationDraft.trim())
            setAppliedEngineLife([...new Set(engineLifeDraft)].sort())
            setAppliedAvionics([...new Set(avionicsDraft)].sort())
            setAppliedDealPattern([...new Set(dealPatternDraft)].sort())
            setCurrentPage(1)
            commitListingsUrl(
              makeAppliedUrlSnapshot({
                page: 1,
                makeFilter,
                modelFilter,
                subModelFilter,
                sourceFilter,
                riskFilter,
                minPrice,
                maxPrice,
                priceStatus,
                yearMin,
                yearMax,
                totalTimeMin,
                totalTimeMax,
                maintenanceBand,
                engineTime,
                engineLife: [...new Set(engineLifeDraft)].sort(),
                trueCostMin,
                trueCostMax,
                pillarMinEngine: normalizeListingPillarMin(pillarMinEngine),
                pillarMinAvionics: normalizeListingPillarMin(pillarMinAvionics),
                pillarMinQuality: normalizeListingPillarMin(pillarMinQuality),
                pillarMinMkt: normalizeListingPillarMin(pillarMinMkt),
                location: locationDraft.trim(),
                avionics: [...new Set(avionicsDraft)].sort(),
                dealPattern: [...new Set(dealPatternDraft)].sort(),
              })
            )
          }}
          onClearAll={() => {
            setCategoryFilter(null)
            setMakeFilter('all')
            setModelFilter('')
            setSubModelFilter('')
            setSourceFilter('all')
            setDealFilter('all')
            setPriceStatus('all')
            setMinPrice(0)
            setMaxPrice(0)
            setYearMin(0)
            setYearMax(0)
            setTotalTimeMin(0)
            setTotalTimeMax(0)
            setMaintenanceBand('any')
            setEngineTime('any')
            setTrueCostMin(0)
            setTrueCostMax(0)
            setRiskFilter('all')
            setMinimumScore(0)
            setPillarMinEngine(0)
            setPillarMinAvionics(0)
            setPillarMinQuality(0)
            setPillarMinMkt(0)
            setAppliedPillarMinEngine(0)
            setAppliedPillarMinAvionics(0)
            setAppliedPillarMinQuality(0)
            setAppliedPillarMinMkt(0)
            setLocationDraft('')
            setAppliedLocation('')
            setEngineLifeDraft([])
            setAppliedEngineLife([])
            setAvionicsDraft([])
            setAppliedAvionics([])
            setDealPatternDraft([])
            setAppliedDealPattern([])
            setAppliedMakeFilter('all')
            setAppliedModelFilter('')
            setAppliedSubModelFilter('')
            setAppliedSourceFilter('all')
            setAppliedRiskFilter('all')
            setAppliedMinPrice(0)
            setAppliedMaxPrice(0)
            setAppliedPriceStatus('all')
            setAppliedYearMin(0)
            setAppliedYearMax(0)
            setAppliedTotalTimeMin(0)
            setAppliedTotalTimeMax(0)
            setAppliedMaintenanceBand('any')
            setAppliedEngineTime('any')
            setAppliedTrueCostMin(0)
            setAppliedTrueCostMax(0)
            setCurrentPage(1)
            commitListingsUrl(
              {
                page: 1,
                pageSize,
                sortBy,
                q: '',
                categoryFilter: null,
                makeFilter: 'all',
                modelFilter: '',
                subModelFilter: '',
                sourceFilter: 'all',
                riskFilter: 'all',
                dealFilter: 'all',
                minimumScore: 0,
                minPrice: 0,
                maxPrice: 0,
                priceStatus: 'all',
                yearMin: 0,
                yearMax: 0,
                totalTimeMin: 0,
                totalTimeMax: 0,
                maintenanceBand: 'any',
                engineTime: 'any',
                engineLife: [],
                trueCostMin: 0,
                trueCostMax: 0,
                pillarMinEngine: 0,
                pillarMinAvionics: 0,
                pillarMinQuality: 0,
                pillarMinMkt: 0,
                location: '',
                avionics: [],
                dealPattern: [],
              },
              { preserveNavExtras: false }
            )
          }}
        >
          <ListingsFiltersSidebar
            embedded
            categoryBarCounts={categoryBarCounts}
            urlCategory={urlCategoryLower}
            urlMaxPrice={urlMaxPriceParam}
            urlPriceDropOnly={urlPriceDropOnlyParam}
            urlAddedToday={urlAddedTodayParam}
            onCategoryNav={onCategoryNav}
            categoryAccordionInitiallyOpen={categoryAccordionInitiallyOpen}
            pillarMinEngine={pillarMinEngine}
            setPillarMinEngine={setPillarMinEngine}
            pillarMinAvionics={pillarMinAvionics}
            setPillarMinAvionics={setPillarMinAvionics}
            pillarMinQuality={pillarMinQuality}
            setPillarMinQuality={setPillarMinQuality}
            pillarMinMkt={pillarMinMkt}
            setPillarMinMkt={setPillarMinMkt}
            engineLifeTokens={engineLifeDraft}
            setEngineLifeTokens={setEngineLifeDraft}
            dealPatternTokens={dealPatternDraft}
            setDealPatternTokens={setDealPatternDraft}
            makeFilter={makeFilter}
            setMakeFilter={setMakeFilter}
            modelFilter={modelFilter}
            setModelFilter={setModelFilter}
            subModelFilter={subModelFilter}
            setSubModelFilter={setSubModelFilter}
            dealFilter={dealFilter}
            setDealFilter={setDealFilter}
            priceStatus={priceStatus}
            setPriceStatus={setPriceStatus}
            minPrice={minPrice}
            setMinPrice={setMinPrice}
            maxPrice={maxPrice}
            setMaxPrice={setMaxPrice}
            yearMin={yearMin}
            setYearMin={setYearMin}
            yearMax={yearMax}
            setYearMax={setYearMax}
            totalTimeMin={totalTimeMin}
            setTotalTimeMin={setTotalTimeMin}
            totalTimeMax={totalTimeMax}
            setTotalTimeMax={setTotalTimeMax}
            maintenanceBand={maintenanceBand}
            setMaintenanceBand={setMaintenanceBand}
            engineTime={engineTime}
            setEngineTime={setEngineTime}
            trueCostMin={trueCostMin}
            setTrueCostMin={setTrueCostMin}
            trueCostMax={trueCostMax}
            setTrueCostMax={setTrueCostMax}
            riskFilter={riskFilter}
            setRiskFilter={setRiskFilter}
            makeOptions={makeOptions}
            modelOptions={modelOptions}
            subModelOptions={subModelOptions}
            onResetFilters={() => {
              setMakeFilter('all')
              setModelFilter('')
              setSubModelFilter('')
              setSourceFilter('all')
              setDealFilter('all')
              setPriceStatus('all')
              setMinPrice(0)
              setMaxPrice(0)
              setYearMin(0)
              setYearMax(0)
              setTotalTimeMin(0)
              setTotalTimeMax(0)
              setMaintenanceBand('any')
              setEngineTime('any')
              setTrueCostMin(0)
              setTrueCostMax(0)
              setRiskFilter('all')
              setPillarMinEngine(0)
              setPillarMinAvionics(0)
              setPillarMinQuality(0)
              setPillarMinMkt(0)
              setLocationDraft('')
              setEngineLifeDraft([])
              setAvionicsDraft([])
              setDealPatternDraft([])
            }}
            onApplyFilters={() => {
              setAppliedMakeFilter(makeFilter)
              setAppliedModelFilter(modelFilter)
              setAppliedSubModelFilter(subModelFilter)
              setAppliedSourceFilter(sourceFilter)
              setAppliedRiskFilter(riskFilter)
              setAppliedMinPrice(minPrice)
              setAppliedMaxPrice(maxPrice)
              setAppliedPriceStatus(priceStatus)
              setAppliedYearMin(yearMin)
              setAppliedYearMax(yearMax)
              setAppliedTotalTimeMin(totalTimeMin)
              setAppliedTotalTimeMax(totalTimeMax)
              setAppliedMaintenanceBand(maintenanceBand)
              setAppliedEngineTime(engineTime)
              setAppliedTrueCostMin(trueCostMin)
              setAppliedTrueCostMax(trueCostMax)
              setAppliedPillarMinEngine(normalizeListingPillarMin(pillarMinEngine))
              setAppliedPillarMinAvionics(normalizeListingPillarMin(pillarMinAvionics))
              setAppliedPillarMinQuality(normalizeListingPillarMin(pillarMinQuality))
              setAppliedPillarMinMkt(normalizeListingPillarMin(pillarMinMkt))
              setAppliedLocation(locationDraft.trim())
              setAppliedEngineLife([...new Set(engineLifeDraft)].sort())
              setAppliedAvionics([...new Set(avionicsDraft)].sort())
              setAppliedDealPattern([...new Set(dealPatternDraft)].sort())
              setCurrentPage(1)
              commitListingsUrl(
                makeAppliedUrlSnapshot({
                  page: 1,
                  makeFilter,
                  modelFilter,
                  subModelFilter,
                  sourceFilter,
                  riskFilter,
                  minPrice,
                  maxPrice,
                  priceStatus,
                  yearMin,
                  yearMax,
                  totalTimeMin,
                  totalTimeMax,
                  maintenanceBand,
                  engineTime,
                  engineLife: [...new Set(engineLifeDraft)].sort(),
                  trueCostMin,
                  trueCostMax,
                  pillarMinEngine: normalizeListingPillarMin(pillarMinEngine),
                  pillarMinAvionics: normalizeListingPillarMin(pillarMinAvionics),
                  pillarMinQuality: normalizeListingPillarMin(pillarMinQuality),
                  pillarMinMkt: normalizeListingPillarMin(pillarMinMkt),
                  location: locationDraft.trim(),
                  avionics: [...new Set(avionicsDraft)].sort(),
                  dealPattern: [...new Set(dealPatternDraft)].sort(),
                })
              )
            }}
            riskTooltip={(
              <InfoTooltip
                title="Risk Level"
                body="Overall downside-risk flag (LOW/MODERATE/HIGH/CRITICAL) driven by maintenance burden, registration/safety alerts, and condition signals. Critical issues cap upside and push listings down the queue."
              />
            )}
          />
        </FilterDrawer>
        <section className="min-w-0">
          <Suspense fallback={null}>
            <ListingsMetaBar totalFiltered={totalFiltered} />
          </Suspense>
          <ListingsResultsToolbar
            safePage={safePage}
            totalPages={totalPages}
            visibleCount={paginatedListings.length}
            totalFiltered={totalFiltered}
            sortBy={sortBy}
            setSortBy={applySortByToUrl}
            pageSize={pageSize}
            setPageSize={setPageSizeWithUrl}
            layoutMode={layoutMode}
            setLayoutMode={setLayoutMode}
            fetchError={fetchError}
            mobileFilterCount={mobileActiveFilterCount}
            onOpenMobileFilters={() => setFilterDrawerOpen(true)}
            hidePriceUndisclosed={searchParams.get('hidePriceUndisclosed') === 'true'}
            onHidePriceUndisclosedChange={toggleHidePriceUndisclosed}
          />
          <ListingsGridAndPagination
            layoutMode={layoutMode}
            prioritizedListings={prioritizedListings}
            paginatedListings={paginatedListings}
            totalFiltered={totalFiltered}
            safePage={safePage}
            totalPages={totalPages}
            renderListingCard={renderListingCard}
            buildPageHref={buildPageHref}
            noPriceDividerIndex={noPriceDividerIndex}
            noPriceCountOnPage={noPriceCountOnPage}
          />
        </section>
      </div>
    </div>
  )
}
