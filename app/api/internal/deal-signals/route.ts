import { NextRequest, NextResponse } from "next/server";
import { ensureInternalApiAccess } from "@/lib/internal/auth";
import { getInternalDealSignals } from "@/lib/db/listingsRepository";

export async function GET(request: NextRequest) {
  const access = await ensureInternalApiAccess(request);
  if (access.ok === false) return access.response;

  const idsRaw = request.nextUrl.searchParams.get("ids") ?? "";
  const ids = idsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) {
    return NextResponse.json({ data: [], error: null });
  }

  try {
    const data = await getInternalDealSignals(ids);
    return NextResponse.json({ data, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ data: [], error: message }, { status: 500 });
  }
}
