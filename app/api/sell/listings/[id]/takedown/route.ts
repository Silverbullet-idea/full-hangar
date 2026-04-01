import { NextRequest, NextResponse } from "next/server"
import {
  createRouteHandlerSupabaseClient,
  mergeSupabaseRouteCookies,
} from "@/lib/supabase/server"
import { takeDownListing } from "@/lib/sell/dashboardRepository"

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
  const ok = await takeDownListing(supabase, listingId, user.id)
  if (!ok) {
    return mergeSupabaseRouteCookies(
      cookieResponse,
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    )
  }

  return mergeSupabaseRouteCookies(cookieResponse, NextResponse.json({ success: true }))
}
