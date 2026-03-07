export const CANONICAL_SITE_URL = "https://fullhangar.com"
export const SITE_NAME = "Full Hangar"
export const DEFAULT_SITE_DESCRIPTION =
  "Aircraft listings, deal scoring, and market intelligence for buyers comparing active aircraft inventory."
export const DEFAULT_OG_IMAGE_PATH = "/branding/FullHangar.png"

const CURATED_LISTINGS_KEYS = new Set(["category", "make", "dealTier"])
const NON_INDEXABLE_LISTINGS_KEYS = new Set([
  "q",
  "model",
  "modelFamily",
  "subModel",
  "source",
  "state",
  "risk",
  "minValueScore",
  "maxPrice",
  "ownershipType",
  "sortBy",
])
const ALLOWED_CURATED_DEAL_TIERS = new Set(["TOP_DEALS", "EXCEPTIONAL_DEAL", "GOOD_DEAL"])
const ALLOWED_CATEGORIES = new Set([
  "single",
  "multi",
  "se_turboprop",
  "me_turboprop",
  "jet",
  "helicopter",
  "lsp",
  "sea",
])

function normalizeSiteUrl(rawValue: string | undefined): string {
  const trimmed = rawValue?.trim()
  if (!trimmed) return CANONICAL_SITE_URL
  const cleaned = trimmed.replace(/\/+$/, "")
  try {
    const parsed = new URL(cleaned)
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return CANONICAL_SITE_URL
  }
}

export const SITE_URL = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL)

export function toAbsoluteUrl(pathname: string): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`
  return `${SITE_URL}${normalizedPath}`
}

export function titleFromParts(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ")
    .trim()
}

export function isListingsCuratedIndexable(params: Record<string, string>): boolean {
  const keys = Object.entries(params)
    .filter(([, value]) => value.trim().length > 0)
    .map(([key]) => key)

  if (keys.length === 0) return true
  if (keys.some((key) => NON_INDEXABLE_LISTINGS_KEYS.has(key))) return false
  if (keys.some((key) => !CURATED_LISTINGS_KEYS.has(key) && key !== "page" && key !== "pageSize")) return false

  const page = Number(params.page || "1")
  if (Number.isFinite(page) && page > 1) return false

  const pageSize = Number(params.pageSize || "24")
  if (Number.isFinite(pageSize) && pageSize !== 24) return false

  const category = params.category?.trim().toLowerCase()
  if (category && !ALLOWED_CATEGORIES.has(category)) return false

  const make = params.make?.trim()
  if (make === "") return false

  const dealTier = params.dealTier?.trim().toUpperCase()
  if (dealTier && !ALLOWED_CURATED_DEAL_TIERS.has(dealTier)) return false

  return true
}

export function buildListingsCanonicalPath(params: Record<string, string>): string {
  if (!isListingsCuratedIndexable(params)) return "/listings"
  const canonicalParams = new URLSearchParams()
  const category = params.category?.trim()
  const make = params.make?.trim()
  const dealTier = params.dealTier?.trim().toUpperCase()
  if (category) canonicalParams.set("category", category)
  if (make) canonicalParams.set("make", make)
  if (dealTier && ALLOWED_CURATED_DEAL_TIERS.has(dealTier)) canonicalParams.set("dealTier", dealTier)
  const query = canonicalParams.toString()
  return query ? `/listings?${query}` : "/listings"
}

export function buildListingsPageTitle(params: Record<string, string>): string {
  const make = params.make?.trim()
  const category = params.category?.trim().toLowerCase()
  const dealTier = params.dealTier?.trim().toUpperCase()

  const categoryLabelMap: Record<string, string> = {
    single: "Single Engine Aircraft",
    multi: "Multi Engine Aircraft",
    se_turboprop: "Single Engine Turboprops",
    me_turboprop: "Multi Engine Turboprops",
    jet: "Jets",
    helicopter: "Helicopters",
    lsp: "Light Sport Aircraft",
    sea: "Amphibious Aircraft",
  }
  const dealLabelMap: Record<string, string> = {
    TOP_DEALS: "Top Aircraft Deals",
    EXCEPTIONAL_DEAL: "Exceptional Aircraft Deals",
    GOOD_DEAL: "Good Aircraft Deals",
  }

  if (make && category && categoryLabelMap[category]) {
    return `${make} ${categoryLabelMap[category]} for Sale`
  }
  if (make) return `${make} Aircraft Listings for Sale`
  if (category && categoryLabelMap[category]) return `${categoryLabelMap[category]} for Sale`
  if (dealTier && dealLabelMap[dealTier]) return dealLabelMap[dealTier]
  return "Aircraft Listings for Sale"
}

export function buildListingsPageDescription(params: Record<string, string>): string {
  const make = params.make?.trim()
  const category = params.category?.trim().toLowerCase()
  const dealTier = params.dealTier?.trim().toUpperCase()
  if (make && category) {
    return `Browse ${make} ${category.replaceAll("_", " ")} listings with pricing, time-in-service, and risk signals.`
  }
  if (make) {
    return `Browse active ${make} aircraft listings with deal scores, pricing context, and comparable market insights.`
  }
  if (dealTier && ALLOWED_CURATED_DEAL_TIERS.has(dealTier)) {
    return "Compare high-signal aircraft opportunities ranked by market fit, condition, and execution risk."
  }
  return DEFAULT_SITE_DESCRIPTION
}
