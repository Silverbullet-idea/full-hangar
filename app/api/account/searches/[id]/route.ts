import { NextRequest, NextResponse } from "next/server"
import {
  createRouteHandlerSupabaseClient,
  mergeSupabaseRouteCookies,
} from "@/lib/supabase/server"

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  const cookieResponse = NextResponse.next({ request: { headers: request.headers } })
  const supabase = createRouteHandlerSupabaseClient(request, cookieResponse)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { name?: string; alert_enabled?: boolean }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (typeof body.name === "string") {
    const n = body.name.trim()
    patch.name = n.length > 0 ? n : "My search"
  }
  if (typeof body.alert_enabled === "boolean") {
    patch.alert_enabled = body.alert_enabled
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("saved_searches")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single()

  if (error) {
    return mergeSupabaseRouteCookies(
      cookieResponse,
      NextResponse.json({ error: error.message }, { status: 500 }),
    )
  }
  if (!data) {
    return mergeSupabaseRouteCookies(cookieResponse, NextResponse.json({ error: "Not found" }, { status: 404 }))
  }
  return mergeSupabaseRouteCookies(cookieResponse, NextResponse.json({ search: data }))
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  const cookieResponse = NextResponse.next({ request: { headers: request.headers } })
  const supabase = createRouteHandlerSupabaseClient(request, cookieResponse)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { error } = await supabase
    .from("saved_searches")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) {
    return mergeSupabaseRouteCookies(
      cookieResponse,
      NextResponse.json({ error: error.message }, { status: 500 }),
    )
  }
  return mergeSupabaseRouteCookies(cookieResponse, NextResponse.json({ ok: true }))
}
