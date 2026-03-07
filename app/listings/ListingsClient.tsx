'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import ListingCard from './components/ListingCard'
import ListingsFiltersSidebar from './components/ListingsFiltersSidebar'
import ListingsGridAndPagination from './components/ListingsGridAndPagination'
import ListingsResultsToolbar from './components/ListingsResultsToolbar'
import ListingsTopBanner from './components/ListingsTopBanner'
import { formatPriceOrCall, formatScore } from '../../lib/listings/format'
import {
  CATEGORIES,
  collectImageCandidates,
  deriveModelFamily,
  inferCategoriesForMakeModel,
  normalizeTopMenuMakeLabel,
  normalizeSourceKey,
  TOP_MENU_MIN_COUNT,
  type CategoryValue,
  type ListingSourceKey,
} from './components/listingsClientUtils'

type LayoutMode = 'tiles' | 'rows' | 'compact'
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

type FilterOptions = {
  makes: string[]
  models: string[]
  states: string[]
  modelPairs: Array<{ make: string; model: string }>
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
  initialDealFilter?: 'all' | 'TOP_DEALS' | 'EXCEPTIONAL_DEAL' | 'GOOD_DEAL' | 'FAIR_MARKET' | 'ABOVE_MARKET' | 'OVERPRICED'
  initialSortBy?: SortOption
  initialMakeFilter?: string
  initialModelFilter?: string
  initialSubModelFilter?: string
  initialSourceFilter?: 'all' | ListingSourceKey | string
  initialStateFilter?: string
  initialRiskFilter?: string
  initialOwnershipType?: 'all' | 'full' | 'fractional'
  initialMinimumScore?: number
  initialMaxPrice?: number
  initialPage?: number
  initialPageSize?: number
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
  initialSortBy = 'value_desc',
  initialMakeFilter = 'all',
  initialModelFilter = '',
  initialSubModelFilter = '',
  initialSourceFilter = 'all',
  initialStateFilter = '',
  initialRiskFilter = 'all',
  initialOwnershipType = 'all',
  initialMinimumScore = 0,
  initialMaxPrice = 0,
  initialPage = 1,
  initialPageSize = 24,
}: ListingsClientProps) {
  const canApplySavedSort = initialSortBy === 'value_desc' && initialDealFilter === 'all'
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
  const [ownershipType, setOwnershipType] = useState<'all' | 'full' | 'fractional'>(initialOwnershipType)
  const [appliedOwnershipType, setAppliedOwnershipType] = useState<'all' | 'full' | 'fractional'>(initialOwnershipType)
  const [dealFilter, setDealFilter] = useState<'all' | 'TOP_DEALS' | 'EXCEPTIONAL_DEAL' | 'GOOD_DEAL' | 'FAIR_MARKET' | 'ABOVE_MARKET' | 'OVERPRICED'>(initialDealFilter)
  const [minimumScore, setMinimumScore] = useState(Math.max(0, initialMinimumScore))
  const [maxPrice, setMaxPrice] = useState(Math.max(0, initialMaxPrice))
  const [appliedMaxPrice, setAppliedMaxPrice] = useState(Math.max(0, initialMaxPrice))
  const [categoryFilter, setCategoryFilter] = useState<CategoryValue>(initialCategoryFilter)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('tiles')
  const [sortBy, setSortBy] = useState<SortOption>(initialSortBy)
  const hasSkippedInitialFetch = useRef(false)

  useEffect(() => {
    // Keep UI state in sync when URL/search params change within /listings.
    hasSkippedInitialFetch.current = false
    setListings(Array.isArray(initialListings) ? initialListings : [])
    setTotalFiltered(Number.isFinite(initialTotalFiltered) ? initialTotalFiltered : 0)
    setFilterOptions(initialFilterOptions)
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
    setOwnershipType(initialOwnershipType)
    setAppliedOwnershipType(initialOwnershipType)
    setDealFilter(initialDealFilter)
    setMinimumScore(Math.max(0, initialMinimumScore))
    setMaxPrice(Math.max(0, initialMaxPrice))
    setAppliedMaxPrice(Math.max(0, initialMaxPrice))
    setCategoryFilter(initialCategoryFilter)
    setSortBy(initialSortBy)
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
    initialOwnershipType,
    initialDealFilter,
    initialMinimumScore,
    initialMaxPrice,
    initialCategoryFilter,
    initialSortBy,
  ])

  useEffect(() => {
    if (
      filterOptions.makes.length > 0 ||
      filterOptions.models.length > 0 ||
      filterOptions.states.length > 0 ||
      filterOptions.modelPairs.length > 0
    ) return

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
      'value_desc', 'value_asc', 'price_low', 'price_high', 'deal_desc',
      'market_best', 'market_worst', 'risk_low', 'risk_high',
      'deferred_low', 'deferred_high', 'tt_low', 'tt_high', 'year_newest', 'year_oldest'
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
  const makeCountMap = useMemo(() => filterOptions.makeCounts ?? {}, [filterOptions.makeCounts])
  const modelPairCountMap = useMemo(() => filterOptions.modelPairCounts ?? {}, [filterOptions.modelPairCounts])
  const dealTierCountMap = useMemo(() => filterOptions.dealTierCounts ?? {}, [filterOptions.dealTierCounts])
  const minScoreCountMap = useMemo(() => filterOptions.minimumValueScoreCounts ?? {}, [filterOptions.minimumValueScoreCounts])

  const modelOptions = useMemo(() => {
    const pairs = makeFilter === 'all'
      ? filterOptions.modelPairs
      : filterOptions.modelPairs.filter((pair) => pair.make.toLowerCase() === makeFilter.toLowerCase())
    return Array.from(new Set(pairs.map((pair) => deriveModelFamily(String(pair.model ?? ''))).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b))
  }, [filterOptions.modelPairs, makeFilter])

  const subModelOptions = useMemo(() => {
    if (!modelFilter) return []
    const pairs = makeFilter === 'all'
      ? filterOptions.modelPairs
      : filterOptions.modelPairs.filter((pair) => pair.make.toLowerCase() === makeFilter.toLowerCase())
    return Array.from(
      new Set(
        pairs
          .filter((pair) => deriveModelFamily(String(pair.model ?? '')) === modelFilter)
          .map((pair) => pair.model)
      )
    ).sort((a, b) => a.localeCompare(b))
  }, [filterOptions.modelPairs, makeFilter, modelFilter])


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
        .filter(([, count]) => count > 1)
        .map(([make, count]) => ({ make, count }))
        .sort((a, b) => a.make.localeCompare(b.make)),
      multi: Array.from(makeBuckets.multi.entries())
        .filter(([, count]) => count > 1)
        .map(([make, count]) => ({ make, count }))
        .sort((a, b) => a.make.localeCompare(b.make)),
      se_turboprop: Array.from(makeBuckets.se_turboprop.entries())
        .filter(([, count]) => count > 1)
        .map(([make, count]) => ({ make, count }))
        .sort((a, b) => a.make.localeCompare(b.make)),
      me_turboprop: Array.from(makeBuckets.me_turboprop.entries())
        .filter(([, count]) => count > 1)
        .map(([make, count]) => ({ make, count }))
        .sort((a, b) => a.make.localeCompare(b.make)),
      jet: Array.from(makeBuckets.jet.entries())
        .filter(([, count]) => count > 1)
        .map(([make, count]) => ({ make, count }))
        .sort((a, b) => a.make.localeCompare(b.make)),
      helicopter: Array.from(makeBuckets.helicopter.entries())
        .filter(([, count]) => count > 1)
        .map(([make, count]) => ({ make, count }))
        .sort((a, b) => a.make.localeCompare(b.make)),
      lsp: Array.from(makeBuckets.lsp.entries())
        .filter(([, count]) => count > 1)
        .map(([make, count]) => ({ make, count }))
        .sort((a, b) => a.make.localeCompare(b.make)),
      sea: Array.from(makeBuckets.sea.entries())
        .filter(([, count]) => count > 1)
        .map(([make, count]) => ({ make, count }))
        .sort((a, b) => a.make.localeCompare(b.make)),
    }

    return { makesByCategory, categoryCounts }
  }, [filterOptions.modelPairs, modelPairCountMap])

  const visibleCategories = useMemo(() => CATEGORIES, [])
  const topMenuButtonCount = visibleCategories.length + 1

  useEffect(() => {
    setCurrentPage(1)
  }, [appliedSearchTerm, appliedMakeFilter, appliedModelFilter, appliedSubModelFilter, appliedSourceFilter, minimumScore, appliedMaxPrice, categoryFilter, appliedRiskFilter, appliedOwnershipType, dealFilter, pageSize])

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
        if (dealFilter !== 'all') params.set('dealTier', dealFilter)
        if (minimumScore > 0) params.set('minValueScore', String(minimumScore))
        if (appliedMaxPrice > 0) params.set('maxPrice', String(appliedMaxPrice))
        if (appliedOwnershipType !== 'all') params.set('ownershipType', appliedOwnershipType)
        if (categoryFilter) params.set('category', categoryFilter)

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
    appliedMaxPrice,
    appliedOwnershipType,
    categoryFilter,
    sortBy,
  ])

  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const listingsReturnTo = useMemo(() => {
    const params = new URLSearchParams()
    if (appliedSearchTerm.trim()) params.set('q', appliedSearchTerm.trim())
    if (categoryFilter) params.set('category', categoryFilter)
    if (dealFilter !== 'all') params.set('dealTier', dealFilter)
    if (sortBy !== 'value_desc') params.set('sortBy', sortBy)
    if (appliedMakeFilter !== 'all') params.set('make', appliedMakeFilter)
    if (appliedModelFilter.trim()) params.set('modelFamily', appliedModelFilter.trim())
    if (appliedSubModelFilter.trim()) params.set('subModel', appliedSubModelFilter.trim())
    if (appliedSourceFilter !== 'all') params.set('source', appliedSourceFilter)
    if (appliedRiskFilter !== 'all') params.set('risk', appliedRiskFilter)
    if (minimumScore > 0) params.set('minValueScore', String(minimumScore))
    if (appliedMaxPrice > 0) params.set('maxPrice', String(appliedMaxPrice))
    if (appliedOwnershipType !== 'all') params.set('ownershipType', appliedOwnershipType)
    if (safePage > 1) params.set('page', String(safePage))
    if (pageSize !== 24) params.set('pageSize', String(pageSize))
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
    appliedMaxPrice,
    appliedOwnershipType,
    safePage,
    pageSize,
  ])
  const buildPageHref = (page: number) => {
    const params = new URLSearchParams()
    if (appliedSearchTerm.trim()) params.set('q', appliedSearchTerm.trim())
    if (categoryFilter) params.set('category', categoryFilter)
    if (dealFilter !== 'all') params.set('dealTier', dealFilter)
    if (sortBy !== 'value_desc') params.set('sortBy', sortBy)
    if (appliedMakeFilter !== 'all') params.set('make', appliedMakeFilter)
    if (appliedModelFilter.trim()) params.set('modelFamily', appliedModelFilter.trim())
    if (appliedSubModelFilter.trim()) params.set('subModel', appliedSubModelFilter.trim())
    if (appliedSourceFilter !== 'all') params.set('source', appliedSourceFilter)
    if (appliedRiskFilter !== 'all') params.set('risk', appliedRiskFilter)
    if (minimumScore > 0) params.set('minValueScore', String(minimumScore))
    if (appliedMaxPrice > 0) params.set('maxPrice', String(appliedMaxPrice))
    if (appliedOwnershipType !== 'all') params.set('ownershipType', appliedOwnershipType)
    if (page > 1) params.set('page', String(page))
    if (pageSize !== 24) params.set('pageSize', String(pageSize))
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

  const applyDealPreset = (preset: 'all' | 'top' | 'exceptional' | 'good' | 'fair' | 'above' | 'overpriced') => {
    setCurrentPage(1)
    if (preset === 'all') {
      setDealFilter('all')
      return
    }
    if (preset === 'top') {
      setDealFilter('TOP_DEALS')
      setSortBy('deal_desc')
      return
    }
    if (preset === 'exceptional') {
      setDealFilter('EXCEPTIONAL_DEAL')
      return
    }
    if (preset === 'good') {
      setDealFilter('GOOD_DEAL')
      return
    }
    if (preset === 'fair') {
      setDealFilter('FAIR_MARKET')
      return
    }
    if (preset === 'above') {
      setDealFilter('ABOVE_MARKET')
      return
    }
    setDealFilter('OVERPRICED')
  }

  const buildCategoryHref = (category: CategoryValue) => {
    const params = new URLSearchParams()
    if (appliedSearchTerm.trim()) params.set('q', appliedSearchTerm.trim())
    if (category) params.set('category', category)
    return `/listings${params.toString() ? `?${params.toString()}` : ''}`
  }

  const buildCategoryMakeHref = (category: CategoryValue, make: string) => {
    const params = new URLSearchParams()
    if (appliedSearchTerm.trim()) params.set('q', appliedSearchTerm.trim())
    if (category) params.set('category', category)
    params.set('make', make)
    return `/listings${params.toString() ? `?${params.toString()}` : ''}`
  }

  const buildDealHref = (dealTier: 'all' | 'TOP_DEALS' | 'EXCEPTIONAL_DEAL' | 'GOOD_DEAL' | 'FAIR_MARKET' | 'ABOVE_MARKET' | 'OVERPRICED') => {
    const params = new URLSearchParams()
    if (appliedSearchTerm.trim()) params.set('q', appliedSearchTerm.trim())
    if (dealTier !== 'all') params.set('dealTier', dealTier)
    if (dealTier === 'TOP_DEALS') params.set('sortBy', 'deal_desc')
    return `/listings${params.toString() ? `?${params.toString()}` : ''}`
  }

  const renderListingCard = (l: any, mode: LayoutMode) => {
    const listingKey = String(l.source_id ?? l.id)
    const detailHref = `/listings/${l.source_id ?? l.id}?returnTo=${encodeURIComponent(listingsReturnTo)}`
    const imageCandidates = collectImageCandidates(l)
    const currentImageIndex = imageCursor[listingKey] ?? 0
    const imageUrl = imageCandidates[currentImageIndex] ?? ''
    const rawTail = String(l.n_number ?? '').trim().toUpperCase()
    const tailText = rawTail ? (rawTail.startsWith('N') ? rawTail : `N${rawTail}`) : 'N/A'
    const titleText = `${l.year ?? 'Year N/A'} ${l.make ?? ''} ${l.model ?? ''}`.trim()
    const priceText = formatPriceOrCall(typeof l.asking_price === 'number' ? l.asking_price : null)
    const isFractional = l.is_fractional_ownership === true
    const shareNumerator = typeof l.fractional_share_numerator === 'number' && l.fractional_share_numerator > 0 ? l.fractional_share_numerator : 1
    const shareDenominator = typeof l.fractional_share_denominator === 'number' && l.fractional_share_denominator > 1 ? l.fractional_share_denominator : null
    const sharePriceText =
      typeof l.fractional_share_price === 'number' && l.fractional_share_price > 0
        ? formatPriceOrCall(l.fractional_share_price)
        : 'N/A'
    const ownershipBadgeText = isFractional ? 'Fractional' : undefined
    const locationText = l.location_label ?? 'Location unavailable'
    const dealRatingText = formatScore(typeof l.deal_rating === 'number' ? l.deal_rating : null)
    const valueScoreText = formatScore(typeof l.value_score === 'number' ? l.value_score : null)
    const ownershipText = isFractional
      ? (shareDenominator ? `Fractional ${shareNumerator}/${shareDenominator}` : 'Fractional')
      : 'Full'

    const specRows: Array<[string, string]> = [
      ['N-Number', tailText],
      ['Price', priceText],
      ...(isFractional ? [['Share Price', sharePriceText] as [string, string]] : []),
      ['Ownership', ownershipText],
      ['Deal Rating', dealRatingText],
      ['Value Score', valueScoreText],
    ]

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
        dealTier={typeof l.deal_tier === 'string' ? l.deal_tier : null}
        specRows={specRows}
        onImageError={() => {
          setImageCursor((prev) => ({ ...prev, [listingKey]: currentImageIndex + 1 }))
        }}
      />
    )
  }

  if (loading) return <div className="text-brand-muted">Loading listings...</div>

  return (
    <div>
      <ListingsTopBanner
        topMenuButtonCount={topMenuButtonCount}
        visibleCategories={visibleCategories}
        categoryFilter={categoryFilter}
        makeOptions={makeOptions}
        makeCountMap={makeCountMap}
        categoryMenuData={categoryMenuData}
        dealFilter={dealFilter}
        dealTierCountMap={dealTierCountMap}
        buildCategoryHref={buildCategoryHref}
        buildCategoryMakeHref={buildCategoryMakeHref}
        buildDealHref={buildDealHref}
        onSelectCategory={(category) => {
          setCategoryFilter(category)
          setDealFilter('all')
          setCurrentPage(1)
        }}
        onSelectDealPreset={(preset) => {
          setCategoryFilter(null)
          applyDealPreset(preset)
          setCurrentPage(1)
        }}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <ListingsFiltersSidebar
          makeFilter={makeFilter}
          setMakeFilter={setMakeFilter}
          modelFilter={modelFilter}
          setModelFilter={setModelFilter}
          subModelFilter={subModelFilter}
          setSubModelFilter={setSubModelFilter}
          sourceFilter={sourceFilter}
          setSourceFilter={setSourceFilter}
          maxPrice={maxPrice}
          setMaxPrice={setMaxPrice}
          riskFilter={riskFilter}
          setRiskFilter={setRiskFilter}
          ownershipType={ownershipType}
          setOwnershipType={setOwnershipType}
          makeOptions={makeOptions}
          modelOptions={modelOptions}
          subModelOptions={subModelOptions}
          onResetFilters={() => {
            setMakeFilter('all')
            setModelFilter('')
            setSubModelFilter('')
            setSourceFilter('all')
            setMaxPrice(0)
            setRiskFilter('all')
            setOwnershipType('all')
          }}
          onApplyFilters={() => {
            setAppliedMakeFilter(makeFilter)
            setAppliedModelFilter(modelFilter)
            setAppliedSubModelFilter(subModelFilter)
            setAppliedSourceFilter(sourceFilter)
            setAppliedRiskFilter(riskFilter)
            setAppliedMaxPrice(maxPrice)
            setAppliedOwnershipType(ownershipType)
            setCurrentPage(1)
          }}
          riskTooltip={(
            <InfoTooltip
              title="Risk Level"
              body="Overall downside-risk flag (LOW/MODERATE/HIGH/CRITICAL) driven by maintenance burden, registration/safety alerts, and condition signals. Critical issues cap upside and push listings down the queue."
            />
          )}
        />
        <section>
          <ListingsResultsToolbar
            safePage={safePage}
            totalPages={totalPages}
            sortBy={sortBy}
            setSortBy={setSortBy}
            pageSize={pageSize}
            setPageSize={setPageSize}
            layoutMode={layoutMode}
            setLayoutMode={setLayoutMode}
            fetchError={fetchError}
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
          />
        </section>
      </div>
    </div>
  )
}
