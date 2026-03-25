import { NextResponse } from "next/server";
import { getListingFilterOptionsClientPayload } from "../../../../lib/db/listingsRepository";

export async function GET() {
  const startedAt = Date.now();
  try {
    const data = await getListingFilterOptionsClientPayload();
    const elapsedMs = Date.now() - startedAt;
    return NextResponse.json(
      { data, error: null },
      {
        headers: {
          "Cache-Control": "s-maxage=300, stale-while-revalidate=900",
          "X-Response-Time-Ms": String(elapsedMs),
        },
      }
    );
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    return NextResponse.json(
      {
        data: {
          makes: [],
          models: [],
          states: [],
          modelPairs: [],
          makeCounts: {},
          modelCounts: {},
          modelPairCounts: {},
          sourceCounts: {},
          dealTierCounts: {
            all: 0,
            TOP_DEALS: 0,
            HOT: 0,
            GOOD: 0,
            FAIR: 0,
            PASS: 0,
          },
          minimumValueScoreCounts: { any: 0, "60": 0, "80": 0 },
        },
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers: { "X-Response-Time-Ms": String(elapsedMs) } }
    );
  }
}
