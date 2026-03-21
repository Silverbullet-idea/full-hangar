import type { Metadata } from "next"
import ListingsClient from './ListingsClient'
import { getListingsPage } from '../../lib/db/listingsRepository'
import {
  buildListingsCanonicalPath,
  buildListingsPageDescription,
  buildListingsPageTitle,
  isListingsCuratedIndexable,
  toAbsoluteUrl,
} from "../../lib/seo/site"

type SearchParams = Record<string, string | string[] | undefined>
type CategoryValue = 'single' | 'multi' | 'se_turboprop' | 'me_turboprop' | 'jet' | 'helicopter' | 'lsp' | 'sea' | null
type DealTierValue = 'all' | 'TOP_DEALS' | 'EXCEPTIONAL_DEAL' | 'GOOD_DEAL' | 'FAIR_MARKET' | 'ABOVE_MARKET' | 'OVERPRICED'
type SortOption =
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
  | 'engine_life'
type PriceStatus = 'all' | 'priced'
type MaintenanceBand = 'any' | 'light' | 'moderate' | 'heavy' | 'severe'
type EngineTimeFilter = 'any' | 'fresh' | 'mid' | 'approaching' | 'hasHours'

function parseParam(searchParams: SearchParams | undefined, key: string): string {
  const raw = searchParams?.[key]
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' ? value.trim() : ''
}

function toFlatSearchParams(searchParams?: SearchParams): Record<string, string> {
  if (!searchParams) return {}
  return Object.keys(searchParams).reduce<Record<string, string>>((acc, key) => {
    acc[key] = parseParam(searchParams, key)
    return acc
  }, {})
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
  if (
    value === 'single' ||
    value === 'multi' ||
    value === 'se_turboprop' ||
    value === 'me_turboprop' ||
    value === 'jet' ||
    value === 'helicopter' ||
    value === 'lsp' ||
    value === 'sea'
  ) {
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
    'price_low', 'price_high', 'deal_desc',
    'market_best', 'market_worst', 'risk_low', 'risk_high',
    'deferred_low', 'deferred_high', 'tt_low', 'tt_high', 'year_newest', 'year_oldest', 'engine_life',
  ]
  if (value && validSorts.includes(value as SortOption)) return value as SortOption
  return 'deal_desc'
}

function parsePositiveInt(searchParams: SearchParams | undefined, key: string, fallback = 0): number {
  const value = Number(parseParam(searchParams, key))
  if (!Number.isFinite(value)) return fallback
  const normalized = Math.floor(value)
  return normalized > 0 ? normalized : fallback
}

function parsePriceStatus(searchParams?: SearchParams): PriceStatus {
  const value = parseParam(searchParams, 'priceStatus').toLowerCase()
  return value === 'priced' ? 'priced' : 'all'
}

function parseMaintenanceBand(searchParams?: SearchParams): MaintenanceBand {
  const value = parseParam(searchParams, 'maintenanceBand').toLowerCase()
  if (value === 'light' || value === 'moderate' || value === 'heavy' || value === 'severe') return value
  return 'any'
}

function parseEngineTime(searchParams?: SearchParams): EngineTimeFilter {
  const value = parseParam(searchParams, 'engineTime').toLowerCase()
  if (value === 'fresh' || value === 'mid' || value === 'approaching') return value
  if (value === 'hashours') return 'hasHours'
  return 'any'
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
  const initialMinimumScore = parsePositiveInt(resolvedSearchParams, 'minValueScore', 0)
  const initialMinPrice = parsePositiveInt(resolvedSearchParams, 'minPrice', 0)
  const initialMaxPrice = parsePositiveInt(resolvedSearchParams, 'maxPrice', 0)
  const initialPriceStatus = parsePriceStatus(resolvedSearchParams)
  const initialYearMin = parsePositiveInt(resolvedSearchParams, 'yearMin', 0)
  const initialYearMax = parsePositiveInt(resolvedSearchParams, 'yearMax', 0)
  const initialTotalTimeMin = parsePositiveInt(resolvedSearchParams, 'totalTimeMin', 0)
  const initialTotalTimeMax = parsePositiveInt(resolvedSearchParams, 'totalTimeMax', 0)
  const initialMaintenanceBand = parseMaintenanceBand(resolvedSearchParams)
  const initialEngineTime = parseEngineTime(resolvedSearchParams)
  const initialTrueCostMin = parsePositiveInt(resolvedSearchParams, 'trueCostMin', 0)
  const initialTrueCostMax = parsePositiveInt(resolvedSearchParams, 'trueCostMax', 0)
  const initialPage = parsePositiveInt(resolvedSearchParams, 'page', 1)
  const requestedPageSize = parsePositiveInt(resolvedSearchParams, 'pageSize', 24)
  const initialPageSize = Math.min(48, Math.max(12, requestedPageSize))
  const initialSortBy: SortOption =
    initialDealFilter === 'TOP_DEALS' ? 'deal_desc' : requestedSortBy

  let initialPageData: { rows: any[]; total: number } = { rows: [], total: 0 }
  try {
    initialPageData = await getListingsPage({
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
      minPrice: initialMinPrice,
      maxPrice: initialMaxPrice,
      priceStatus: initialPriceStatus,
      yearMin: initialYearMin,
      yearMax: initialYearMax,
      totalTimeMin: initialTotalTimeMin,
      totalTimeMax: initialTotalTimeMax,
      maintenanceBand: initialMaintenanceBand,
      engineTime: initialEngineTime,
      trueCostMin: initialTrueCostMin,
      trueCostMax: initialTrueCostMax,
      category: initialCategoryFilter ?? '',
      dealTier: initialDealFilter === 'all' ? '' : initialDealFilter,
    })
  } catch (error) {
    console.error("[listings/page] failed to load initial listings", error)
  }

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    numberOfItems: initialPageData.total,
    itemListElement: initialPageData.rows.slice(0, 24).map((row: any, index: number) => {
      const listingKey = String(row?.source_id ?? row?.id ?? "").trim()
      const absoluteUrl = listingKey ? toAbsoluteUrl(`/listings/${listingKey}`) : toAbsoluteUrl("/listings")
      const imageUrl = typeof row?.primary_image_url === "string" ? row.primary_image_url.trim() : ""
      const price = typeof row?.asking_price === "number" && row.asking_price > 0 ? row.asking_price : null
      return {
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl,
        item: {
          "@type": "Product",
          name: [row?.year, row?.make, row?.model].filter(Boolean).join(" ").trim() || "Aircraft listing",
          ...(imageUrl ? { image: imageUrl } : {}),
          ...(price !== null
            ? {
                offers: {
                  "@type": "Offer",
                  priceCurrency: "USD",
                  price,
                  availability: "https://schema.org/InStock",
                  url: absoluteUrl,
                },
              }
            : {}),
        },
      }
    }),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <section className="mb-5 space-y-2">
        <h1 className="text-2xl font-bold text-brand-white">Aircraft Listings for Sale</h1>
      </section>
      <ListingsClient
        initialListings={initialPageData.rows}
        initialTotalFiltered={initialPageData.total}
        initialFilterOptions={buildFilterOptions([])}
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
        initialMinimumScore={initialMinimumScore}
        initialMinPrice={initialMinPrice}
        initialMaxPrice={initialMaxPrice}
        initialPriceStatus={initialPriceStatus}
        initialYearMin={initialYearMin}
        initialYearMax={initialYearMax}
        initialTotalTimeMin={initialTotalTimeMin}
        initialTotalTimeMax={initialTotalTimeMax}
        initialMaintenanceBand={initialMaintenanceBand}
        initialEngineTime={initialEngineTime}
        initialTrueCostMin={initialTrueCostMin}
        initialTrueCostMax={initialTrueCostMax}
        initialPage={initialPage}
        initialPageSize={initialPageSize}
      />
    </>
  )
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}): Promise<Metadata> {
  const resolvedSearchParams = await searchParams
  const seoParams = toFlatSearchParams(resolvedSearchParams)
  const isIndexable = isListingsCuratedIndexable(seoParams)
  const canonicalPath = buildListingsCanonicalPath(seoParams)

  return {
    title: buildListingsPageTitle(seoParams),
    description: buildListingsPageDescription(seoParams),
    alternates: {
      canonical: canonicalPath,
    },
    robots: {
      index: isIndexable,
      follow: true,
      googleBot: {
        index: isIndexable,
        follow: true,
        "max-image-preview": "large",
      },
    },
    openGraph: {
      title: buildListingsPageTitle(seoParams),
      description: buildListingsPageDescription(seoParams),
      url: toAbsoluteUrl(canonicalPath),
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: buildListingsPageTitle(seoParams),
      description: buildListingsPageDescription(seoParams),
    },
  }
}
