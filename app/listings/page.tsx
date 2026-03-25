import type { Metadata } from "next"
import { connection } from "next/server"
import ListingsClient from './ListingsClient'
import { aggregateListingFilterOptionsFromRows } from '../../lib/listings/filterOptionsAggregate'
import type { ListingsPageQuery } from '../../lib/db/listingsRepository'
import {
  buildListingsPageQueryFromFlatParams,
  dealScoreToBounds,
  parseSearchParamValue,
  toFlatSearchParamsRecord,
} from '../../lib/listings/listingsQueryFromSearchParams'
import {
  getListingFilterOptionsClientPayload,
  getListingsPage,
  loadCachedDefaultListingsHomeIfEligible,
} from '../../lib/db/listingsRepository'
import {
  buildListingsCanonicalPath,
  buildListingsPageDescription,
  buildListingsPageTitle,
  isListingsCuratedIndexable,
  toAbsoluteUrl,
} from "../../lib/seo/site"

/** Fresh searchParams + DB filters per request (avoids ISR/cache collisions on filtered URLs). */
export const dynamic = "force-dynamic"

type SearchParams = Record<string, string | string[] | undefined>
type CategoryValue =
  | 'single'
  | 'multi'
  | 'turboprop'
  | 'se_turboprop'
  | 'me_turboprop'
  | 'jet'
  | 'helicopter'
  | 'lsp'
  | 'sea'
  | null
type DealTierValue = 'all' | 'TOP_DEALS' | 'HOT' | 'GOOD' | 'FAIR' | 'PASS'
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
type PriceStatus = 'all' | 'priced'
type MaintenanceBand = 'any' | 'light' | 'moderate' | 'heavy' | 'severe'
type EngineTimeFilter = 'any' | 'fresh' | 'mid' | 'approaching' | 'hasHours'

function parseParam(searchParams: SearchParams | undefined, key: string): string {
  return parseSearchParamValue(searchParams?.[key])
}

function parseSearchTerm(searchParams?: SearchParams): string {
  return parseParam(searchParams, 'q')
}

function parseCategory(searchParams?: SearchParams): CategoryValue {
  const raw = searchParams?.category
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase()
  if (!value) return null
  if (
    value === 'single' ||
    value === 'multi' ||
    value === 'turboprop' ||
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
  if (value === 'TOP_DEALS' || value === 'HOT' || value === 'GOOD' || value === 'FAIR' || value === 'PASS') {
    return value
  }
  if (
    value === 'EXCEPTIONAL_DEAL' ||
    value === 'GOOD_DEAL' ||
    value === 'FAIR_MARKET' ||
    value === 'ABOVE_MARKET' ||
    value === 'OVERPRICED' ||
    value === 'DEALRATING' ||
    value === 'TIER'
  ) {
    return 'all'
  }
  return 'all'
}

function parseSortBy(searchParams?: SearchParams): SortOption {
  const value = parseParam(searchParams, 'sortBy').toLowerCase()
  const validSorts: SortOption[] = [
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
  if (value && validSorts.includes(value as SortOption)) return value as SortOption
  return 'flip_desc'
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

export default async function ListingsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  await connection()
  const resolvedSearchParams = (await searchParams) ?? {}
  const flat = toFlatSearchParamsRecord(resolvedSearchParams)
  const initialDealFilter: DealTierValue =
    dealScoreToBounds(flat.dealScore ?? "").min > 0 ? "all" : parseDealTier(resolvedSearchParams)
  const requestedSortBy = parseSortBy(resolvedSearchParams)
  const initialSortBy: SortOption =
    initialDealFilter === 'TOP_DEALS' ? 'flip_desc' : requestedSortBy === 'deal_desc' ? 'flip_desc' : requestedSortBy

  const listingsQuery: ListingsPageQuery = {
    ...buildListingsPageQueryFromFlatParams(flat),
    sortBy: initialSortBy,
  }

  const initialSearchTerm = listingsQuery.q ?? ''
  const initialCategoryFilter = parseCategory(resolvedSearchParams)
  const initialMakeFilter = listingsQuery.make ?? ''
  const initialModelFamilyFilter = listingsQuery.modelFamily ?? ''
  const initialSubModelFilter = listingsQuery.subModel ?? ''
  const initialSourceFilter = listingsQuery.source ?? ''
  const initialStateFilter = listingsQuery.state ?? ''
  const initialRiskFilter = listingsQuery.risk ?? ''
  const initialMinimumScore = Math.max(0, listingsQuery.minValueScore ?? 0)
  const initialMaxValueScore = Math.max(0, listingsQuery.maxValueScore ?? 0)
  const initialMinPrice = listingsQuery.minPrice ?? 0
  const initialMaxPrice = listingsQuery.maxPrice ?? 0
  const initialPriceStatus = listingsQuery.priceStatus ?? 'all'
  const initialYearMin = listingsQuery.yearMin ?? 0
  const initialYearMax = listingsQuery.yearMax ?? 0
  const initialTotalTimeMin = listingsQuery.totalTimeMin ?? 0
  const initialTotalTimeMax = listingsQuery.totalTimeMax ?? 0
  const initialMaintenanceBand = listingsQuery.maintenanceBand ?? 'any'
  const initialEngineTime = listingsQuery.engineTime ?? 'any'
  const initialTrueCostMin = listingsQuery.trueCostMin ?? 0
  const initialTrueCostMax = listingsQuery.trueCostMax ?? 0
  const initialPage = listingsQuery.page ?? 1
  const initialPageSize = listingsQuery.pageSize ?? 24
  const initialDealScore = parseParam(resolvedSearchParams, 'dealScore').toLowerCase()
  const initialLocation = listingsQuery.location ?? ''
  const initialMinEngine = listingsQuery.minEngineScore ?? 0
  const initialMinAvionics = listingsQuery.minAvionicsScore ?? 0
  const initialMinQuality = listingsQuery.minQualityScore ?? 0
  const initialMinMktValue = listingsQuery.minMarketValueScore ?? 0
  const initialPriceReducedOnly = listingsQuery.priceReducedOnly === true
  const initialAddedToday = listingsQuery.addedToday === true

  let initialPageData: { rows: any[]; total: number } = { rows: [], total: 0 }
  let initialFilterOptions = aggregateListingFilterOptionsFromRows([])

  const cachedHome = await loadCachedDefaultListingsHomeIfEligible(listingsQuery, {
    page: initialPage,
    pageSize: initialPageSize,
    sortBy: initialSortBy,
  })

  if (cachedHome) {
    initialPageData = { rows: cachedHome.rows as any[], total: cachedHome.total }
    initialFilterOptions = cachedHome.filterOptions
  } else {
    const listingsPagePromise = getListingsPage(listingsQuery).catch((error) => {
      console.error("[listings/page] failed to load initial listings", error)
      return { rows: [] as any[], total: 0 }
    })
    const filterOptionsPromise = getListingFilterOptionsClientPayload().catch((error) => {
      console.error("[listings/page] failed to load filter options", error)
      return aggregateListingFilterOptionsFromRows([])
    })
    const [pageResult, filterPayload] = await Promise.all([listingsPagePromise, filterOptionsPromise])
    initialPageData = pageResult
    initialFilterOptions = filterPayload
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
        initialFilterOptions={initialFilterOptions}
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
        initialMaxValueScore={initialMaxValueScore}
        initialDealScore={initialDealScore}
        initialLocation={initialLocation}
        initialMinEngine={initialMinEngine}
        initialMinAvionics={initialMinAvionics}
        initialMinQuality={initialMinQuality}
        initialMinMktValue={initialMinMktValue}
        initialPriceReducedOnly={initialPriceReducedOnly}
        initialAddedToday={initialAddedToday}
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
        initialEngineLife={listingsQuery.engineLife ?? ""}
        initialAvionics={listingsQuery.avionics ?? ""}
        initialDealPattern={listingsQuery.dealPattern ?? ""}
      />
    </>
  )
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}): Promise<Metadata> {
  const resolvedSearchParams = (await searchParams) ?? {}
  const seoParams = toFlatSearchParamsRecord(resolvedSearchParams)
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
