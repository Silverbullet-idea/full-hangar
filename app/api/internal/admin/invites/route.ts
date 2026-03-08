import { NextRequest, NextResponse } from "next/server";
import { ensureInternalApiAccess } from "@/lib/internal/auth";
import { createPrivilegedServerClient } from "@/lib/supabase/server";
import { listInvitesWithSessions } from "@/lib/admin/analytics";

function buildSiteUrl(request: NextRequest): string {
  const envUrl = String(process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");
  return request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const access = await ensureInternalApiAccess(request);
  if (access.ok !== true) return access.response;

  try {
    const payload = await listInvitesWithSessions();
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list invites" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const access = await ensureInternalApiAccess(request);
  if (access.ok !== true) return access.response;

  const body = await request.json().catch(() => null);
  const label = String(body?.label ?? "").trim();
  const email = String(body?.email ?? "").trim();
  const expiresDaysRaw = Number(body?.expires_days ?? 0);

  if (!label) {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }

  let expiresAt: string | null = null;
  if (Number.isFinite(expiresDaysRaw) && expiresDaysRaw > 0) {
    const timestamp = Date.now() + expiresDaysRaw * 24 * 60 * 60 * 1000;
    expiresAt = new Date(timestamp).toISOString();
  }

  try {
    const supabase = createPrivilegedServerClient();
    const insert = await supabase
      .from("beta_invites")
      .insert({
        label,
        email: email || null,
        expires_at: expiresAt,
      })
      .select("id,token,label,email,created_by,created_at,expires_at,used_at,used_by_email,is_active,access_tier")
      .single();

    if (insert.error) throw new Error(insert.error.message);

    const invite = insert.data;
    const siteUrl = buildSiteUrl(request);
    const inviteUrl = `${siteUrl}/beta/join?token=${invite.token}`;
    return NextResponse.json({
      invite_url: inviteUrl,
      token: invite.token,
      invite,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create invite" },
      { status: 500 }
    );
  }
}
