import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"

const BETA_SESSION_COOKIE = "beta_session"

function getServiceRoleKey(): string | null {
  return (
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY ||
    null
  )
}

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true
  if (pathname.startsWith("/api/waitlist")) return true
  if (pathname.startsWith("/api/image-proxy")) return true
  if (pathname.startsWith("/api/cron/")) return true
  if (pathname === "/api/stripe/webhook") return true
  if (pathname === "/api/internal/auth") return true
  if (pathname.startsWith("/api/listing-fallback-image")) return true
  if (pathname.startsWith("/api/auth/")) return true
  if (pathname.startsWith("/_next")) return true
  if (pathname.startsWith("/favicon")) return true
  if (pathname.startsWith("/logo")) return true
  if (pathname.startsWith("/images")) return true
  if (pathname.startsWith("/public")) return true
  if (pathname === "/account/login" || pathname.startsWith("/account/login/")) return true
  if (pathname === "/account/signup" || pathname.startsWith("/account/signup/")) return true
  if (pathname === "/account/verify" || pathname.startsWith("/account/verify/")) return true
  if (pathname.startsWith("/account/auth/")) return true
  if (pathname === "/internal/login" || pathname.startsWith("/internal/login/")) return true
  if (pathname.startsWith("/beta/join")) return true
  if (/\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot)$/i.test(pathname)) return true
  return false
}

function withNoIndex(response: NextResponse) {
  response.headers.set("X-Robots-Tag", "noindex, nofollow")
  return response
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  let response = NextResponse.next({ request })

  if (!supabaseUrl || !supabaseAnon) {
    return withNoIndex(response)
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (pathname.startsWith("/beta/dashboard")) {
    const betaSession = request.cookies.get(BETA_SESSION_COOKIE)?.value
    if (!betaSession) {
      return withNoIndex(
        NextResponse.redirect(new URL("/beta/join?error=session_expired", request.url)),
      )
    }
    return withNoIndex(response)
  }

  if (isPublicPath(pathname)) {
    return withNoIndex(response)
  }

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const url = request.nextUrl.clone()
    url.pathname = "/"
    url.search = ""
    return withNoIndex(NextResponse.redirect(url))
  }

  const serviceKey = getServiceRoleKey()
  if (!serviceKey) {
    console.error("[proxy] Missing service role key for access check")
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 })
    }
    return withNoIndex(NextResponse.redirect(new URL("/", request.url)))
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  const { data: profile, error: profileError } = await adminClient
    .from("user_profiles")
    .select("access_status, is_admin")
    .eq("id", user.id)
    .maybeSingle()

  if (profileError) {
    console.error("[proxy] profile read failed:", profileError.message)
  }

  const accessStatus = profile?.access_status ?? "pending"
  const isAdmin = Boolean(profile?.is_admin)

  if (accessStatus !== "approved") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Access pending approval", code: "pending_approval" },
        { status: 403 },
      )
    }
    const url = request.nextUrl.clone()
    url.pathname = "/"
    url.searchParams.set("status", "pending")
    return withNoIndex(NextResponse.redirect(url))
  }

  if (pathname.startsWith("/internal/") && !pathname.startsWith("/internal/login")) {
    if (!isAdmin) {
      return withNoIndex(NextResponse.redirect(new URL("/listings", request.url)))
    }
  }

  return withNoIndex(response)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot)$).*)",
  ],
}
