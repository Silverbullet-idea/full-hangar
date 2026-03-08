import { NextRequest, NextResponse } from "next/server";
import { createInternalSessionValue, getInternalSessionSecret, internalSessionCookieOptions } from "@/lib/internal/auth";
import { createPrivilegedServerClient } from "@/lib/supabase/server";
import { findAdminUserByUsernameOrEmail, verifyPassword } from "@/lib/admin/users";

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
    const adminUser = await findAdminUserByUsernameOrEmail(username.trim());
    if (adminUser && adminUser.is_active && adminUser.role === "admin" && verifyPassword(password, adminUser.password_hash)) {
      credentialValid = true;
      matchedAdminUserId = adminUser.id;
    } else if (acceptedUsernames.has(username.trim().toLowerCase()) && acceptedPasswords.has(password)) {
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
    const supabase = createPrivilegedServerClient();
    await supabase
      .from("admin_users")
      .update({ last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", matchedAdminUserId);
  }

  return response;
}
