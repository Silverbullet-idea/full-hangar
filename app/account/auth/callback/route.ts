import { NextRequest, NextResponse } from "next/server"
import { FH_AUTH_RETURN_COOKIE } from "@/lib/account/authReturnCookie"
import {
  createRouteHandlerSupabaseClient,
  mergeSupabaseRouteCookies,
} from "@/lib/supabase/server"

function safeInternalPath(path: string | null | undefined): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "/account"
  return path
}

export async function GET(request: NextRequest) {
  const cookieResponse = NextResponse.next({ request: { headers: request.headers } })
  const supabase = createRouteHandlerSupabaseClient(request, cookieResponse)
  const code = request.nextUrl.searchParams.get("code")
  const nextParam = request.nextUrl.searchParams.get("next")

  if (code) {
    await supabase.auth.exchangeCodeForSession(code)
  }

  const fromCookie = request.cookies.get(FH_AUTH_RETURN_COOKIE)?.value
  let target = "/account"
  if (fromCookie) {
    try {
      target = safeInternalPath(decodeURIComponent(fromCookie))
    } catch {
      target = "/account"
    }
  }
  if (nextParam) {
    target = safeInternalPath(nextParam)
  }

  const redirectUrl = new URL(target, request.nextUrl.origin)
  const res = NextResponse.redirect(redirectUrl)
  res.cookies.set(FH_AUTH_RETURN_COOKIE, "", { path: "/", maxAge: 0 })

  return mergeSupabaseRouteCookies(cookieResponse, res)
}
