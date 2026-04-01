import { NextRequest, NextResponse } from "next/server"
import {
  createRouteHandlerSupabaseClient,
  mergeSupabaseRouteCookies,
} from "@/lib/supabase/server"
import { markListingAsSold } from "@/lib/sell/dashboardRepository"

type Params = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: Params) {
  const cookieResponse = NextResponse.next({ request: { headers: request.headers } })
  const supabase = createRouteHandlerSupabaseClient(request, cookieResponse)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: listingId } = await context.params

  let body: { sold_price?: unknown; sold_via_platform?: unknown } = {}
  try {
    const raw = await request.text()
    if (raw.trim()) body = JSON.parse(raw) as { sold_price?: unknown; sold_via_platform?: unknown }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  let soldPrice: number | null = null
  if (body.sold_price !== undefined && body.sold_price !== null && body.sold_price !== "") {
    const n = typeof body.sold_price === "number" ? body.sold_price : Number(body.sold_price)
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: "Invalid sold_price" }, { status: 400 })
    }
    soldPrice = n
  }

  const soldVia =
    typeof body.sold_via_platform === "string" && body.sold_via_platform.trim()
      ? body.sold_via_platform.trim()
      : null

  const ok = await markListingAsSold(supabase, listingId, user.id, soldPrice, soldVia)
  if (!ok) {
    return mergeSupabaseRouteCookies(
      cookieResponse,
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    )
  }

  return mergeSupabaseRouteCookies(cookieResponse, NextResponse.json({ success: true }))
}
