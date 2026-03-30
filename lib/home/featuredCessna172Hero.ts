import { unstable_cache } from "next/cache"
import {
  HERO_EXAMPLE_CAROUSEL_FALLBACK_SLIDES,
  type HeroExampleCarouselSlide,
} from "@/lib/home/heroExampleFallbackSlides"
import { buildHeroFeaturedScoreCard, type HeroHomeScoreCardPayload } from "@/lib/home/heroFeaturedScoreCard"
import { isListingImageProxyAllowedUrl } from "@/lib/media/listingImageProxyPolicy"
import { createReadServerClient } from "@/lib/supabase/server"

const LISTING_HERO_SELECT = [
  "id",
  "make",
  "model",
  "year",
  "flip_score",
  "flip_tier",
  "flip_explanation",
  "primary_image_url",
  "image_urls",
  "asking_price",
  "vs_median_price",
  "n_number",
  "total_time_airframe",
  "location_label",
  "location_state",
  "ev_pct_life_remaining",
  "has_glass_cockpit",
  "is_steam_gauge",
  "avionics_matched_items",
  "comp_median_price",
  "comp_p25_price",
  "comp_p75_price",
  "price_reduced",
  "price_reduction_amount",
  "risk_level",
].join(",")

export type FeaturedHeroCarouselResult =
  | {
      mode: "live"
      listingId: string
      listingTitle: string
      flipScore: number | null
      slides: HeroExampleCarouselSlide[]
      scoreCard: HeroHomeScoreCardPayload
    }
  | { mode: "fallback"; slides: HeroExampleCarouselSlide[]; scoreCard: HeroHomeScoreCardPayload }

/** User asked for more than 10 working images; we require at least this many pass HTTP checks. */
const MIN_WORKING_IMAGES = 11
const MAX_CAROUSEL_SLIDES = 14
const CANDIDATE_ROW_LIMIT = 50
const URL_VALIDATE_CONCURRENCY = 6

function parseImageUrlCandidates(value: unknown): string[] {
  const normalize = (input: unknown) =>
    Array.from(
      new Set(
        (Array.isArray(input) ? input : [])
          .map((item) => String(item ?? "").trim())
          .filter((item) => item.length > 0)
      )
    )

  if (Array.isArray(value)) return normalize(value)
  if (typeof value !== "string") return []

  const raw = value.trim()
  if (!raw) return []
  if (raw.startsWith("[")) {
    try {
      return normalize(JSON.parse(raw))
    } catch {
      /* ignore */
    }
  }
  if (raw.includes(",")) return normalize(raw.split(","))
  return [raw]
}

function collectProxiableGalleryUrls(row: Record<string, unknown>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (u: string) => {
    const t = u.trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    out.push(t)
  }
  const primary = String(row.primary_image_url ?? "").trim()
  if (primary) push(primary)
  for (const u of parseImageUrlCandidates(row.image_urls)) {
    if (isListingImageProxyAllowedUrl(u)) push(u)
  }
  return out
}

function toProxySrc(remoteUrl: string): string {
  return `/api/image-proxy?url=${encodeURIComponent(remoteUrl)}`
}

async function remoteImageLoads(remoteUrl: string): Promise<boolean> {
  if (!isListingImageProxyAllowedUrl(remoteUrl)) return false

  let parsed: URL
  try {
    parsed = new URL(remoteUrl)
  } catch {
    return false
  }

  const host = parsed.hostname.toLowerCase()
  const headers: Record<string, string> = {
    Referer: `https://${host}/`,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  }

  const contentTypeIsImage = (ct: string | null) => (ct ?? "").toLowerCase().startsWith("image/")

  const tryHead = async (url: string): Promise<boolean> => {
    try {
      const res = await fetch(url, {
        method: "HEAD",
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(9000),
      })
      if (!res.ok) return false
      return contentTypeIsImage(res.headers.get("content-type"))
    } catch {
      return false
    }
  }

  const tryGetRange = async (url: string): Promise<boolean> => {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { ...headers, Range: "bytes=0-8191" },
        redirect: "follow",
        signal: AbortSignal.timeout(14000),
      })
      if (!res.ok) return false
      return contentTypeIsImage(res.headers.get("content-type"))
    } catch {
      return false
    }
  }

  if (await tryHead(parsed.toString())) return true

  if (host === "cdn-media.tilabs.io" && parsed.search) {
    const retry = new URL(parsed.toString())
    retry.search = ""
    if (await tryHead(retry.toString())) return true
    if (await tryGetRange(retry.toString())) return true
  }

  return tryGetRange(parsed.toString())
}

async function filterWorkingUrlsOrdered(urls: string[], stopWhen: number): Promise<string[]> {
  const ok: string[] = []
  for (let i = 0; i < urls.length; i += URL_VALIDATE_CONCURRENCY) {
    if (ok.length >= stopWhen) break
    const slice = urls.slice(i, i + URL_VALIDATE_CONCURRENCY)
    const flags = await Promise.all(slice.map((u) => remoteImageLoads(u)))
    slice.forEach((u, j) => {
      if (flags[j] && ok.length < stopWhen) ok.push(u)
    })
  }
  return ok
}

function listingTitleFromRow(row: Record<string, unknown>): string {
  const y = typeof row.year === "number" && row.year > 0 ? `${row.year} ` : ""
  const make = String(row.make ?? "").trim()
  const model = String(row.model ?? "").trim()
  const core = [make, model].filter(Boolean).join(" ").trim()
  return `${y}${core}`.trim() || "Cessna 172"
}

async function resolveFeaturedLive(): Promise<FeaturedHeroCarouselResult> {
  const supabase = createReadServerClient()
  const result = await supabase
    .from("public_listings")
    .select(LISTING_HERO_SELECT)
    .eq("is_active", true)
    .not("flip_score", "is", null)
    .ilike("make", "%Cessna%")
    .ilike("model", "%172%")
    .order("flip_score", { ascending: false, nullsFirst: false })
    .limit(CANDIDATE_ROW_LIMIT)

  if (result.error) {
    console.error("[featuredCessna172Hero] public_listings query failed", result.error.message)
    return {
      mode: "fallback",
      slides: [...HERO_EXAMPLE_CAROUSEL_FALLBACK_SLIDES],
      scoreCard: { kind: "demo" },
    }
  }

  const rows = (result.data ?? []) as unknown as Record<string, unknown>[]
  for (const row of rows) {
    const candidates = collectProxiableGalleryUrls(row)
    if (candidates.length < MIN_WORKING_IMAGES) continue

    const working = await filterWorkingUrlsOrdered(candidates, MAX_CAROUSEL_SLIDES)
    if (working.length <= MIN_WORKING_IMAGES - 1) continue

    const useUrls = working
    const title = listingTitleFromRow(row)
    const slides: HeroExampleCarouselSlide[] = useUrls.map((remote, idx) => ({
      src: toProxySrc(remote),
      alt: `Photo ${idx + 1} — ${title} (live marketplace listing)`,
      label: `Photo ${idx + 1}`,
    }))

    const scoreCard = buildHeroFeaturedScoreCard(row)

    return {
      mode: "live",
      listingId: String(row.id ?? ""),
      listingTitle: title,
      flipScore: typeof row.flip_score === "number" ? row.flip_score : null,
      slides,
      scoreCard,
    }
  }

  return {
    mode: "fallback",
    slides: [...HERO_EXAMPLE_CAROUSEL_FALLBACK_SLIDES],
    scoreCard: { kind: "demo" },
  }
}

const getCachedFeatured = unstable_cache(resolveFeaturedLive, ["featured-cessna172-hero-carousel-v2"], {
  revalidate: 3600,
  tags: ["featured-cessna172-hero"],
})

/**
 * Highest flip-score active Cessna + 172 with 11+ gallery URLs that pass the same host policy as `/api/image-proxy`
 * and respond over HTTP. Cached to avoid hammering upstream CDNs on every home page view.
 */
export function getFeaturedCessna172HeroCarousel(): Promise<FeaturedHeroCarouselResult> {
  return getCachedFeatured()
}
