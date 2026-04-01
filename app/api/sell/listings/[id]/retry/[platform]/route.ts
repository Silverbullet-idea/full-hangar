import { NextRequest, NextResponse } from "next/server"
import {
  createRouteHandlerSupabaseClient,
  mergeSupabaseRouteCookies,
} from "@/lib/supabase/server"
import { PLATFORMS, type Platform } from "@/lib/sell/dashboardTypes"
import { retryPlatformPost } from "@/lib/sell/dashboardRepository"

type Params = { params: Promise<{ id: string; platform: string }> }

function parsePlatformParam(p: string): Platform | null {
  return (PLATFORMS as readonly string[]).includes(p) ? (p as Platform) : null
}

export async function POST(request: NextRequest, context: Params) {
  const cookieResponse = NextResponse.next({ request: { headers: request.headers } })
  const supabase = createRouteHandlerSupabaseClient(request, cookieResponse)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: listingId, platform: platformParam } = await context.params
  const platform = parsePlatformParam(platformParam)
  if (!platform) {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 })
  }

  const ok = await retryPlatformPost(supabase, listingId, user.id, platform)
  if (!ok) {
    return mergeSupabaseRouteCookies(
      cookieResponse,
      NextResponse.json({ error: "Forbidden or nothing to retry" }, { status: 403 }),
    )
  }

  return mergeSupabaseRouteCookies(cookieResponse, NextResponse.json({ success: true }))
}
