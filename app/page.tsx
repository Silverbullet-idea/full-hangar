import Link from "next/link"
import HomeBenefits from "./components/home/HomeBenefits"
import HomeDealSignals from "./components/home/HomeDealSignals"
import HomeFinalCta from "./components/home/HomeFinalCta"
import HomeHero from "./components/home/HomeHero"
import HomeScoringExplainer from "./components/home/HomeScoringExplainer"
import HomeSocialProofFaq from "./components/home/HomeSocialProofFaq"
import { CATEGORIES } from "./listings/components/listingsClientUtils"
import { getAircraftListingsCount, getListingsPage } from "../lib/db/listingsRepository"

export const dynamic = "force-dynamic"

function withTimeout<T>(promiseLike: PromiseLike<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timeoutId = setTimeout(() => resolve(fallback), ms)
    Promise.resolve(promiseLike)
      .then((value) => {
        clearTimeout(timeoutId)
        resolve(value)
      })
      .catch(() => {
        clearTimeout(timeoutId)
        resolve(fallback)
      })
  })
}

type ListingImageRow = {
  id?: string
  source_id?: string | null
  title?: string | null
  make?: string | null
  model?: string | null
  primary_image_url?: string | null
  image_urls?: string[] | null
  deal_tier?: string | null
}

type HeroImage = {
  src: string
  alt: string
  href: string
  dealBadgeText: string
  dealBadgeTone: "exceptional" | "good" | "neutral"
}

type ListingsPageResult = {
  rows: Record<string, unknown>[]
  total: number
  page: number
  pageSize: number
}

const FALLBACK_HERO_IMAGES = [
  {
    src: "https://cdn.avbuyer.com/live/uploads/image/373701_373800/aircraft-twin-piston-cessna-340a-373768_0d830d662a218e10_350X200_c.webp",
    alt: "Cessna twin piston aircraft",
  },
  {
    src: "https://resources.globalair.com/aircraftforsale/images/ads/139704_04_CitationXLS_sn560-5505-Ext1.jpg?w=350?mode=pad&bgcolor=white",
    alt: "Business jet on ramp",
  },
  {
    src: "https://cdn.avbuyer.com/live/uploads/image/373301_373400/aircraft-private-jets-hawker-800xp-373308_7f59fb041a0db47d_350X200_c.webp",
    alt: "Private jet exterior view",
  },
  {
    src: "https://resources.globalair.com/aircraftforsale/images/ads/138041_00_CitationEncore_sn560-0541-Ext1.jpg?w=350?mode=pad&bgcolor=white",
    alt: "Jet aircraft parked outdoors",
  },
]

const ALLOWED_EXACT_HOSTS = new Set([
  "dsgiipnwy1jd8.cloudfront.net",
  "cdn-media.tilabs.io",
  "media.sandhills.com",
])

const ALLOWED_HOST_SUFFIXES = [".controller.com", ".aerotrader.com", ".barnstormers.com", ".globalair.com", ".avbuyer.com"]

export default async function HomePage() {
  const emptyListingsPage: ListingsPageResult = {
    rows: [],
    total: 0,
    page: 1,
    pageSize: 24,
  }

  const [listingsCount, exceptionalResult] = await Promise.all([
    withTimeout(getAircraftListingsCount(), 5000, 0),
    withTimeout(
      getListingsPage({
        page: 1,
        pageSize: 24,
        category: "single",
        dealTier: "EXCEPTIONAL_DEAL",
        sortBy: "deal_desc",
      }),
      6000,
      emptyListingsPage
    ),
  ])

  let rows = (exceptionalResult?.rows ?? []) as ListingImageRow[]
  if (rows.length === 0) {
    const topDealsFallback = await withTimeout(
      getListingsPage({
        page: 1,
        pageSize: 24,
        category: "single",
        dealTier: "TOP_DEALS",
        sortBy: "deal_desc",
      }),
      6000,
      emptyListingsPage
    )
    rows = (topDealsFallback?.rows ?? []) as ListingImageRow[]
  }

  const featuredRows = rows.slice(0, 24)
  const heroImages = buildHeroImages(featuredRows)
  const sampleListingHref = buildSampleListingHref(featuredRows)

  return (
    <main className="space-y-2 home-page-wrap">
      <section className="mb-2">
        <div className="w-full rounded-lg border border-[#3A4454] bg-[#1A1A1A] p-1.5">
          <div
            className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-1 sm:grid-cols-3 lg:[grid-template-columns:repeat(var(--top-btn-count),minmax(0,1fr))]"
            style={{ ["--top-btn-count" as any]: CATEGORIES.length + 1 }}
          >
            {CATEGORIES.map((category) => (
              <Link
                key={category.label}
                href={buildHomeCategoryHref(category.value)}
                className="h-8 rounded-md border border-[#3A4454] bg-[#121822] px-2 py-2 text-center text-xs font-semibold text-white transition-colors hover:border-[#FF9900] hover:text-[#FF9900]"
              >
                {category.label}
              </Link>
            ))}
            <Link
              href="/listings?dealTier=TOP_DEALS&sortBy=deal_desc"
              className="flex h-8 items-center justify-center rounded-md border border-[#166534] bg-[#166534] px-2 text-center text-xs font-bold text-white transition-colors hover:bg-[#15803d]"
            >
              Deals
            </Link>
          </div>
        </div>
      </section>
      <div className="home-reveal home-r1">
        <HomeHero listingsCount={listingsCount} heroImages={heroImages} />
      </div>
      <div className="home-reveal home-r2">
        <HomeBenefits />
      </div>
      <div className="home-reveal home-r3">
        <HomeScoringExplainer sampleListingHref={sampleListingHref} />
      </div>
      <div className="home-reveal home-r4">
        <HomeDealSignals />
      </div>
      <div className="home-reveal home-r5">
        <HomeSocialProofFaq />
      </div>
      <div className="home-reveal home-r6">
        <HomeFinalCta />
      </div>

      <style>{`
        .home-page-wrap {
          padding-bottom: 0.8rem;
        }
        .home-reveal {
          opacity: 0;
          transform: translateY(14px);
          animation: homeFadeUp 560ms cubic-bezier(.2,.8,.2,1) forwards;
        }
        .home-r2 { animation-delay: 90ms; }
        .home-r3 { animation-delay: 160ms; }
        .home-r4 { animation-delay: 230ms; }
        .home-r5 { animation-delay: 300ms; }
        .home-r6 { animation-delay: 370ms; }
        @keyframes homeFadeUp {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .home-reveal {
            opacity: 1;
            transform: none;
            animation: none;
          }
        }
      `}</style>
    </main>
  )
}

function buildHomeCategoryHref(category: (typeof CATEGORIES)[number]["value"]) {
  if (!category) return "/listings"
  return `/listings?category=${encodeURIComponent(category)}`
}

function buildHeroImages(rows: ListingImageRow[]): HeroImage[] {
  const fromListings = rows
    .map((row) => {
      const rawUrl = pickImageUrl(row)
      if (!rawUrl) return null
      if (!isProxyAllowed(rawUrl)) return null
      const badge = toDealBadge(row.deal_tier)
      return {
        src: toProxyImageUrl(rawUrl),
        alt: row.title || [row.make, row.model].filter(Boolean).join(" ") || "Featured aircraft",
        href: buildListingHref(row),
        dealBadgeText: badge.text,
        dealBadgeTone: badge.tone,
      }
    })
    .filter((value): value is HeroImage => Boolean(value))

  if (fromListings.length >= 4) {
    return fromListings.slice(0, 4)
  }

  const fallback = FALLBACK_HERO_IMAGES.map((image) => ({
    src: toProxyImageUrl(image.src),
    alt: image.alt,
    href: "/listings",
    dealBadgeText: "Featured",
    dealBadgeTone: "neutral" as const,
  }))
  return [...fromListings, ...fallback].slice(0, 4)
}

function buildSampleListingHref(rows: ListingImageRow[]) {
  const firstWithId = rows.find((row) => Boolean(row.id || row.source_id))
  if (!firstWithId) return "/listings"
  return buildListingHref(firstWithId)
}

function buildListingHref(row: ListingImageRow) {
  const listingId = row.id || row.source_id
  return listingId ? `/listings/${listingId}` : "/listings"
}

function pickImageUrl(row: ListingImageRow): string | null {
  const primary = typeof row.primary_image_url === "string" ? row.primary_image_url.trim() : ""
  if (primary) return primary

  if (Array.isArray(row.image_urls)) {
    for (const entry of row.image_urls) {
      if (typeof entry === "string" && entry.trim()) {
        return entry.trim()
      }
    }
  }

  return null
}

function toProxyImageUrl(url: string) {
  return `/api/image-proxy?url=${encodeURIComponent(url)}`
}

function isProxyAllowed(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl)
    const host = parsed.hostname.toLowerCase()
    if (ALLOWED_EXACT_HOSTS.has(host)) return true
    return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix))
  } catch {
    return false
  }
}

function toDealBadge(dealTier: string | null | undefined): { text: string; tone: "exceptional" | "good" | "neutral" } {
  const normalized = String(dealTier || "").trim().toUpperCase()
  if (normalized === "EXCEPTIONAL_DEAL") return { text: "Exceptional Deal", tone: "exceptional" }
  if (normalized === "GOOD_DEAL") return { text: "Good Deal", tone: "good" }
  return { text: "Featured", tone: "neutral" }
}
