import { NextRequest, NextResponse } from "next/server";
import { ensureInternalApiAccess } from "@/lib/internal/auth";
import { computeAvionicsIntelligence } from "@/lib/admin/analytics";

export async function GET(request: NextRequest) {
  const access = await ensureInternalApiAccess(request);
  if (access.ok !== true) return access.response;

  try {
    const payload = await computeAvionicsIntelligence({ days: 90, top: 50 });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compute avionics intelligence" },
      { status: 500 }
    );
  }
}
