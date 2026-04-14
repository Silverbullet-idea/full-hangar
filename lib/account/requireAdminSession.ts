import { NextRequest, NextResponse } from "next/server"
import {
  createPrivilegedServerClient,
  createRouteHandlerSupabaseClient,
  mergeSupabaseRouteCookies,
} from "@/lib/supabase/server"
import type { User } from "@supabase/supabase-js"

export type AdminSessionOk = { ok: true; user: User; cookieResponse: NextResponse }
export type AdminSessionFail = { ok: false; response: NextResponse }

export async function requireAdminSession(
  request: NextRequest,
): Promise<{ ok: true; user: User; cookieResponse: NextResponse } | { ok: false; response: NextResponse }> {
  const cookieResponse = NextResponse.next({ request: { headers: request.headers } })
  const supabase = createRouteHandlerSupabaseClient(request, cookieResponse)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const db = createPrivilegedServerClient()
  const { data: profile } = await db.from("user_profiles").select("is_admin").eq("id", user.id).maybeSingle()
  if (!profile?.is_admin) {
    return {
      ok: false as const,
      response: mergeSupabaseRouteCookies(
        cookieResponse,
        NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      ),
    }
  }

  return { ok: true as const, user, cookieResponse }
}
