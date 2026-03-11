import { NextRequest, NextResponse } from "next/server";
import { getInternalSessionSecret, INTERNAL_SESSION_COOKIE, isValidInternalSession } from "@/lib/internal/auth";

const BETA_SESSION_COOKIE = "beta_session";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const noIndexHeader = "noindex, nofollow";
  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", noIndexHeader);

  // Allow the login page itself.
  if (pathname === "/internal/login" || pathname.startsWith("/internal/login/")) {
    return response;
  }

  if (pathname.startsWith("/beta/join")) {
    return response;
  }

  if (pathname.startsWith("/beta/dashboard")) {
    const betaSession = request.cookies.get(BETA_SESSION_COOKIE)?.value;
    if (!betaSession) {
      return NextResponse.redirect(new URL("/beta/join?error=session_expired", request.url));
    }
    return response;
  }

  const internalPassword = getInternalSessionSecret();
  const sessionValue = request.cookies.get(INTERNAL_SESSION_COOKIE)?.value;
  if (!(await isValidInternalSession(sessionValue, internalPassword))) {
    const response = NextResponse.redirect(new URL("/internal/login", request.url));
    response.headers.set("X-Robots-Tag", noIndexHeader);
    return response;
  }

  return response;
}

export const config = {
  matcher: ["/internal/:path*", "/beta/:path*"],
};
