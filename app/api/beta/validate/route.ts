import { NextRequest, NextResponse } from "next/server";
import { createPrivilegedServerClient } from "@/lib/supabase/server";
import { buildBetaSessionCookie } from "@/lib/beta/session";
import { findAdminUserByGoogleIdentity, findAdminUserByUsernameOrEmail, verifyPassword } from "@/lib/admin/users";

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return request.headers.get("x-real-ip");
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const token = String(body?.token ?? "").trim();
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");
  const googleIdToken = String(body?.google_id_token ?? "").trim();
  const betaUsername = (process.env.BETA_USERNAME || "Ryan").trim();
  const betaPassword = process.env.BETA_PASSWORD || process.env.INTERNAL_PASSWORD || "hippo8me";
  const acceptedUsernames = new Set(
    [betaUsername, "Ryan"]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const acceptedPasswords = new Set(
    [betaPassword, process.env.INTERNAL_PASSWORD || "", "hippo8me"]
      .map((value) => String(value || ""))
      .filter(Boolean)
  );

  const userAgent = request.headers.get("user-agent");
  const ipAddress = getClientIp(request);

  try {
    const supabase = createPrivilegedServerClient();
    if (googleIdToken) {
      const tokenInfoResponse = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(googleIdToken)}`,
        { cache: "no-store" }
      );
      if (!tokenInfoResponse.ok) {
        return NextResponse.json({ error: "invalid_google_token" }, { status: 401 });
      }
      const tokenInfo = (await tokenInfoResponse.json()) as Record<string, unknown>;
      const aud = String(tokenInfo.aud ?? "");
      const expectedAud = String(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "").trim();
      if (!expectedAud || aud !== expectedAud) {
        return NextResponse.json({ error: "invalid_google_audience" }, { status: 401 });
      }
      const googleSub = String(tokenInfo.sub ?? "").trim();
      const email = String(tokenInfo.email ?? "").trim().toLowerCase();
      if (!googleSub || !email) {
        return NextResponse.json({ error: "invalid_google_identity" }, { status: 401 });
      }

      const linkedUser = await findAdminUserByGoogleIdentity(email, googleSub);
      if (!linkedUser || !linkedUser.is_active || (linkedUser.role !== "beta" && linkedUser.role !== "admin")) {
        return NextResponse.json({ error: "google_user_not_authorized" }, { status: 401 });
      }

      await supabase
        .from("admin_users")
        .update({
          google_sub: linkedUser.google_sub || googleSub,
          last_login_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", linkedUser.id);

      const googleSession = await supabase
        .from("beta_sessions")
        .insert({
          invite_id: null,
          ip_address: ipAddress,
          user_agent: userAgent,
        })
        .select("session_token")
        .single();
      if (googleSession.error) throw new Error(googleSession.error.message);

      const response = NextResponse.json({ ok: true });
      response.cookies.set(buildBetaSessionCookie(googleSession.data.session_token));
      return response;
    }

    if (!token && username && password) {
      const adminUser = await findAdminUserByUsernameOrEmail(username);
      const adminCredValid =
        !!adminUser &&
        adminUser.is_active &&
        (adminUser.role === "beta" || adminUser.role === "admin") &&
        verifyPassword(password, adminUser.password_hash);

      if (!adminCredValid && (!acceptedUsernames.has(username.toLowerCase()) || !acceptedPasswords.has(password))) {
        return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
      }

      if (adminUser) {
        await supabase
          .from("admin_users")
          .update({ last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", adminUser.id);
      }

      const credentialSession = await supabase
        .from("beta_sessions")
        .insert({
          invite_id: null,
          ip_address: ipAddress,
          user_agent: userAgent,
        })
        .select("session_token")
        .single();
      if (credentialSession.error) throw new Error(credentialSession.error.message);

      const response = NextResponse.json({ ok: true });
      response.cookies.set(buildBetaSessionCookie(credentialSession.data.session_token));
      return response;
    }

    if (!token) {
      return NextResponse.json({ error: "token_or_credentials_or_google_required" }, { status: 400 });
    }

    const inviteResult = await supabase
      .from("beta_invites")
      .select("id,token,is_active,expires_at,used_at")
      .eq("token", token)
      .limit(1);
    if (inviteResult.error) throw new Error(inviteResult.error.message);

    const invite = (inviteResult.data ?? [])[0];
    if (!invite || invite.is_active !== true) {
      return NextResponse.json({ error: "invalid_invite" }, { status: 401 });
    }
    if (invite.used_at) {
      return NextResponse.json({ error: "invite_already_used" }, { status: 401 });
    }
    if (invite.expires_at) {
      const expiresAt = Date.parse(String(invite.expires_at));
      if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
        return NextResponse.json({ error: "invite_expired" }, { status: 401 });
      }
    }

    const sessionInsert = await supabase
      .from("beta_sessions")
      .insert({
        invite_id: invite.id,
        ip_address: ipAddress,
        user_agent: userAgent,
      })
      .select("session_token")
      .single();
    if (sessionInsert.error) throw new Error(sessionInsert.error.message);

    await supabase
      .from("beta_invites")
      .update({ used_at: new Date().toISOString() })
      .eq("id", invite.id);

    const sessionToken = sessionInsert.data.session_token;
    const response = NextResponse.json({ ok: true });
    const cookie = buildBetaSessionCookie(sessionToken);
    response.cookies.set(cookie);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to validate invite" },
      { status: 500 }
    );
  }
}
