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
    .from("user_profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  if (error) {
    return mergeSupabaseRouteCookies(
      cookieResponse,
      NextResponse.json({ error: error.message }, { status: 500 }),
    )
  }
  return mergeSupabaseRouteCookies(
    cookieResponse,
    NextResponse.json({
      profile: data,
      user: { email: user.email, id: user.id },
    }),
  )
}

export async function PATCH(request: NextRequest) {
  const cookieResponse = NextResponse.next({ request: { headers: request.headers } })
  const supabase = createRouteHandlerSupabaseClient(request, cookieResponse)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const allowed = [
    "display_name",
    "avatar_url",
    "notify_price_drops",
    "notify_new_matches",
    "notify_product_updates",
    "onboarding_completed",
  ] as const
  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) patch[key] = body[key]
  }

  const { data, error } = await supabase
    .from("user_profiles")
    .update(patch)
    .eq("id", user.id)
    .select()
    .single()

  if (error) {
    return mergeSupabaseRouteCookies(
      cookieResponse,
      NextResponse.json({ error: error.message }, { status: 500 }),
    )
  }
  return mergeSupabaseRouteCookies(cookieResponse, NextResponse.json({ profile: data }))
}
