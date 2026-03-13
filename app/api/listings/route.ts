import { NextRequest, NextResponse } from "next/server";
import { getListingsPage } from "../../../lib/db/listingsRepository";

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const search = request.nextUrl.searchParams;
  const ownershipTypeRaw = (search.get("ownershipType") ?? "all").toLowerCase();
  const ownershipType =
    ownershipTypeRaw === "fractional" || ownershipTypeRaw === "full" || ownershipTypeRaw === "all"
      ? ownershipTypeRaw
      : "all";

  try {
    const result = await getListingsPage({
      page: Number(search.get("page") ?? 1),
      pageSize: Number(search.get("pageSize") ?? 24),
      q: search.get("q") ?? "",
      make: search.get("make") ?? "",
      model: search.get("model") ?? "",
      modelFamily: search.get("modelFamily") ?? "",
      subModel: search.get("subModel") ?? "",
      source: search.get("source") ?? "",
      state: search.get("state") ?? "",
      risk: search.get("risk") ?? "",
      dealTier: search.get("dealTier") ?? "",
      minValueScore: Number(search.get("minValueScore") ?? 0),
      minPrice: Number(search.get("minPrice") ?? 0),
      maxPrice: Number(search.get("maxPrice") ?? 0),
      priceStatus: (search.get("priceStatus") ?? "all") as "all" | "priced",
      yearMin: Number(search.get("yearMin") ?? 0),
      yearMax: Number(search.get("yearMax") ?? 0),
      totalTimeMin: Number(search.get("totalTimeMin") ?? 0),
      totalTimeMax: Number(search.get("totalTimeMax") ?? 0),
      maintenanceBand: (search.get("maintenanceBand") ?? "any") as "any" | "light" | "moderate" | "heavy" | "severe",
      trueCostMin: Number(search.get("trueCostMin") ?? 0),
      trueCostMax: Number(search.get("trueCostMax") ?? 0),
      sortBy: search.get("sortBy") ?? "value_desc",
      category: search.get("category") ?? "",
      ownershipType,
    });

    const elapsedMs = Date.now() - startedAt;
    return NextResponse.json(
      {
        data: result.rows,
        meta: {
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
        },
        error: null,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
          "X-Response-Time-Ms": String(elapsedMs),
        },
      }
    );
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    return NextResponse.json(
      { data: [], meta: null, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500, headers: { "X-Response-Time-Ms": String(elapsedMs) } }
    );
  }
}
