import { NextRequest, NextResponse } from "next/server";
import { ensureInternalApiAccess } from "@/lib/internal/auth";
import { createPrivilegedServerClient } from "@/lib/supabase/server";
import { approveWaitlistRequest } from "@/lib/waitlist/approveWaitlistRequest";

export async function POST(request: NextRequest) {
  const access = await ensureInternalApiAccess(request);
  if (access.ok !== true) return access.response;

  const db = createPrivilegedServerClient();
  const { data: rows, error } = await db
    .from("waitlist_requests")
    .select("id,email,status,notes")
    .eq("status", "pending");

  if (error) {
    console.error("[admin/waitlist/approve-all]", error.message);
    return NextResponse.json({ error: "Unable to load pending requests" }, { status: 500 });
  }

  const list = rows ?? [];
  for (const row of list) {
    try {
      await approveWaitlistRequest(db, row, "internal");
    } catch (e) {
      console.error("[admin/waitlist/approve-all] row failed", row.id, e);
    }
  }

  return NextResponse.json({ success: true, count: list.length });
}
