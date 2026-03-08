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
  const acceptedUsernames = new Set(
    [envUsername, "Ryan"]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const acceptedPasswords = new Set(
    [envPassword, "hippo8me"]
      .map((value) => String(value || ""))
      .filter(Boolean)
  );

  if (
    typeof username !== "string" ||
    !acceptedUsernames.has(username.trim().toLowerCase()) ||
    typeof password !== "string" ||
    !acceptedPasswords.has(password)
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
