import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseRscClient } from "@/lib/supabase/server"
import type { SellerFormData } from "@/lib/sell/sellerFormTypes"
import {
  type ListingStatus,
  type Platform,
  PLATFORMS,
  type PlatformStatus,
  type PlatformStatusRow,
  type SellerListingDetail,
  type SellerListingSummary,
} from "@/lib/sell/dashboardTypes"

type DbPlatformRow = {
  platform: string
  status: string
  external_listing_url: string | null
  error_message: string | null
  last_confirmed_at: string | null
}

type DbListingRow = {
  id: string
  year: number | null
  make: string | null
  model: string | null
  model_suffix: string | null
  n_number: string | null
  city: string | null
  state: string | null
  airport_id: string | null
  asking_price: number | string | null
  currency: string | null
  call_for_price: boolean | null
  listing_status: string
  sold_price: number | string | null
  sold_date: string | null
  sold_via_platform: string | null
  created_at: string
  taken_down_at: string | null
  form_payload: unknown
  description_intelligence: unknown
  seller_listing_platforms: DbPlatformRow[] | null
}

const PLATFORM_STATUSES: PlatformStatus[] = [
  "queued",
  "posting",
  "live",
  "failed",
  "removed",
  "unsupported",
]

function isPlatform(p: string): p is Platform {
  return (PLATFORMS as readonly string[]).includes(p)
}

function coercePlatformStatus(s: string): PlatformStatus {
  return PLATFORM_STATUSES.includes(s as PlatformStatus) ? (s as PlatformStatus) : "queued"
}

function buildPlatformStatuses(rows: DbPlatformRow[] | null | undefined): PlatformStatusRow[] {
  const map = new Map<Platform, DbPlatformRow>()
  for (const r of rows ?? []) {
    if (isPlatform(r.platform)) map.set(r.platform, r)
  }
  return PLATFORMS.map((platform) => {
    const row = map.get(platform)
    return {
      platform,
      status: row ? coercePlatformStatus(row.status) : "queued",
      external_listing_url: row?.external_listing_url ?? null,
      error_message: row?.error_message ?? null,
      last_confirmed_at: row?.last_confirmed_at ?? null,
    }
  })
}

function coerceListingStatus(s: string): ListingStatus {
  if (s === "active" || s === "sold" || s === "expired" || s === "taken_down") return s
  return "active"
}

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function aircraftLabel(
  year: number | null,
  make: string | null,
  model: string | null,
  modelSuffix: string | null,
): string {
  const parts: string[] = []
  if (year != null) parts.push(String(year))
  if (make?.trim()) parts.push(make.trim())
  if (model?.trim()) parts.push(model.trim())
  if (modelSuffix?.trim()) parts.push(modelSuffix.trim())
  return parts.length > 0 ? parts.join(" ") : "Aircraft listing"
}

function daysOnMarket(
  createdAt: string,
  listingStatus: ListingStatus,
  soldDate: string | null,
  takenDownAt: string | null,
): number {
  const start = new Date(createdAt).getTime()
  if (!Number.isFinite(start)) return 0
  let endMs = Date.now()
  if (listingStatus === "sold" && soldDate) {
    const t = new Date(soldDate).getTime()
    if (Number.isFinite(t)) endMs = t
  } else if (listingStatus === "taken_down" && takenDownAt) {
    const t = new Date(takenDownAt).getTime()
    if (Number.isFinite(t)) endMs = t
  }
  return Math.max(0, Math.floor((endMs - start) / 86_400_000))
}

function mapRow(row: DbListingRow): SellerListingSummary {
  const listingStatus = coerceListingStatus(row.listing_status)
  const soldDate = row.sold_date
  const takenDown = row.taken_down_at
  return {
    id: row.id,
    year: row.year,
    make: row.make,
    model: row.model,
    model_suffix: row.model_suffix,
    n_number: row.n_number,
    city: row.city,
    state: row.state,
    airport_id: row.airport_id,
    asking_price: num(row.asking_price),
    currency: row.currency?.trim() || "USD",
    call_for_price: Boolean(row.call_for_price),
    listing_status: listingStatus,
    sold_price: num(row.sold_price),
    sold_date: soldDate,
    sold_via_platform: row.sold_via_platform,
    created_at: row.created_at,
    taken_down_at: takenDown,
    platform_statuses: buildPlatformStatuses(row.seller_listing_platforms),
    days_on_market: daysOnMarket(row.created_at, listingStatus, soldDate, takenDown),
    aircraft_label: aircraftLabel(row.year, row.make, row.model, row.model_suffix),
  }
}

function parseFormPayload(raw: unknown): SellerFormData | null {
  if (!raw || typeof raw !== "object") return null
  return raw as SellerFormData
}

const LISTING_SELECT = `
      id,
      year,
      make,
      model,
      model_suffix,
      n_number,
      city,
      state,
      airport_id,
      asking_price,
      currency,
      call_for_price,
      listing_status,
      sold_price,
      sold_date,
      sold_via_platform,
      created_at,
      taken_down_at,
      seller_listing_platforms (
        platform,
        status,
        external_listing_url,
        error_message,
        last_confirmed_at
      )
    `

const LISTING_SELECT_DETAIL = `
      id,
      year,
      make,
      model,
      model_suffix,
      n_number,
      city,
      state,
      airport_id,
      asking_price,
      currency,
      call_for_price,
      listing_status,
      sold_price,
      sold_date,
      sold_via_platform,
      created_at,
      taken_down_at,
      form_payload,
      description_intelligence,
      seller_listing_platforms (
        platform,
        status,
        external_listing_url,
        error_message,
        last_confirmed_at
      )
    `

/** Authenticated reads (RSC or Route Handler client with user JWT). */
export async function fetchSellerListingsForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<SellerListingSummary[]> {
  const { data, error } = await supabase
    .from("seller_listings")
    .select(LISTING_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error || !data) return []
  return (data as DbListingRow[]).map(mapRow)
}

/** Cookie-backed reads for RSC — required for RLS (auth.uid()). */
export async function getSellerListings(): Promise<SellerListingSummary[]> {
  const supabase = await createSupabaseRscClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []
  return fetchSellerListingsForUser(supabase, user.id)
}

export async function getSellerListing(id: string): Promise<SellerListingDetail | null> {
  const supabase = await createSupabaseRscClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from("seller_listings")
    .select(LISTING_SELECT_DETAIL)
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (error || !data) return null
  const row = data as DbListingRow
  const summary = mapRow(row)
  const di = row.description_intelligence
  return {
    ...summary,
    form_payload: parseFormPayload(row.form_payload),
    description_intelligence:
      di && typeof di === "object" && !Array.isArray(di) ? (di as Record<string, unknown>) : null,
  }
}

export async function updateListingPrice(
  supabase: SupabaseClient,
  listingId: string,
  userId: string,
  newPrice: number,
  currency: string,
): Promise<{ asking_price: number; currency: string } | null> {
  const { data: owned, error: selErr } = await supabase
    .from("seller_listings")
    .select("id")
    .eq("id", listingId)
    .eq("user_id", userId)
    .maybeSingle()
  if (selErr || !owned) return null

  const { data: updated, error: upErr } = await supabase
    .from("seller_listings")
    .update({
      asking_price: newPrice,
      currency: currency.trim() || "USD",
    })
    .eq("id", listingId)
    .eq("user_id", userId)
    .select("asking_price, currency")
    .single()

  if (upErr || !updated) return null

  await supabase
    .from("seller_listing_platforms")
    .update({ status: "posting" })
    .eq("seller_listing_id", listingId)
    .eq("status", "live")

  const ap = num(updated.asking_price as number | string | null)
  return {
    asking_price: ap ?? newPrice,
    currency: String(updated.currency ?? currency).trim() || "USD",
  }
}

export async function markListingAsSold(
  supabase: SupabaseClient,
  listingId: string,
  userId: string,
  soldPrice: number | null,
  soldViaPlatform: string | null,
): Promise<boolean> {
  const { data: owned, error: selErr } = await supabase
    .from("seller_listings")
    .select("id")
    .eq("id", listingId)
    .eq("user_id", userId)
    .maybeSingle()
  if (selErr || !owned) return false

  const today = new Date().toISOString().slice(0, 10)
  const { error: upErr } = await supabase
    .from("seller_listings")
    .update({
      listing_status: "sold",
      sold_price: soldPrice,
      sold_date: today,
      sold_via_platform: soldViaPlatform?.trim() || null,
    })
    .eq("id", listingId)
    .eq("user_id", userId)

  if (upErr) return false

  await supabase.from("seller_listing_platforms").update({ status: "removed" }).eq("seller_listing_id", listingId)

  return true
}

export async function takeDownListing(
  supabase: SupabaseClient,
  listingId: string,
  userId: string,
): Promise<boolean> {
  const { data: owned, error: selErr } = await supabase
    .from("seller_listings")
    .select("id")
    .eq("id", listingId)
    .eq("user_id", userId)
    .maybeSingle()
  if (selErr || !owned) return false

  const { error: upErr } = await supabase
    .from("seller_listings")
    .update({
      listing_status: "taken_down",
      taken_down_at: new Date().toISOString(),
    })
    .eq("id", listingId)
    .eq("user_id", userId)

  if (upErr) return false

  await supabase.from("seller_listing_platforms").update({ status: "removed" }).eq("seller_listing_id", listingId)

  return true
}

export async function retryPlatformPost(
  supabase: SupabaseClient,
  listingId: string,
  userId: string,
  platform: Platform,
): Promise<boolean> {
  const { data: listing, error: lErr } = await supabase
    .from("seller_listings")
    .select("id")
    .eq("id", listingId)
    .eq("user_id", userId)
    .maybeSingle()
  if (lErr || !listing) return false

  const { data: updated, error } = await supabase
    .from("seller_listing_platforms")
    .update({ status: "queued", error_message: null })
    .eq("seller_listing_id", listingId)
    .eq("platform", platform)
    .eq("status", "failed")
    .select("id")

  return !error && Array.isArray(updated) && updated.length > 0
}
