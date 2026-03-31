import { NextRequest, NextResponse } from "next/server"
import {
  createRouteHandlerSupabaseClient,
  mergeSupabaseRouteCookies,
} from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const cookieResponse = NextResponse.next({ request: { headers: request.headers } })
  const supabase = createRouteHandlerSupabaseClient(request, cookieResponse)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ counts: {} })
  }

  const since = new Date(Date.now() - 14 * 86400000).toISOString()

  const [searches, scenarios, alertLog] = await Promise.all([
    supabase
      .from("saved_searches")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("deal_desk_scenarios")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("price_alert_log")
      .select("id", { count: "exact", head: true })
      .gte("alerted_at", since),
  ])

  const counts: Record<string, number> = {}
  if ((searches.count ?? 0) > 0) counts.searches = searches.count!
  if ((scenarios.count ?? 0) > 0) counts.scenarios = scenarios.count!
  if ((alertLog.count ?? 0) > 0) counts.recentAlertRows = alertLog.count!

  return mergeSupabaseRouteCookies(
    cookieResponse,
    NextResponse.json(
      { counts },
      { headers: { "Cache-Control": "private, max-age=60" } },
    ),
  )
}
