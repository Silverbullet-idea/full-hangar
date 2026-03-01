import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "internal_session";
const MAX_SESSION_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

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

async function createSessionValue(secret: string): Promise<string> {
  const issuedAt = Date.now().toString();
  const signature = await signValue(issuedAt, secret);
  return `${issuedAt}.${signature}`;
}

export async function POST(request: NextRequest) {
  const envPassword = process.env.INTERNAL_PASSWORD;
  if (!envPassword) {
    return NextResponse.json(
      { error: "INTERNAL_PASSWORD is not configured." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  const password = body?.password;

  if (typeof password !== "string" || password !== envPassword) {
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }

  const sessionValue = await createSessionValue(envPassword);
  const response = NextResponse.redirect(
    new URL("/internal/diagnostics", request.url)
  );

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: sessionValue,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/internal",
    maxAge: MAX_SESSION_AGE_SECONDS,
  });

  return response;
}
