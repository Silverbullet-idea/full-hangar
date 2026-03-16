import { NextRequest, NextResponse } from "next/server";
import { ensureInternalApiAccess } from "@/lib/internal/auth";
import { createPrivilegedServerClient, createServerClient } from "@/lib/supabase/server";

type ListingsTable = "aircraft_listings" | "public_listings";
type GenericRow = Record<string, unknown>;

type QueryResult = {
  data: GenericRow[] | null;
  error: { message: string } | null;
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replaceAll(",", "").trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[middle - 1] + sorted[middle]) / 2;
  return sorted[middle];
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function deriveModelFamily(model: string): string {
  const cleaned = model.trim().toUpperCase();
  if (!cleaned) return "";
  const noSpace = cleaned.replace(/\s+/g, " ");
  const firstToken = noSpace.split(" ")[0] ?? "";
  return firstToken.replace(/[A-Z]+$/g, "");
}

async function runWithFallback(
  run: (client: ReturnType<typeof createServerClient>, table: ListingsTable) => Promise<QueryResult>
): Promise<GenericRow[]> {
  try {
    const privilegedClient = createPrivilegedServerClient();
    const privilegedResult = await run(privilegedClient, "aircraft_listings");
    if (privilegedResult.error) throw new Error(privilegedResult.error.message);
    return privilegedResult.data ?? [];
  } catch {
    const publicClient = createServerClient();
    const publicResult = await run(publicClient, "public_listings");
    if (publicResult.error) throw new Error(publicResult.error.message);
    return publicResult.data ?? [];
  }
}

function mapEngineBand(smoh: number | null): string {
  if (smoh == null) return "Unknown";
  if (smoh < 500) return "0-500 SMOH";
  if (smoh < 1000) return "500-1000 SMOH";
  if (smoh < 1500) return "1000-1500 SMOH";
  return "1500+ SMOH";
}

function avionicsTier(avionicsValue: number | null): string {
  if (avionicsValue == null) return "Unknown";
  if (avionicsValue < 2000) return "Steam Gauge";
  if (avionicsValue < 5000) return "Basic ADS-B";
  if (avionicsValue < 12000) return "Garmin VFR";
  if (avionicsValue < 25000) return "Garmin IFR";
  return "Full Glass";
}

function getAvionicsValueFromScoreData(row: GenericRow): number | null {
  const scoreData = row.score_data;
  if (!scoreData || typeof scoreData !== "object" || Array.isArray(scoreData)) return null;
  return toNumber((scoreData as Record<string, unknown>).avionics_value);
}

function modelMatches(value: string | null, mode: { model: string; family: string | null }): boolean {
  if (!value) return false;
  const rowModel = value.toLowerCase();
  if (mode.family) return rowModel.startsWith(mode.family.toLowerCase());
  return rowModel === mode.model.toLowerCase();
}

export async function GET(request: NextRequest) {
  const access = await ensureInternalApiAccess(request);
  if (access.ok !== true) return access.response;

  try {
    const make = (request.nextUrl.searchParams.get("make") ?? "").trim();
    const model = (request.nextUrl.searchParams.get("model") ?? "").trim();
    const requestedFamily = (request.nextUrl.searchParams.get("model_family") ?? "").trim();

    if (!make || !model) {
      return NextResponse.json({ error: "make and model are required" }, { status: 400 });
    }

    const modelFamily = requestedFamily || deriveModelFamily(model) || null;
    const matchingMode = { model, family: requestedFamily ? modelFamily : null };

    const rows = await runWithFallback(async (client, table) => {
      let query = client
        .from(table)
        .select("*")
        .eq("is_active", true)
        .ilike("make", make)
        .gt("asking_price", 0)
        .limit(5000);
      query = matchingMode.family
        ? query.ilike("model", `${matchingMode.family}%`)
        : query.ilike("model", model);
      return (await query) as unknown as QueryResult;
    });

    const activeRows = rows;
    const allPrices = activeRows.map((row) => toNumber(row.asking_price)).filter((v): v is number => v != null && v > 0);
    const allDom = activeRows.map((row) => toNumber(row.days_on_market)).filter((v): v is number => v != null && v >= 0);
    const medianPrice = median(allPrices);
    const sourceCount = new Set(
      activeRows
        .map((row) => toString(row.source_site ?? row.source))
        .filter((v): v is string => Boolean(v))
    ).size;
    const dealsBelowMedian =
      medianPrice == null ? 0 : allPrices.filter((price) => price < medianPrice * 0.9).length;

    const marketPulse = {
      active_listings: activeRows.length,
      avg_price: average(allPrices),
      median_price: medianPrice,
      min_price: allPrices.length ? Math.min(...allPrices) : null,
      max_price: allPrices.length ? Math.max(...allPrices) : null,
      avg_days_on_market: average(allDom),
      deals_below_median: dealsBelowMedian,
      source_count: sourceCount,
      price_distribution: buildHistogram(allPrices, 10),
      sample_size: activeRows.length,
    };

    const submodelBuckets = new Map<
      string,
      {
        prices: number[];
        dom: number[];
        scores: number[];
        years: number[];
      }
    >();
    for (const row of activeRows) {
      const submodel = toString(row.model);
      if (!submodel) continue;
      const existing = submodelBuckets.get(submodel) ?? { prices: [], dom: [], scores: [], years: [] };
      const price = toNumber(row.asking_price);
      const dom = toNumber(row.days_on_market);
      const score = toNumber(row.value_score);
      const year = toNumber(row.year);
      if (price != null && price > 0) existing.prices.push(price);
      if (dom != null && dom >= 0) existing.dom.push(dom);
      if (score != null) existing.scores.push(score);
      if (year != null) existing.years.push(year);
      submodelBuckets.set(submodel, existing);
    }

    const searchedModelMedian =
      median(
        activeRows
          .filter((row) => (toString(row.model) ?? "").toLowerCase() === model.toLowerCase())
          .map((row) => toNumber(row.asking_price))
          .filter((v): v is number => v != null && v > 0)
      ) ?? medianPrice;

    const submodelComparison = Array.from(submodelBuckets.entries())
      .map(([submodel, bucket]) => {
        const modelMedian = median(bucket.prices);
        return {
          model: submodel,
          listing_count: bucket.prices.length,
          median_price: modelMedian,
          avg_price: average(bucket.prices),
          avg_dom: average(bucket.dom),
          avg_score: average(bucket.scores),
          year_min: bucket.years.length ? Math.min(...bucket.years) : null,
          year_max: bucket.years.length ? Math.max(...bucket.years) : null,
          delta_vs_searched: modelMedian != null && searchedModelMedian != null ? modelMedian - searchedModelMedian : null,
          is_searched_model: submodel.toLowerCase() === model.toLowerCase(),
        };
      })
      .sort((a, b) => (a.median_price ?? Number.POSITIVE_INFINITY) - (b.median_price ?? Number.POSITIVE_INFINITY));

    const submodelNarrative = buildSubmodelNarrative(submodelComparison, model);

    const engineBands = new Map<string, number[]>();
    for (const row of activeRows) {
      const band = mapEngineBand(toNumber(row.smoh ?? row.time_since_overhaul));
      const price = toNumber(row.asking_price);
      if (price == null || price <= 0) continue;
      const existing = engineBands.get(band) ?? [];
      existing.push(price);
      engineBands.set(band, existing);
    }
    const engineOrder = ["0-500 SMOH", "500-1000 SMOH", "1000-1500 SMOH", "1500+ SMOH", "Unknown"];
    const engineTimeBands = engineOrder
      .filter((band) => engineBands.has(band))
      .map((band) => {
        const prices = engineBands.get(band) ?? [];
        return {
          engine_band: band,
          count: prices.length,
          median_price: median(prices),
          avg_price: average(prices),
        };
      });

    const avionicsBuckets = new Map<string, { listingPrices: number[]; avionicsValues: number[] }>();
    for (const row of activeRows) {
      const price = toNumber(row.asking_price);
      if (price == null || price <= 0) continue;
      const avValue = getAvionicsValueFromScoreData(row);
      const tier = avionicsTier(avValue);
      const existing = avionicsBuckets.get(tier) ?? { listingPrices: [], avionicsValues: [] };
      existing.listingPrices.push(price);
      if (avValue != null) existing.avionicsValues.push(avValue);
      avionicsBuckets.set(tier, existing);
    }
    const avionicsOrder = ["Steam Gauge", "Basic ADS-B", "Garmin VFR", "Garmin IFR", "Full Glass", "Unknown"];
    const avionicsTierPricing = avionicsOrder
      .filter((tier) => avionicsBuckets.has(tier))
      .map((tier) => {
        const bucket = avionicsBuckets.get(tier)!;
        return {
          avionics_tier: tier,
          count: bucket.listingPrices.length,
          median_price: median(bucket.listingPrices),
          avg_avionics_value: average(bucket.avionicsValues),
        };
      });

    const baselineTier = avionicsTierPricing.find((row) => row.avionics_tier === "Steam Gauge");
    const avionicsPremiumMap = avionicsTierPricing.map((row) => {
      const baselineMedian = baselineTier?.median_price ?? null;
      const premium =
        row.median_price != null && baselineMedian != null ? row.median_price - baselineMedian : null;
      const impliedReturn =
        premium != null && row.avg_avionics_value != null && row.avg_avionics_value > 0
          ? premium / row.avg_avionics_value
          : null;
      return {
        ...row,
        premium_over_baseline: premium,
        implied_return_per_dollar: impliedReturn,
      };
    });

    const geoBuckets = new Map<string, number[]>();
    for (const row of activeRows) {
      const state = toString(row.state ?? row.location_state);
      const price = toNumber(row.asking_price);
      if (!state || price == null || price <= 0) continue;
      const existing = geoBuckets.get(state) ?? [];
      existing.push(price);
      geoBuckets.set(state, existing);
    }
    const geoHeatmapData = Array.from(geoBuckets.entries())
      .map(([state, prices]) => ({
        state,
        listing_count: prices.length,
        avg_price: average(prices),
        median_price: median(prices),
        cheapest_listed: prices.length ? Math.min(...prices) : null,
      }))
      .sort((a, b) => b.listing_count - a.listing_count);

    const soldSignals = await loadSoldSignals(make, matchingMode);
    const transactionVelocity = (soldSignals.ownership_transfers?.length ?? 0) + (soldSignals.ebay_sales?.length ?? 0);

    const payload = {
      market_pulse: marketPulse,
      submodel_comparison: {
        rows: submodelComparison,
        searched_model: model,
        searched_median_price: searchedModelMedian,
        narrative: submodelNarrative,
      },
      price_drivers: {
        engine_time_bands: engineTimeBands,
        avionics_tier_pricing: avionicsTierPricing,
        avionics_premium_map: avionicsPremiumMap,
      },
      geo_heatmap_data: geoHeatmapData,
      sold_signals: {
        ...soldSignals,
        transaction_velocity: transactionVelocity,
      },
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "s-maxage=900",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load market intel summary" },
      { status: 500 }
    );
  }
}

function buildHistogram(values: number[], buckets: number) {
  if (values.length === 0 || buckets <= 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return [{ min, max, count: values.length }];
  }
  const step = (max - min) / buckets;
  const ranges = Array.from({ length: buckets }, (_, index) => ({
    min: min + step * index,
    max: min + step * (index + 1),
    count: 0,
  }));
  for (const value of values) {
    const normalizedIndex = Math.min(
      buckets - 1,
      Math.max(0, Math.floor(((value - min) / (max - min)) * buckets))
    );
    ranges[normalizedIndex].count += 1;
  }
  return ranges;
}

function buildSubmodelNarrative(
  rows: Array<{ model: string; median_price: number | null; delta_vs_searched: number | null }>,
  searchedModel: string
) {
  const comparableRows = rows.filter(
    (row) => row.model.toLowerCase() !== searchedModel.toLowerCase() && row.delta_vs_searched != null
  );
  if (comparableRows.length < 2) {
    return "Limited data: not enough submodel variation yet to explain pricing differences.";
  }
  const highest = [...comparableRows].sort(
    (a, b) => (b.delta_vs_searched ?? Number.NEGATIVE_INFINITY) - (a.delta_vs_searched ?? Number.NEGATIVE_INFINITY)
  )[0];
  const lowest = [...comparableRows].sort(
    (a, b) => (a.delta_vs_searched ?? Number.POSITIVE_INFINITY) - (b.delta_vs_searched ?? Number.POSITIVE_INFINITY)
  )[0];
  if (!highest || !lowest || highest.delta_vs_searched == null || lowest.delta_vs_searched == null) {
    return "Limited data: not enough submodel variation yet to explain pricing differences.";
  }
  return `The ${highest.model} shows the strongest premium at +$${Math.round(
    highest.delta_vs_searched
  ).toLocaleString()} vs ${searchedModel}, while ${lowest.model} is the value floor at $${Math.round(
    Math.abs(lowest.delta_vs_searched)
  ).toLocaleString()} ${lowest.delta_vs_searched < 0 ? "below" : "above"} ${searchedModel}.`;
}

async function loadSoldSignals(
  make: string,
  matchingMode: { model: string; family: string | null }
): Promise<{
  ownership_transfers: Array<Record<string, unknown>>;
  ebay_sales: Array<Record<string, unknown>>;
}> {
  const supabase = createPrivilegedServerClient();
  const cutoffIso = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30 * 18).toISOString();
  const listingQuery = supabase
    .from("aircraft_listings")
    .select("id, n_number, make, model, year, ttaf, smoh, total_time_airframe, time_since_overhaul, state, first_seen_at")
    .ilike("make", make)
    .limit(5000);
  const listingModelQuery = matchingMode.family
    ? listingQuery.ilike("model", `${matchingMode.family}%`)
    : listingQuery.ilike("model", matchingMode.model);
  const listingResult = (await listingModelQuery) as unknown as QueryResult;
  const listingRows = listingResult.error ? [] : listingResult.data ?? [];
  const listingIds = listingRows.map((row) => toString(row.id)).filter((id): id is string => Boolean(id));

  const listingById = new Map<string, GenericRow>();
  for (const row of listingRows) {
    const id = toString(row.id);
    if (id) listingById.set(id, row);
  }

  let ownershipTransfers: Array<Record<string, unknown>> = [];
  if (listingIds.length > 0) {
    const transferResult = (await supabase
      .from("detected_ownership_changes")
      .select("listing_id, detected_at, asking_price_at_detection, new_cert_date")
      .in("listing_id", listingIds)
      .gte("detected_at", cutoffIso)
      .order("detected_at", { ascending: false })
      .limit(20)) as unknown as QueryResult;
    if (!transferResult.error) {
      ownershipTransfers = (transferResult.data ?? []).map((transfer) => {
        const listing = listingById.get(String(transfer.listing_id ?? ""));
        const detectedAt = toString(transfer.detected_at);
        const firstSeen = toString(listing?.first_seen_at);
        let domAtSale: number | null = null;
        if (detectedAt && firstSeen) {
          const diff = Date.parse(detectedAt) - Date.parse(firstSeen);
          if (Number.isFinite(diff)) domAtSale = Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
        }
        return {
          detected_at: detectedAt,
          asking_price_at_detection: toNumber(transfer.asking_price_at_detection),
          approx_sale_date: toString(transfer.new_cert_date) ?? detectedAt,
          n_number: toString(listing?.n_number),
          year: toNumber(listing?.year),
          model: toString(listing?.model),
          ttaf: toNumber(listing?.ttaf ?? listing?.total_time_airframe),
          smoh: toNumber(listing?.smoh ?? listing?.time_since_overhaul),
          state: toString(listing?.state),
          days_on_market: domAtSale,
        };
      });
    }
  }

  const ebayResult = (await supabase
    .from("aircraft_sold_transactions")
    .select("sold_price, sold_date, year, model, raw_title")
    .ilike("make", make)
    .ilike("model", matchingMode.family ? `${matchingMode.family}%` : matchingMode.model)
    .gte("sold_date", cutoffIso)
    .order("sold_date", { ascending: false })
    .limit(20)) as unknown as QueryResult;

  const ebaySales = ebayResult.error
    ? []
    : (ebayResult.data ?? []).map((row) => ({
        sold_price: toNumber(row.sold_price),
        sold_date: toString(row.sold_date),
        year: toNumber(row.year),
        model: toString(row.model),
        raw_title: toString(row.raw_title),
      }));

  return {
    ownership_transfers: ownershipTransfers,
    ebay_sales: ebaySales,
  };
}
