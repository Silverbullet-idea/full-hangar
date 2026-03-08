import { NextRequest, NextResponse } from "next/server";

export const INTERNAL_SESSION_COOKIE = "internal_session";
const INTERNAL_MAX_SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const INTERNAL_MAX_SESSION_AGE_SECONDS = 7 * 24 * 60 * 60;
const INTERNAL_PASSWORD_FALLBACK = "hippo8me";

export function getInternalSessionSecret(): string {
  const configured = String(process.env.INTERNAL_PASSWORD || "").trim();
  return configured || INTERNAL_PASSWORD_FALLBACK;
}

async function signValue(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signatureBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createInternalSessionValue(secret: string): Promise<string> {
  const issuedAt = Date.now().toString();
  const signature = await signValue(issuedAt, secret);
  return `${issuedAt}.${signature}`;
}

export async function isValidInternalSession(
  sessionValue: string | undefined,
  secret: string
): Promise<boolean> {
  if (!sessionValue) return false;
  const [issuedAtRaw, signature] = sessionValue.split(".");
  if (!issuedAtRaw || !signature) return false;

  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) return false;
  if (Date.now() - issuedAt > INTERNAL_MAX_SESSION_AGE_MS) return false;

  const expectedSignature = await signValue(issuedAtRaw, secret);
  return expectedSignature === signature;
}

export async function ensureInternalApiAccess(
  request: NextRequest
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const internalPassword = getInternalSessionSecret();

  const sessionValue = request.cookies.get(INTERNAL_SESSION_COOKIE)?.value;
  const valid = await isValidInternalSession(sessionValue, internalPassword);
  if (!valid) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true };
}

export const internalSessionCookieOptions = {
  name: INTERNAL_SESSION_COOKIE,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: INTERNAL_MAX_SESSION_AGE_SECONDS,
};
