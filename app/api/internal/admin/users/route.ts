import { NextRequest, NextResponse } from "next/server";
import { ensureInternalApiAccess } from "@/lib/internal/auth";
import { createPrivilegedServerClient } from "@/lib/supabase/server";
import { hashPassword, listAdminUsers } from "@/lib/admin/users";

function normalizeRole(value: unknown): "admin" | "beta" {
  return String(value || "").trim().toLowerCase() === "admin" ? "admin" : "beta";
}

export async function GET(request: NextRequest) {
  const access = await ensureInternalApiAccess(request);
  if (access.ok !== true) return access.response;

  try {
    const users = await listAdminUsers();
    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list users" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const access = await ensureInternalApiAccess(request);
  if (access.ok !== true) return access.response;

  const body = await request.json().catch(() => null);
  const username = String(body?.username ?? "").trim();
  const emailRaw = String(body?.email ?? "").trim();
  const password = String(body?.password ?? "");
  const role = normalizeRole(body?.role);
  const isActive = body?.is_active !== false;

  if (!username || !password) {
    return NextResponse.json({ error: "username and password are required" }, { status: 400 });
  }

  try {
    const supabase = createPrivilegedServerClient();
    const insert = await supabase
      .from("admin_users")
      .insert({
        username,
        email: emailRaw || null,
        password_hash: hashPassword(password),
        role,
        is_active: isActive,
      })
      .select("id,username,email,role,is_active,google_sub,created_at,updated_at,last_login_at")
      .single();
    if (insert.error) throw new Error(insert.error.message);
    return NextResponse.json({ user: insert.data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create user" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const access = await ensureInternalApiAccess(request);
  if (access.ok !== true) return access.response;

  const body = await request.json().catch(() => null);
  const id = String(body?.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.username === "string" && body.username.trim()) update.username = body.username.trim();
  if (typeof body?.email === "string") update.email = body.email.trim() || null;
  if (typeof body?.role !== "undefined") update.role = normalizeRole(body.role);
  if (typeof body?.is_active === "boolean") update.is_active = body.is_active;
  if (typeof body?.password === "string" && body.password.length > 0) update.password_hash = hashPassword(body.password);

  try {
    const supabase = createPrivilegedServerClient();
    const result = await supabase
      .from("admin_users")
      .update(update)
      .eq("id", id)
      .select("id,username,email,role,is_active,google_sub,created_at,updated_at,last_login_at")
      .single();
    if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ user: result.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update user" },
      { status: 500 }
    );
  }
}
