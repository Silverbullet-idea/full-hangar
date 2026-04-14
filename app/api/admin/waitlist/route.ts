import { NextRequest, NextResponse } from "next/server";
import { ensureInternalApiAccess } from "@/lib/internal/auth";
import { createPrivilegedServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const access = await ensureInternalApiAccess(request);
  if (access.ok !== true) return access.response;

  const db = createPrivilegedServerClient();

  const statusParam = request.nextUrl.searchParams.get("status");
  const validFilter =
    statusParam === "pending" || statusParam === "approved" || statusParam === "rejected" ? statusParam : null;

  const base = db.from("waitlist_requests").select("*");
  const filtered = validFilter ? base.eq("status", validFilter) : base;

  const [{ data: requests, error: listError }, totalC, pendingC, approvedC] = await Promise.all([
    filtered.order("requested_at", { ascending: false }),
    db.from("waitlist_requests").select("*", { count: "exact", head: true }),
    db.from("waitlist_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
    db.from("waitlist_requests").select("*", { count: "exact", head: true }).eq("status", "approved"),
  ]);

  if (listError) {
    console.error("[admin/waitlist]", listError.message);
    return NextResponse.json({ error: "Unable to load waitlist" }, { status: 500 });
  }

  return NextResponse.json({
    requests: requests ?? [],
    counts: {
      total: totalC.count ?? 0,
      pending: pendingC.count ?? 0,
      approved: approvedC.count ?? 0,
    },
  });
}
