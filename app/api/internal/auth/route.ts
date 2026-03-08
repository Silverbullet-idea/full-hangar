import { NextRequest, NextResponse } from "next/server";
import { createInternalSessionValue, internalSessionCookieOptions } from "@/lib/internal/auth";

export async function POST(request: NextRequest) {
  const envUsername = process.env.INTERNAL_USERNAME || "Ryan";
  const envPassword = process.env.INTERNAL_PASSWORD;
  if (!envPassword) {
    return NextResponse.json(
      { error: "INTERNAL_PASSWORD is not configured." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  const username = body?.username;
  const password = body?.password;

  if (
    typeof username !== "string" ||
    username.trim().toLowerCase() !== envUsername.trim().toLowerCase() ||
    typeof password !== "string" ||
    password !== envPassword
  ) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  const sessionValue = await createInternalSessionValue(envPassword);
  const response = NextResponse.redirect(
    new URL("/internal/diagnostics", request.url)
  );

  response.cookies.set({
    name: internalSessionCookieOptions.name,
    value: sessionValue,
    httpOnly: internalSessionCookieOptions.httpOnly,
    sameSite: internalSessionCookieOptions.sameSite,
    secure: internalSessionCookieOptions.secure,
    path: internalSessionCookieOptions.path,
    maxAge: internalSessionCookieOptions.maxAge,
  });

  return response;
}
