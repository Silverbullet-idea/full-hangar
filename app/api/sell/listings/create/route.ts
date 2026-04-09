import { revalidatePath } from "next/cache"
import { NextRequest, NextResponse } from "next/server"
import type { SellerSubmissionPayload } from "@/lib/sell/sellerFormTypes"
import {
  createPrivilegedServerClient,
  createRouteHandlerSupabaseClient,
  mergeSupabaseRouteCookies,
} from "@/lib/supabase/server"

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
}

function isSellerSubmissionPayload(v: unknown): v is SellerSubmissionPayload {
  if (!isRecord(v)) return false
  if (!isRecord(v.description_intelligence)) return false
  if (!isRecord(v.description_intelligence.seller_form_extras)) return false
  return true
}

function extraString(ex: Record<string, unknown>, key: string): string | null {
  const raw = ex[key]
  if (typeof raw !== "string") return null
  const t = raw.trim()
  return t.length > 0 ? t : null
}

function extraBool(ex: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const raw = ex[key]
  return typeof raw === "boolean" ? raw : fallback
}

function extraStringOr(ex: Record<string, unknown>, key: string, fallback: string): string {
  const s = extraString(ex, key)
  return s ?? fallback
}

const PLATFORMS = ["controller", "tradaplane", "aso", "barnstormers", "avbuyer"] as const

export async function POST(request: NextRequest) {
  const cookieResponse = NextResponse.next({ request: { headers: request.headers } })
  const authClient = createRouteHandlerSupabaseClient(request, cookieResponse)
  const {
    data: { user },
  } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return mergeSupabaseRouteCookies(
      cookieResponse,
      NextResponse.json({ error: "Invalid JSON" }, { status: 400 }),
    )
  }

  if (!isSellerSubmissionPayload(body)) {
    return mergeSupabaseRouteCookies(
      cookieResponse,
      NextResponse.json({ error: "Invalid payload" }, { status: 400 }),
    )
  }

  const payload = body
  const extras = payload.description_intelligence.seller_form_extras

  const insertRow = {
    user_id: user.id,
    n_number: payload.n_number ?? null,
    year: payload.year ?? null,
    make: payload.make?.trim() || null,
    model: payload.model?.trim() || null,
    model_suffix: extraString(extras, "model_suffix") ?? null,
    serial_number: payload.serial_number ?? null,
    category: extraString(extras, "category") ?? null,
    asking_price: payload.asking_price ?? null,
    currency: extraStringOr(extras, "currency", "USD"),
    price_extension: extraString(extras, "price_extension") ?? null,
    call_for_price: extraBool(extras, "call_for_price", false),
    city: payload.city ?? null,
    state: payload.state ?? null,
    country:
      (typeof payload.country === "string" && payload.country.trim()) ||
      extraStringOr(extras, "country", "United States"),
    airport_id: extraString(extras, "airport_id") ?? null,
    zip: extraString(extras, "zip") ?? null,
    listing_status: "active" as const,
    form_payload: payload,
    description_intelligence: {
      ...payload.description_intelligence,
    },
  }

  const db = createPrivilegedServerClient()

  const { data: newListing, error: insertError } = await db
    .from("seller_listings")
    .insert(insertRow)
    .select("id")
    .single()

  if (insertError) {
    console.error("[sell/listings/create] seller_listings insert", insertError)
    return mergeSupabaseRouteCookies(
      cookieResponse,
      NextResponse.json({ error: insertError.message }, { status: 500 }),
    )
  }

  if (!newListing?.id) {
    return mergeSupabaseRouteCookies(
      cookieResponse,
      NextResponse.json({ error: "Insert returned no id" }, { status: 500 }),
    )
  }

  const platformRows = PLATFORMS.map((platform) => ({
    seller_listing_id: newListing.id,
    platform,
    status: "queued" as const,
  }))

  const { error: platError } = await db.from("seller_listing_platforms").insert(platformRows)

  let platform_insert_warning = false
  if (platError) {
    console.error("[sell/listings/create] seller_listing_platforms insert", platError)
    platform_insert_warning = true
  }

  revalidatePath("/", "layout")
  revalidatePath("/sell")
  revalidatePath("/sell/dashboard")

  return mergeSupabaseRouteCookies(
    cookieResponse,
    NextResponse.json({
      success: true,
      seller_listing_id: newListing.id,
      ...(platform_insert_warning ? { platform_insert_warning: true } : {}),
    }),
  )
}
