import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "internal_session";
const MAX_SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function signValue(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value)
  );
  const signatureBytes = new Uint8Array(signatureBuffer);
  return Array.from(signatureBytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function isValidSession(
  sessionValue: string | undefined,
  secret: string
): Promise<boolean> {
  if (!sessionValue) return false;

  const [issuedAtRaw, signature] = sessionValue.split(".");
  if (!issuedAtRaw || !signature) return false;

  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) return false;
  if (Date.now() - issuedAt > MAX_SESSION_AGE_MS) return false;

  const expectedSignature = await signValue(issuedAtRaw, secret);
  return expectedSignature === signature;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow the login page itself.
  if (pathname === "/internal/login" || pathname.startsWith("/internal/login/")) {
    return NextResponse.next();
  }

  const internalPassword = process.env.INTERNAL_PASSWORD;
  const sessionValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!internalPassword || !(await isValidSession(sessionValue, internalPassword))) {
    return NextResponse.redirect(new URL("/internal/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/internal/:path*"],
};
