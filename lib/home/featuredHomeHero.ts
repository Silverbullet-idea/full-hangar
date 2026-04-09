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

/** Enough gallery depth for the hero carousel after HTTP verification. */
const MIN_WORKING_IMAGES = 5
const MAX_CAROUSEL_SLIDES = 14
const CANDIDATE_ROW_LIMIT = 120
const URL_VALIDATE_CONCURRENCY = 6
const MIN_FLIP_SCORE = 60
const MIN_ASKING_PRICE = 60_000
const EXCLUSION_LOOKBACK_DAYS = 30

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
  return `${y}${core}`.trim() || "Featured aircraft"
}

function utcDateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

function exclusionCutoffDate(utcDate: string): string {
  const base = new Date(`${utcDate}T12:00:00.000Z`)
  base.setUTCDate(base.getUTCDate() - EXCLUSION_LOOKBACK_DAYS)
  return base.toISOString().slice(0, 10)
}

function fnv1aHash32(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pickStartIndex(dateKey: string, length: number): number {
  if (length <= 0) return 0
  return fnv1aHash32(`home-hero|${dateKey}`) % length
}

function rowMeetsScoreAndPrice(row: Record<string, unknown>): boolean {
  const flip = row.flip_score
  const flipOk = typeof flip === "number" && Number.isFinite(flip) && flip > MIN_FLIP_SCORE
  const price = row.asking_price
  const priceOk = typeof price === "number" && Number.isFinite(price) && price > MIN_ASKING_PRICE
  return flipOk && priceOk
}

async function loadRecentFeaturedIds(
  supabase: ReturnType<typeof createReadServerClient>,
  utcDate: string
): Promise<Set<string>> {
  try {
    const cutoff = exclusionCutoffDate(utcDate)
    const { data, error } = await supabase
      .from("home_hero_daily_feature")
      .select("listing_id")
      .gte("featured_date", cutoff)

    if (error) {
      console.warn("[featuredHomeHero] home_hero_daily_feature read failed (rotation history)", error.message)
      return new Set()
    }
    return new Set((data ?? []).map((r) => String(r.listing_id)))
  } catch (e) {
    console.warn("[featuredHomeHero] home_hero_daily_feature read threw", e)
    return new Set()
  }
}

async function loadTodaysPickId(
  supabase: ReturnType<typeof createReadServerClient>,
  utcDate: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("home_hero_daily_feature")
      .select("listing_id")
      .eq("featured_date", utcDate)
      .maybeSingle()

    if (error) {
      console.warn("[featuredHomeHero] today pick read failed", error.message)
      return null
    }
    return data?.listing_id ? String(data.listing_id) : null
  } catch (e) {
    console.warn("[featuredHomeHero] today pick read threw", e)
    return null
  }
}

async function persistTodaysPick(
  supabase: ReturnType<typeof createReadServerClient>,
  utcDate: string,
  listingId: string
): Promise<void> {
  try {
    const { error } = await supabase.from("home_hero_daily_feature").upsert(
      { featured_date: utcDate, listing_id: listingId },
      { onConflict: "featured_date" }
    )
    if (error) {
      console.warn("[featuredHomeHero] could not persist daily pick (table missing until migration?)", error.message)
    }
  } catch (e) {
    console.warn("[featuredHomeHero] persist daily pick threw", e)
  }
}

async function fetchListingRowById(
  supabase: ReturnType<typeof createReadServerClient>,
  id: string
): Promise<Record<string, unknown> | null> {
  // aircraft_listings: indexed columns — avoids public_listings view (heavy JSON) timeouts on home load.
  const { data, error } = await supabase
    .from("aircraft_listings")
    .select(LISTING_HERO_SELECT)
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle()

  if (error) {
    console.warn("[featuredHomeHero] single listing fetch failed", error.message)
    return null
  }
  return data != null ? (data as unknown as Record<string, unknown>) : null
}

async function fetchCandidateRows(
  supabase: ReturnType<typeof createReadServerClient>,
  excludeIds: Set<string>
): Promise<Record<string, unknown>[]> {
  const excluded = [...excludeIds].filter(Boolean)
  let q = supabase
    .from("aircraft_listings")
    .select(LISTING_HERO_SELECT)
    .eq("is_active", true)
    .not("flip_score", "is", null)
    .gt("flip_score", MIN_FLIP_SCORE)
    .gt("asking_price", MIN_ASKING_PRICE)
    .order("flip_score", { ascending: false, nullsFirst: false })
    .limit(CANDIDATE_ROW_LIMIT)

  if (excluded.length > 0) {
    q = q.not("id", "in", `(${excluded.join(",")})`)
  }

  const { data, error } = await q
  if (error) {
    // Warn only: we fall back to demo carousel; console.error surfaces as a dev overlay on every home hit.
    console.warn("[featuredHomeHero] aircraft_listings candidate query failed", error.message)
    return []
  }
  return (data ?? []) as unknown as Record<string, unknown>[]
}

async function tryBuildLiveResult(row: Record<string, unknown>): Promise<FeaturedHeroCarouselResult | null> {
  if (!rowMeetsScoreAndPrice(row)) return null

  const candidates = collectProxiableGalleryUrls(row)
  if (candidates.length < MIN_WORKING_IMAGES) return null

  const working = await filterWorkingUrlsOrdered(candidates, MAX_CAROUSEL_SLIDES)
  if (working.length < MIN_WORKING_IMAGES) return null

  const title = listingTitleFromRow(row)
  const slides: HeroExampleCarouselSlide[] = working.map((remote, idx) => ({
    src: toProxySrc(remote),
    alt: `Photo ${idx + 1} — ${title} (live marketplace listing)`,
    label: `Photo ${idx + 1}`,
  }))

  const scoreCard = buildHeroFeaturedScoreCard(row)
  if (scoreCard.kind !== "live") return null

  return {
    mode: "live",
    listingId: String(row.id ?? ""),
    listingTitle: title,
    flipScore: typeof row.flip_score === "number" ? row.flip_score : null,
    slides,
    scoreCard,
  }
}

async function pickFromRows(
  rows: Record<string, unknown>[],
  utcDate: string
): Promise<FeaturedHeroCarouselResult | null> {
  if (rows.length === 0) return null
  const start = pickStartIndex(utcDate, rows.length)
  const ordered = [...rows.slice(start), ...rows.slice(0, start)]

  for (const row of ordered) {
    const built = await tryBuildLiveResult(row)
    if (built) return built
  }
  return null
}

async function resolveFeaturedLive(utcDate: string): Promise<FeaturedHeroCarouselResult> {
  const supabase = createReadServerClient()
  const fallback: FeaturedHeroCarouselResult = {
    mode: "fallback",
    slides: [...HERO_EXAMPLE_CAROUSEL_FALLBACK_SLIDES],
    scoreCard: { kind: "demo" },
  }

  const recentIds = await loadRecentFeaturedIds(supabase, utcDate)
  const todaysId = await loadTodaysPickId(supabase, utcDate)

  if (todaysId) {
    const pinned = await fetchListingRowById(supabase, todaysId)
    if (pinned && rowMeetsScoreAndPrice(pinned)) {
      const built = await tryBuildLiveResult(pinned)
      if (built) return built
    }
  }

  let rows = await fetchCandidateRows(supabase, recentIds)
  let picked = await pickFromRows(rows, utcDate)

  if (!picked && recentIds.size > 0) {
    rows = await fetchCandidateRows(supabase, new Set())
    picked = await pickFromRows(rows, utcDate)
  }

  if (!picked) return fallback

  if (picked.mode === "live" && picked.listingId) {
    await persistTodaysPick(supabase, utcDate, picked.listingId)
  }

  return picked
}

const getCachedFeaturedForDate = unstable_cache(
  async (utcDate: string) => resolveFeaturedLive(utcDate),
  ["home-hero-featured-v1"],
  {
    revalidate: 86_400,
    tags: ["home-hero-featured"],
  }
)

/**
 * Daily home hero: active listing with asking price > $60k, flip score > 60, several verified photos.
 * Persists the UTC-day pick and skips aircraft featured in the last 30 days. Falls back to demo slides if none qualify.
 */
export function getFeaturedHomeHeroCarousel(): Promise<FeaturedHeroCarouselResult> {
  return getCachedFeaturedForDate(utcDateKey())
}

/** @deprecated Use getFeaturedHomeHeroCarousel */
export const getFeaturedCessna172HeroCarousel = getFeaturedHomeHeroCarousel
