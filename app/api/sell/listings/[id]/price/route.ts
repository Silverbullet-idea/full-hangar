import { NextRequest, NextResponse } from "next/server"
import {
  createRouteHandlerSupabaseClient,
  mergeSupabaseRouteCookies,
} from "@/lib/supabase/server"
import { updateListingPrice } from "@/lib/sell/dashboardRepository"

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, context: Params) {
  const cookieResponse = NextResponse.next({ request: { headers: request.headers } })
  const supabase = createRouteHandlerSupabaseClient(request, cookieResponse)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: listingId } = await context.params

  let body: { price?: unknown; currency?: unknown }
  try {
    body = (await request.json()) as { price?: unknown; currency?: unknown }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const price = typeof body.price === "number" ? body.price : Number(body.price)
  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: "Invalid price" }, { status: 400 })
  }

  const currency = typeof body.currency === "string" ? body.currency : "USD"

  const result = await updateListingPrice(supabase, listingId, user.id, price, currency)
  if (!result) {
    return mergeSupabaseRouteCookies(
      cookieResponse,
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    )
  }

  return mergeSupabaseRouteCookies(
    cookieResponse,
    NextResponse.json({ success: true, new_price: result.asking_price }),
  )
}
