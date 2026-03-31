import { NextRequest, NextResponse } from "next/server"
import {
  createPrivilegedServerClient,
  createRouteHandlerSupabaseClient,
  mergeSupabaseRouteCookies,
} from "@/lib/supabase/server"

const SOURCES = new Set(["search", "browse", "direct", "deal_coach", "unknown"])

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: listingId } = await context.params
  const trimmed = listingId?.trim()
  if (!trimmed) {
    return NextResponse.json({ error: "Missing listing id" }, { status: 400 })
  }

  const cookieResponse = NextResponse.next({ request: { headers: request.headers } })
  const authClient = createRouteHandlerSupabaseClient(request, cookieResponse)
  const {
    data: { user },
  } = await authClient.auth.getUser()

  let source = "unknown"
  let sessionId: string | null = null
  try {
    const body = (await request.json()) as { source?: unknown; session_id?: unknown }
    const s = typeof body.source === "string" ? body.source : "unknown"
    if (SOURCES.has(s)) source = s
    if (typeof body.session_id === "string" && body.session_id.trim().length > 0) {
      sessionId = body.session_id.trim().slice(0, 128)
    }
  } catch {
    // empty body OK
  }

  try {
    const privileged = createPrivilegedServerClient()
    const { error } = await privileged.from("listing_views").insert({
      listing_id: trimmed,
      source,
      session_id: sessionId,
      user_id: user?.id ?? null,
    })
    if (error) {
      return mergeSupabaseRouteCookies(
        cookieResponse,
        NextResponse.json({ error: error.message }, { status: 500 }),
      )
    }
  } catch (e) {
    return mergeSupabaseRouteCookies(
      cookieResponse,
      NextResponse.json(
        { error: e instanceof Error ? e.message : "Failed to record view" },
        { status: 500 },
      ),
    )
  }

  return mergeSupabaseRouteCookies(
    cookieResponse,
    NextResponse.json({ ok: true }, { status: 201 }),
  )
}
