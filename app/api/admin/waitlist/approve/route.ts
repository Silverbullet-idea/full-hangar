import { NextRequest, NextResponse } from "next/server";
import { ensureInternalApiAccess } from "@/lib/internal/auth";
import { createPrivilegedServerClient } from "@/lib/supabase/server";
import { approveWaitlistRequest } from "@/lib/waitlist/approveWaitlistRequest";

export async function POST(request: NextRequest) {
  const access = await ensureInternalApiAccess(request);
  if (access.ok !== true) return access.response;

  let body: { id?: unknown };
  try {
    body = (await request.json()) as { id?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const db = createPrivilegedServerClient();
  const { data: row, error: fetchErr } = await db
    .from("waitlist_requests")
    .select("id,email,status,notes")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    console.error("[admin/waitlist/approve]", fetchErr.message);
    return NextResponse.json({ error: "Unable to approve" }, { status: 500 });
  }

  if (!row || row.status !== "pending") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await approveWaitlistRequest(db, row, "internal");
  } catch (e) {
    console.error("[admin/waitlist/approve]", e);
    return NextResponse.json({ error: "Unable to approve" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
