import { NextRequest, NextResponse } from "next/server";
import { createInternalSessionValue, internalSessionCookieOptions } from "@/lib/internal/auth";

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
