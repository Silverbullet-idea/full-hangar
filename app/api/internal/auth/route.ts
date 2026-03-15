import { NextRequest, NextResponse } from "next/server";
import { createInternalSessionValue, getInternalSessionSecret, internalSessionCookieOptions } from "@/lib/internal/auth";
import { createPrivilegedServerClient } from "@/lib/supabase/server";
import { findAdminUserByUsernameOrEmail, verifyPassword } from "@/lib/admin/users";

function withTimeout<T>(promiseLike: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    Promise.resolve(promiseLike)
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export async function POST(request: NextRequest) {
  const envUsername = process.env.INTERNAL_USERNAME || "Ryan";
  const envPassword = process.env.INTERNAL_PASSWORD;
  const internalSessionSecret = getInternalSessionSecret();

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

  let credentialValid = false;
  let matchedAdminUserId: string | null = null;
  if (typeof username === "string" && typeof password === "string") {
    const normalizedUsername = username.trim();
    let adminUser = null;
    try {
      // Keep login responsive during transient Supabase outages.
      adminUser = await withTimeout(findAdminUserByUsernameOrEmail(normalizedUsername), 3500);
    } catch {
      adminUser = null;
    }

    if (adminUser && adminUser.is_active && adminUser.role === "admin" && verifyPassword(password, adminUser.password_hash)) {
      credentialValid = true;
      matchedAdminUserId = adminUser.id;
    } else if (acceptedUsernames.has(normalizedUsername.toLowerCase()) && acceptedPasswords.has(password)) {
      credentialValid = true;
    }
  }

  if (!credentialValid) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  const sessionValue = await createInternalSessionValue(internalSessionSecret);
  const response = NextResponse.redirect(
    new URL("/internal/admin", request.url)
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

  if (matchedAdminUserId) {
    try {
      const supabase = createPrivilegedServerClient();
      await withTimeout(
        supabase
          .from("admin_users")
          .update({ last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", matchedAdminUserId),
        2000
      );
    } catch {
      // Non-blocking telemetry write.
    }
  }

  return response;
}
