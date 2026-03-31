import { NextRequest, NextResponse } from "next/server"
import { calcPL, type DeskState } from "@/lib/dealCoach/deskState"
import {
  createRouteHandlerSupabaseClient,
  mergeSupabaseRouteCookies,
} from "@/lib/supabase/server"

function isDeskState(x: unknown): x is DeskState {
  if (!x || typeof x !== "object") return false
  const o = x as Record<string, unknown>
  const keys: (keyof DeskState)[] = [
    "offer",
    "prebuy",
    "title",
    "ferry",
    "annualReserve",
    "avionics",
    "detail",
    "squawks",
    "contingency",
    "holdMonths",
    "hangar",
    "insurance",
    "maintReserve",
    "demoFlight",
    "oppCost",
    "brokerage",
    "exitTitle",
    "sellCosts",
    "exitPrice",
  ]
  return keys.every((k) => typeof o[k] === "number" && Number.isFinite(o[k] as number))
}

export async function GET(request: NextRequest) {
  const cookieResponse = NextResponse.next({ request: { headers: request.headers } })
  const supabase = createRouteHandlerSupabaseClient(request, cookieResponse)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("deal_desk_scenarios")
    .select("id, listing_id, label, updated_at, created_at, coach_desk_state")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })

  if (error) {
    return mergeSupabaseRouteCookies(
      cookieResponse,
      NextResponse.json({ error: error.message }, { status: 500 }),
    )
  }

  return mergeSupabaseRouteCookies(cookieResponse, NextResponse.json({ scenarios: data ?? [] }))
}

export async function POST(request: NextRequest) {
  const cookieResponse = NextResponse.next({ request: { headers: request.headers } })
  const supabase = createRouteHandlerSupabaseClient(request, cookieResponse)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: {
    listing_id?: string | null
    name?: string
    scenario_data?: unknown
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const listingId =
    typeof body.listing_id === "string" && body.listing_id.trim().length > 0 ? body.listing_id.trim() : null
  const label =
    typeof body.name === "string" && body.name.trim().length > 0 ? body.name.trim() : "Deal Coach scenario"

  if (!isDeskState(body.scenario_data)) {
    return NextResponse.json({ error: "Invalid scenario_data" }, { status: 400 })
  }

  const desk = body.scenario_data
  const pl = calcPL(desk)

  const row = {
    listing_id: listingId,
    user_id: user.id,
    label,
    coach_desk_state: desk as unknown as Record<string, unknown>,
    hold_period_months: Math.min(24, Math.max(1, Math.round(desk.holdMonths))),
    estimated_resale_price: desk.exitPrice,
    asking_price: desk.offer,
    profit_at_ask: pl.profit,
    profit_percent_at_ask: pl.roi,
    max_offer_price: desk.offer,
    updated_at: new Date().toISOString(),
  }

  if (listingId) {
    const { data: existing, error: findErr } = await supabase
      .from("deal_desk_scenarios")
      .select("id")
      .eq("user_id", user.id)
      .eq("listing_id", listingId)
      .maybeSingle()

    if (findErr) {
      return mergeSupabaseRouteCookies(
        cookieResponse,
        NextResponse.json({ error: findErr.message }, { status: 500 }),
      )
    }

    if (existing?.id) {
      const { data, error } = await supabase
        .from("deal_desk_scenarios")
        .update(row)
        .eq("id", existing.id)
        .select()
        .single()
      if (error) {
        return mergeSupabaseRouteCookies(
          cookieResponse,
          NextResponse.json({ error: error.message }, { status: 500 }),
        )
      }
      return mergeSupabaseRouteCookies(cookieResponse, NextResponse.json({ scenario: data }))
    }
  }

  const { data, error } = await supabase.from("deal_desk_scenarios").insert(row).select().single()
  if (error) {
    return mergeSupabaseRouteCookies(
      cookieResponse,
      NextResponse.json({ error: error.message }, { status: 500 }),
    )
  }
  return mergeSupabaseRouteCookies(cookieResponse, NextResponse.json({ scenario: data }))
}
