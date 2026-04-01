import { NextRequest, NextResponse } from "next/server"
import {
  createRouteHandlerSupabaseClient,
  mergeSupabaseRouteCookies,
} from "@/lib/supabase/server"
import { fetchSellerListingsForUser } from "@/lib/sell/dashboardRepository"

export async function GET(request: NextRequest) {
  const cookieResponse = NextResponse.next({ request: { headers: request.headers } })
  const supabase = createRouteHandlerSupabaseClient(request, cookieResponse)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const listings = await fetchSellerListingsForUser(supabase, user.id)
  return mergeSupabaseRouteCookies(cookieResponse, NextResponse.json({ listings }))
}
