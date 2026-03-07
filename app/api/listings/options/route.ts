import { NextResponse } from "next/server";
import { getListingFilterOptions } from "../../../../lib/db/listingsRepository";

function normalizeSourceKey(sourceRaw: string): string {
  const value = sourceRaw.trim().toLowerCase();
  if (!value) return "unknown";
  if (value === "tap" || value === "trade-a-plane" || value === "tradaplane") return "trade-a-plane";
  if (value === "controller_cdp") return "controller_cdp";
  if (value === "controller" || value === "ctrl" || value.startsWith("controller_")) return "controller";
  if (value === "aerotrader" || value === "aero_trader") return "aerotrader";
  if (value === "aircraftforsale" || value === "aircraft_for_sale" || value === "afs") return "aircraftforsale";
  if (value === "aso") return "aso";
  if (value === "globalair" || value === "global_air") return "globalair";
  if (value === "barnstormers") return "barnstormers";
  return value;
}

export async function GET() {
  const startedAt = Date.now();
  try {
    const rows = await getListingFilterOptions();
    const makes = new Set<string>();
    const models = new Set<string>();
    const states = new Set<string>();
    const modelPairs = new Set<string>();
    const makeCounts = new Map<string, number>();
    const modelCounts = new Map<string, number>();
    const modelPairCounts = new Map<string, number>();
    const sourceCounts = new Map<string, number>();
    const dealTierCounts = new Map<string, number>();
    let score60Count = 0;
    let score80Count = 0;

    for (const row of rows) {
      const make = String(row.make ?? "").trim();
      const model = String(row.model ?? "").trim();
      const state = String(row.state ?? "").trim().toUpperCase();
      const source = normalizeSourceKey(String(row.source ?? ""));
      const dealTier = String(row.dealTier ?? "").trim().toUpperCase();
      const valueScore = typeof row.valueScore === "number" ? row.valueScore : null;
      const normalizedMake = make.toUpperCase();
      const isValidMake = make.length > 0 && normalizedMake !== "-" && normalizedMake !== "N/A" && normalizedMake !== "UNKNOWN";
      if (isValidMake) makes.add(make);
      if (model) models.add(model);
      if (state) states.add(state);
      if (isValidMake && model) modelPairs.add(`${make}|||${model}`);
      if (isValidMake) makeCounts.set(make, (makeCounts.get(make) ?? 0) + 1);
      if (model) modelCounts.set(model, (modelCounts.get(model) ?? 0) + 1);
      if (isValidMake && model) {
        const pairKey = `${make}|||${model}`;
        modelPairCounts.set(pairKey, (modelPairCounts.get(pairKey) ?? 0) + 1);
      }
      sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
      if (dealTier) dealTierCounts.set(dealTier, (dealTierCounts.get(dealTier) ?? 0) + 1);
      if (typeof valueScore === "number") {
        if (valueScore >= 60) score60Count += 1;
        if (valueScore >= 80) score80Count += 1;
      }
    }

    const exceptionalDeals = dealTierCounts.get("EXCEPTIONAL_DEAL") ?? 0;
    const goodDeals = dealTierCounts.get("GOOD_DEAL") ?? 0;
    const allCount = rows.length;

    const elapsedMs = Date.now() - startedAt;
    return NextResponse.json(
      {
        data: {
          makes: Array.from(makes).sort((a, b) => a.localeCompare(b)),
          models: Array.from(models).sort((a, b) => a.localeCompare(b)),
          states: Array.from(states).sort((a, b) => a.localeCompare(b)),
          modelPairs: Array.from(modelPairs)
            .map((entry) => {
              const [make, model] = entry.split("|||");
              return { make, model };
            })
            .sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model)),
          makeCounts: Object.fromEntries(makeCounts),
          modelCounts: Object.fromEntries(modelCounts),
          modelPairCounts: Object.fromEntries(modelPairCounts),
          sourceCounts: Object.fromEntries(sourceCounts),
          dealTierCounts: {
            all: allCount,
            TOP_DEALS: exceptionalDeals + goodDeals,
            EXCEPTIONAL_DEAL: exceptionalDeals,
            GOOD_DEAL: goodDeals,
            FAIR_MARKET: dealTierCounts.get("FAIR_MARKET") ?? 0,
            ABOVE_MARKET: dealTierCounts.get("ABOVE_MARKET") ?? 0,
            OVERPRICED: dealTierCounts.get("OVERPRICED") ?? 0,
          },
          minimumValueScoreCounts: {
            any: allCount,
            "60": score60Count,
            "80": score80Count,
          },
        },
        error: null,
      },
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
          dealTierCounts: { all: 0, TOP_DEALS: 0, EXCEPTIONAL_DEAL: 0, GOOD_DEAL: 0, FAIR_MARKET: 0, ABOVE_MARKET: 0, OVERPRICED: 0 },
          minimumValueScoreCounts: { any: 0, "60": 0, "80": 0 },
        },
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers: { "X-Response-Time-Ms": String(elapsedMs) } }
    );
  }
}
