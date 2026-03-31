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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data, error } = await supabase
    .from("saved_searches")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    return mergeSupabaseRouteCookies(
      cookieResponse,
      NextResponse.json({ error: error.message }, { status: 500 }),
    )
  }
  return mergeSupabaseRouteCookies(cookieResponse, NextResponse.json({ searches: data ?? [] }))
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

  let body: { name?: string; filters?: unknown; alert_enabled?: boolean }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const name =
    typeof body.name === "string" && body.name.trim().length > 0
      ? body.name.trim()
      : "My search"
  const filters =
    body.filters !== undefined && body.filters !== null && typeof body.filters === "object"
      ? (body.filters as Record<string, unknown>)
      : {}
  const alert_enabled = Boolean(body.alert_enabled)

  const { data, error } = await supabase
    .from("saved_searches")
    .insert({
      user_id: user.id,
      name,
      filters,
      alert_enabled,
    })
    .select()
    .single()

  if (error) {
    return mergeSupabaseRouteCookies(
      cookieResponse,
      NextResponse.json({ error: error.message }, { status: 500 }),
    )
  }
  return mergeSupabaseRouteCookies(cookieResponse, NextResponse.json({ search: data }))
}
