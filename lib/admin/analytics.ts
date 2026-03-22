import { createPrivilegedServerClient } from "@/lib/supabase/server";
import { COMPLETENESS_FIELDS, getRecommendationLevel, type CompletenessField } from "@/lib/admin/completeness";
import { cache } from "react";

type ListingRow = Record<string, unknown>;
const AVIONICS_HINT_RE =
  /\b(avionics|panel|autopilot|transponder|waas|ads[\s-]?b|gtn[\s-]?\d{3}|gns[\s-]?\d{3}|gfc[\s-]?\d{3}|gtx[\s-]?\d{2,4}|ifd[\s-]?\d{3}|g1000|g500|g600|aspen|stormscope|taws|svt|esp|engine\s*monitor|jpi|pma[\s-]?\d{2,4}|kx[\s-]?\d{2,4}|kap[\s-]?\d{2,4}|kfc[\s-]?\d{2,4})\b/i;

const SOURCE_ORDER = [
  "tradaplane",
  "controller",
  "barnstormers",
  "aso",
  "aerotrader",
  "afs",
  "globalair",
  "avbuyer",
];

const DOMAIN_SOURCE_HINTS: Array<[string, string]> = [
  ["aerotrader", "aerotrader"],
  ["controller", "controller"],
  ["trade-a-plane", "tradaplane"],
  ["tradeaplane", "tradaplane"],
  ["barnstormers", "barnstormers"],
  ["globalair", "globalair"],
  ["aircraftforsale", "afs"],
  ["aso", "aso"],
  ["avbuyer", "avbuyer"],
];

function normalizeSource(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "unknown";
  if (raw === "tap" || raw === "trade-a-plane" || raw === "tradeaplane" || raw === "trade_a_plane") return "tradaplane";
  if (raw.startsWith("controller")) return "controller";
  if (raw === "aircraftforsale") return "afs";
  if (raw === "aero_trader") return "aerotrader";
  if (raw === "global_air") return "globalair";
  return raw;
}

function parseDomain(urlValue: unknown): string | null {
  const raw = String(urlValue ?? "").trim();
  if (!raw) return null;
  try {
    const withProtocol = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
    return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function inferSource(row: ListingRow): string {
  const candidates = [row.source_site, row.listing_source, row.source];
  for (const candidate of candidates) {
    const normalized = normalizeSource(candidate);
    if (normalized !== "unknown") return normalized;
  }

  const domain = parseDomain(row.source_url ?? row.url ?? row.listing_url ?? null);
  if (domain) {
    for (const [needle, source] of DOMAIN_SOURCE_HINTS) {
      if (domain.includes(needle)) return source;
    }
  }
  return "unknown";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replaceAll(",", "").trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return trimmed.includes(",") ? trimmed.split(",").map((part) => part.trim()).filter(Boolean) : [trimmed];
  }
  return [];
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeToken(value: unknown): string {
  const raw = String(value ?? "").toLowerCase();
  const alnumSpaces = raw.replace(/[^a-z0-9]+/g, " ");
  return alnumSpaces.replace(/\s+/g, " ").trim();
}

function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .split(".")
      .map((part) => Number.parseInt(part, 10))
      .map((n) => (Number.isFinite(n) ? n : 0));
  const av = parse(a);
  const bv = parse(b);
  const maxLen = Math.max(av.length, bv.length);
  for (let i = 0; i < maxLen; i += 1) {
    const ai = av[i] ?? 0;
    const bi = bv[i] ?? 0;
    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }
  return 0;
}

function hasFilledValue(value: unknown, field: string): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  if (typeof value === "string") return value.trim().length > 0 && value.trim() !== "0";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return false;
}

function getFieldValue(row: ListingRow, field: string): unknown {
  if (field === "price") return row.asking_price ?? row.price_asking ?? row.price ?? null;
  if (field === "total_time") return row.total_time_airframe ?? row.total_time ?? null;
  if (field === "smoh") return row.engine_time_since_overhaul ?? row.time_since_overhaul ?? row.smoh ?? null;
  if (field === "snew") return row.time_since_new_engine ?? row.snew ?? null;
  if (field === "stoh") return row.time_since_overhaul ?? row.stoh ?? null;
  if (field === "spoh") return row.time_since_prop_overhaul ?? row.spoh ?? null;
  if (field === "city") return row.location_city ?? row.city ?? null;
  if (field === "state") return row.location_state ?? row.state ?? null;
  if (field === "registered_owner") return row.faa_owner ?? row.registered_owner ?? null;
  if (field === "cert_issue_date") return row.faa_cert_date ?? row.cert_issue_date ?? null;
  if (field === "engine_count") return row.engine_count ?? row.faa_num_engines ?? null;
  if (field === "has_glass_panel") return row.has_glass_panel ?? row.has_glass_cockpit ?? null;
  if (field === "image_urls") return asArray(row.image_urls);
  return row[field];
}

function isFieldFilled(row: ListingRow, fieldDef: CompletenessField): boolean {
  const value = getFieldValue(row, fieldDef.field);
  if (fieldDef.field === "image_urls") return asArray(value).length > 0;
  return hasFilledValue(value, fieldDef.field);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * p)));
  return sorted[index];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  return percentile(values, 0.5);
}

function rowTimestamp(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? ts : null;
}

function withTimeout<T>(promiseLike: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    Promise.resolve(promiseLike)
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/** Cached full active listing rows for admin analytics (platform, data quality, buyer intel). */
export const getActiveListings = cache(async (): Promise<ListingRow[]> => {
  const supabase = createPrivilegedServerClient();
  const pageSize = 1000;
  const rows: ListingRow[] = [];
  let from = 0;
  while (true) {
    const to = from + pageSize - 1;
    const result = await withTimeout(
      supabase.from("aircraft_listings").select("*").eq("is_active", true).range(from, to),
      12000,
      "active listings query"
    );
    if (result.error) throw new Error(result.error.message);
    const pageRows = (result.data ?? []) as ListingRow[];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) break;
    from += pageSize;
  }
  return rows;
});

export async function computeDataQuality() {
  const rows = await getActiveListings();
  const total = rows.length;

  const fieldStats = COMPLETENESS_FIELDS.map((fieldDef) => {
    const filled = rows.reduce((sum, row) => sum + (isFieldFilled(row, fieldDef) ? 1 : 0), 0);
    const fillPct = total > 0 ? Number(((filled / total) * 100).toFixed(1)) : 0;
    return {
      field: fieldDef.field,
      category: fieldDef.category,
      weight: fieldDef.weight,
      parser_hint: fieldDef.parser_hint,
      filled,
      total,
      fill_pct: fillPct,
    };
  });

  const bySource = new Map<string, ListingRow[]>();
  for (const row of rows) {
    const source = inferSource(row);
    if (!bySource.has(source)) bySource.set(source, []);
    bySource.get(source)!.push(row);
  }

  const sourceStats = Array.from(bySource.entries())
    .map(([source, sourceRows]) => {
      const listingCount = sourceRows.length;
      const fieldBreakdown: Record<string, number> = {};
      let totalPct = 0;
      for (const field of COMPLETENESS_FIELDS) {
        const filled = sourceRows.reduce((sum, row) => sum + (isFieldFilled(row, field) ? 1 : 0), 0);
        const fillPct = listingCount > 0 ? Number(((filled / listingCount) * 100).toFixed(1)) : 0;
        fieldBreakdown[field.field] = fillPct;
        totalPct += fillPct;
      }
      const overallFillPct = COMPLETENESS_FIELDS.length > 0 ? Number((totalPct / COMPLETENESS_FIELDS.length).toFixed(1)) : 0;
      return {
        source,
        listing_count: listingCount,
        overall_fill_pct: overallFillPct,
        field_breakdown: fieldBreakdown,
      };
    })
    .sort((a, b) => {
      const ai = SOURCE_ORDER.indexOf(a.source);
      const bi = SOURCE_ORDER.indexOf(b.source);
      if (ai === -1 && bi === -1) return a.source.localeCompare(b.source);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

  let excellent = 0;
  let good = 0;
  let fair = 0;
  let sparse = 0;
  for (const row of rows) {
    const filledCount = COMPLETENESS_FIELDS.reduce((sum, field) => sum + (isFieldFilled(row, field) ? 1 : 0), 0);
    const score = COMPLETENESS_FIELDS.length > 0 ? (filledCount / COMPLETENESS_FIELDS.length) * 100 : 0;
    if (score > 85) excellent += 1;
    else if (score >= 70) good += 1;
    else if (score >= 50) fair += 1;
    else sparse += 1;
  }

  const overallCompletenessPct =
    fieldStats.length > 0
      ? Number((fieldStats.reduce((sum, field) => sum + field.fill_pct, 0) / fieldStats.length).toFixed(1))
      : 0;

  const recommendations = fieldStats
    .map((field) => ({
      field: field.field,
      category: field.category,
      fill_pct: field.fill_pct,
      weight: field.weight,
      parser_hint: field.parser_hint,
      level: getRecommendationLevel(field.weight, field.fill_pct),
    }))
    .filter((entry) => entry.level !== null)
    .sort((a, b) => a.fill_pct - b.fill_pct);

  return {
    computed_at: new Date().toISOString(),
    total_active_listings: total,
    overall_completeness_pct: overallCompletenessPct,
    field_stats: fieldStats,
    source_stats: sourceStats,
    completeness_distribution: { excellent, good, fair, sparse },
    recommendations,
  };
}

async function safeCount(table: string): Promise<number> {
  const supabase = createPrivilegedServerClient();
  const result = await withTimeout(
    supabase.from(table).select("id", { count: "exact", head: true }),
    8000,
    `${table} count query`
  );
  if (result.error || typeof result.count !== "number") return 0;
  return result.count;
}

async function safeCountByColumn(table: string, column: string): Promise<number> {
  const supabase = createPrivilegedServerClient();
  const result = await withTimeout(
    supabase.from(table).select(column, { count: "exact", head: true }),
    8000,
    `${table}.${column} count query`
  );
  if (result.error || typeof result.count !== "number") return 0;
  return result.count;
}

export async function computePlatformStats() {
  const rows = await getActiveListings();
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const createdAt = (row: ListingRow) => {
    const candidate =
      String(row.created_at ?? row.first_seen_date ?? row.scraped_at ?? row.updated_at ?? row.last_seen_date ?? "").trim();
    const ts = Date.parse(candidate);
    return Number.isFinite(ts) ? ts : null;
  };

  const listingBySource: Record<string, number> = {};
  const freshnessBySource = new Map<
    string,
    { active: number; seen24h: number; seen72h: number; new24h: number; new7d: number; latestSeenTs: number | null }
  >();
  const makeCounts = new Map<string, number>();
  let withScore = 0;
  let withoutScore = 0;
  let added7 = 0;
  let added30 = 0;
  let under50k = 0;
  let under100k = 0;
  let under200k = 0;
  let over200k = 0;
  let highScoreListings = 0;
  let priceReductions7d = 0;
  let avgDomNumerator = 0;
  let avgDomCount = 0;

  for (const row of rows) {
    const source = inferSource(row);
    listingBySource[source] = (listingBySource[source] ?? 0) + 1;
    if (!freshnessBySource.has(source)) {
      freshnessBySource.set(source, { active: 0, seen24h: 0, seen72h: 0, new24h: 0, new7d: 0, latestSeenTs: null });
    }
    const freshness = freshnessBySource.get(source)!;
    freshness.active += 1;

    const make = String(row.make ?? "").trim();
    if (make) makeCounts.set(make, (makeCounts.get(make) ?? 0) + 1);

    const score = asNumber(row.value_score);
    if (score !== null) withScore += 1;
    else withoutScore += 1;
    if (score !== null && score >= 75) highScoreListings += 1;

    const price = asNumber(row.asking_price ?? row.price_asking);
    if (price !== null) {
      if (price < 50000) under50k += 1;
      else if (price < 100000) under100k += 1;
      else if (price < 200000) under200k += 1;
      else over200k += 1;
    }

    const dom = asNumber(row.days_on_market);
    if (dom !== null) {
      avgDomNumerator += dom;
      avgDomCount += 1;
    }

    const created = createdAt(row);
    if (created !== null) {
      if (now - created <= 7 * dayMs) added7 += 1;
      if (now - created <= 30 * dayMs) added30 += 1;
      if (now - created <= 1 * dayMs) freshness.new24h += 1;
      if (now - created <= 7 * dayMs) freshness.new7d += 1;
    }

    const seenTs =
      rowTimestamp(row.last_seen_date) ??
      rowTimestamp(row.updated_at) ??
      rowTimestamp(row.scraped_at) ??
      rowTimestamp(row.created_at);
    if (seenTs !== null) {
      if (now - seenTs <= 1 * dayMs) freshness.seen24h += 1;
      if (now - seenTs <= 3 * dayMs) freshness.seen72h += 1;
      freshness.latestSeenTs = freshness.latestSeenTs === null ? seenTs : Math.max(freshness.latestSeenTs, seenTs);
    }

    if (row.price_reduced === true) {
      const reductionDate = String(row.price_reduced_date ?? row.updated_at ?? "").trim();
      const reductionTs = Date.parse(reductionDate);
      if (Number.isFinite(reductionTs) && now - reductionTs <= 7 * dayMs) priceReductions7d += 1;
    }
  }

  const topMakes = Array.from(makeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([make, count]) => ({ make, count }));

  const scoreCoveragePct = rows.length > 0 ? Number(((withScore / rows.length) * 100).toFixed(1)) : 0;
  const avgDaysOnMarket = avgDomCount > 0 ? Number((avgDomNumerator / avgDomCount).toFixed(1)) : 0;
  const sourceFreshness = Array.from(freshnessBySource.entries())
    .map(([source, stats]) => ({
      source,
      active_listings: stats.active,
      seen_last_24h_pct: stats.active > 0 ? Number(((stats.seen24h / stats.active) * 100).toFixed(1)) : 0,
      seen_last_72h_pct: stats.active > 0 ? Number(((stats.seen72h / stats.active) * 100).toFixed(1)) : 0,
      new_last_24h: stats.new24h,
      new_last_7d: stats.new7d,
      last_seen_at: stats.latestSeenTs ? new Date(stats.latestSeenTs).toISOString() : null,
    }))
    .sort((a, b) => b.active_listings - a.active_listings);

  const [ownershipChanges30d, ebaySoldRecords, faaRecordsLoaded, engineTboRecords, propTboRecords, avionicsCatalogUnits] =
    await Promise.all([
      safeCount("detected_ownership_changes"),
      safeCount("ebay_sold_components"),
      safeCountByColumn("faa_aircraft_ref", "mfr_mdl_code"),
      safeCount("engine_tbo_reference"),
      safeCount("prop_tbo_reference"),
      safeCount("avionics_catalog"),
    ]);

  return {
    listings: {
      total_active: rows.length,
      added_last_7_days: added7,
      added_last_30_days: added30,
      with_score: withScore,
      without_score: withoutScore,
      score_coverage_pct: scoreCoveragePct,
      by_source: listingBySource,
      source_freshness: sourceFreshness,
      by_make: topMakes,
      price_distribution: {
        under_50k: under50k,
        under_100k: under100k,
        under_200k: under200k,
        over_200k: over200k,
      },
    },
    deals: {
      high_score_listings: highScoreListings,
      price_reductions_last_7d: priceReductions7d,
      newly_flagged_deals: highScoreListings,
      avg_days_on_market: avgDaysOnMarket,
    },
    market_intelligence: {
      ownership_changes_detected_30d: ownershipChanges30d,
      ebay_sold_records: ebaySoldRecords,
      faa_records_loaded: faaRecordsLoaded,
      engine_tbo_records: engineTboRecords,
      prop_tbo_records: propTboRecords,
      avionics_catalog_units: avionicsCatalogUnits,
    },
    scraper_health: {
      last_run_by_source: {},
      listings_updated_last_24h: added7,
      failed_sources_last_24h: [],
    },
  };
}

function listPrice(row: ListingRow): number | null {
  return asNumber(row.asking_price ?? row.price_asking ?? row.price);
}

function listDom(row: ListingRow): number | null {
  return asNumber(row.days_on_market);
}

function modelKey(make: string, model: string): string {
  return `${make}|||${model}`;
}

export async function computeBuyerIntelligence() {
  const rows = await getActiveListings();
  const modelBuckets = new Map<string, ListingRow[]>();
  for (const row of rows) {
    const make = String(row.make ?? "").trim();
    const model = String(row.model ?? "").trim();
    if (!make || !model) continue;
    const key = modelKey(make, model);
    if (!modelBuckets.has(key)) modelBuckets.set(key, []);
    modelBuckets.get(key)!.push(row);
  }

  const priceTrends = Array.from(modelBuckets.entries())
    .map(([key, modelRows]) => {
      const [make, model] = key.split("|||");
      const prices = modelRows.map(listPrice).filter((value): value is number => value !== null);
      const doms = modelRows.map(listDom).filter((value): value is number => value !== null);
      const medianAskingPrice = prices.length > 0 ? Math.round(median(prices)) : 0;
      const p25 = prices.length > 0 ? percentile(prices, 0.25) : 0;
      const p75 = prices.length > 0 ? percentile(prices, 0.75) : 0;
      const changePct = p25 > 0 ? Number((((p75 - p25) / p25) * 100).toFixed(1)) : 0;
      const avgDaysOnMarket = doms.length > 0 ? Number((doms.reduce((sum, n) => sum + n, 0) / doms.length).toFixed(1)) : 0;
      return {
        make,
        model,
        sample_count: modelRows.length,
        median_asking_price: medianAskingPrice,
        price_change_30d_pct: changePct,
        avg_days_on_market: avgDaysOnMarket,
        inventory_count: modelRows.length,
      };
    })
    .filter((row) => row.sample_count >= 3)
    .sort((a, b) => b.sample_count - a.sample_count)
    .slice(0, 30);

  const buyerLeverageModels = priceTrends
    .map((trend) => {
      const key = modelKey(trend.make, trend.model);
      const modelRows = modelBuckets.get(key) ?? [];
      const reducedCount = modelRows.filter((row) => row.price_reduced === true).length;
      const pctWithPriceReduction = trend.sample_count > 0 ? Number(((reducedCount / trend.sample_count) * 100).toFixed(1)) : 0;
      return {
        make: trend.make,
        model: trend.model,
        inventory_count: trend.inventory_count,
        avg_days_on_market: trend.avg_days_on_market,
        pct_with_price_reduction: pctWithPriceReduction,
      };
    })
    .sort((a, b) => b.inventory_count - a.inventory_count || b.avg_days_on_market - a.avg_days_on_market)
    .slice(0, 10);

  const scarceModels = priceTrends
    .filter((trend) => trend.inventory_count < 5)
    .map((trend) => ({ make: trend.make, model: trend.model, count: trend.inventory_count }))
    .sort((a, b) => a.count - b.count)
    .slice(0, 10);

  const agingHighValue = rows
    .filter((row) => (asNumber(row.value_score) ?? 0) >= 75 && (asNumber(row.days_on_market) ?? 0) > 60)
    .slice(0, 20)
    .map((row) => ({
      listing_id: String(row.id ?? ""),
      make: String(row.make ?? ""),
      model: String(row.model ?? ""),
      year: asNumber(row.year) ?? 0,
      price: listPrice(row) ?? 0,
      value_score: asNumber(row.value_score) ?? 0,
      days_on_market: asNumber(row.days_on_market) ?? 0,
      source_url: String(row.source_url ?? row.listing_url ?? row.url ?? ""),
    }));

  const priceDrops = rows
    .filter((row) => row.price_reduced === true && (asNumber(row.price_reduction_amount) ?? 0) > 0)
    .slice(0, 30)
    .map((row) => {
      const currentPrice = listPrice(row) ?? 0;
      const reduction = asNumber(row.price_reduction_amount) ?? 0;
      const original = currentPrice + reduction;
      const reductionPct = original > 0 ? Number(((reduction / original) * 100).toFixed(1)) : 0;
      return {
        listing_id: String(row.id ?? ""),
        make: String(row.make ?? ""),
        model: String(row.model ?? ""),
        year: asNumber(row.year) ?? 0,
        original_price: original,
        current_price: currentPrice,
        reduction_pct: reductionPct,
        value_score: asNumber(row.value_score) ?? 0,
        days_on_market: asNumber(row.days_on_market) ?? 0,
      };
    });

  const belowCompListings = rows
    .filter((row) => {
      const price = listPrice(row);
      const comp = asNumber(row.estimated_market_value);
      return price !== null && comp !== null && comp > 0 && ((comp - price) / comp) * 100 > 15;
    })
    .slice(0, 30)
    .map((row) => {
      const price = listPrice(row) ?? 0;
      const comp = asNumber(row.estimated_market_value) ?? 0;
      const discountPct = comp > 0 ? Number((((comp - price) / comp) * 100).toFixed(1)) : 0;
      return {
        listing_id: String(row.id ?? ""),
        make: String(row.make ?? ""),
        model: String(row.model ?? ""),
        year: asNumber(row.year) ?? 0,
        price,
        estimated_market_value: comp,
        discount_pct: discountPct,
        value_score: asNumber(row.value_score) ?? 0,
      };
    });

  const tboRiskListings = rows
    .filter((row) => (asNumber(row.engine_tbo_hours) ?? 0) > 0 && (asNumber(row.time_since_overhaul ?? row.engine_time_since_overhaul) ?? 0) > 0)
    .map((row) => {
      const tbo = asNumber(row.engine_tbo_hours) ?? 0;
      const smoh = asNumber(row.time_since_overhaul ?? row.engine_time_since_overhaul) ?? 0;
      const pct = tbo > 0 ? Number(((smoh / tbo) * 100).toFixed(1)) : 0;
      return {
        listing_id: String(row.id ?? ""),
        make: String(row.make ?? ""),
        model: String(row.model ?? ""),
        year: asNumber(row.year) ?? 0,
        price: listPrice(row) ?? 0,
        engine_model: String(row.engine_model ?? ""),
        smoh,
        tbo_hours: tbo,
        pct_of_tbo_used: pct,
      };
    })
    .filter((row) => row.pct_of_tbo_used >= 80)
    .sort((a, b) => b.pct_of_tbo_used - a.pct_of_tbo_used)
    .slice(0, 25);

  const byTail = new Map<string, ListingRow[]>();
  for (const row of rows) {
    const n = String(row.n_number ?? "").trim().toUpperCase();
    if (!n) continue;
    if (!byTail.has(n)) byTail.set(n, []);
    byTail.get(n)!.push(row);
  }
  const relists = Array.from(byTail.entries())
    .filter(([, listings]) => listings.length > 1)
    .map(([nNumber, listings]) => ({
      n_number: nNumber,
      current_listing_id: String(listings[0]?.id ?? ""),
      previous_listing_ids: listings.slice(1).map((listing) => String(listing.id ?? "")),
      price_history: listings.map((listing) => listPrice(listing) ?? 0).filter((price) => price > 0),
    }))
    .slice(0, 15);

  const targetModelPatterns = [
    { make: "Cessna", model: "150" },
    { make: "Cessna", model: "152" },
    { make: "Cessna", model: "172" },
    { make: "Piper", model: "Cherokee 180" },
    { make: "Piper", model: "Warrior" },
    { make: "Beech", model: "Musketeer" },
    { make: "Beech", model: "Sundowner" },
  ];

  const modelBenchmarks = targetModelPatterns
    .map((pattern) => {
      const modelRows = rows.filter((row) => {
        const make = String(row.make ?? "").toLowerCase();
        const model = String(row.model ?? "").toLowerCase();
        return make.includes(pattern.make.toLowerCase()) && model.includes(pattern.model.toLowerCase());
      });
      const prices = modelRows.map(listPrice).filter((value): value is number => value !== null);
      const deferred = modelRows.map((row) => asNumber(row.deferred_total)).filter((value): value is number => value !== null);
      if (modelRows.length === 0 || prices.length === 0) return null;
      const medianAsk = Math.round(median(prices));
      const avgDeferred = deferred.length > 0 ? Math.round(deferred.reduce((sum, n) => sum + n, 0) / deferred.length) : 12000;
      const annualCost = Math.round(medianAsk * 0.12 + 4500);
      const resaleComp = Math.round(medianAsk * 1.08);
      return {
        make: pattern.make,
        model: pattern.model,
        median_asking_price: medianAsk,
        avg_deferred_maintenance_estimate: avgDeferred,
        typical_annual_cost: annualCost,
        flip_margin_estimate: resaleComp - medianAsk - avgDeferred,
        sample_size: modelRows.length,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const supabase = createPrivilegedServerClient();
  const transfers = await withTimeout(
    supabase
      .from("detected_ownership_changes")
      .select("n_number,old_owner,new_owner,new_cert_date,asking_price_at_detection,listing_id")
      .order("detected_at", { ascending: false })
      .limit(20),
    10000,
    "ownership transfer query"
  );

  const listingIds = Array.from(
    new Set((transfers.data ?? []).map((row) => String(row.listing_id ?? "")).filter((id) => id.length > 0))
  );
  const listingMap = new Map<string, { make: string; model: string; year: number }>();
  if (listingIds.length > 0) {
    const listingRows = await withTimeout(
      supabase.from("aircraft_listings").select("id,make,model,year").in("id", listingIds),
      10000,
      "ownership listing lookup query"
    );
    for (const row of listingRows.data ?? []) {
      listingMap.set(String(row.id), {
        make: String(row.make ?? ""),
        model: String(row.model ?? ""),
        year: asNumber(row.year) ?? 0,
      });
    }
  }

  const recentTransfers = (transfers.data ?? []).map((row) => {
    const listing = listingMap.get(String(row.listing_id ?? ""));
    return {
      n_number: String(row.n_number ?? ""),
      make: listing?.make ?? "",
      model: listing?.model ?? "",
      year: listing?.year ?? 0,
      old_owner: String(row.old_owner ?? ""),
      new_owner: String(row.new_owner ?? ""),
      transfer_date: String(row.new_cert_date ?? ""),
      last_known_asking_price: asNumber(row.asking_price_at_detection) ?? 0,
    };
  });

  return {
    market_snapshot: {
      price_trends: priceTrends,
      buyer_leverage_models: buyerLeverageModels,
      scarce_models: scarceModels,
    },
    deal_patterns: {
      aging_high_value: agingHighValue,
      price_drops: priceDrops,
      below_comp_listings: belowCompListings,
    },
    avoidance_signals: {
      tbo_risk_listings: tboRiskListings,
      potential_relists: relists,
    },
    cost_of_ownership_benchmarks: {
      by_model: modelBenchmarks,
    },
    ownership_transfer_feed: {
      recent_transfers: recentTransfers,
    },
  };
}

export async function listInvitesWithSessions() {
  const supabase = createPrivilegedServerClient();
  const invites = await supabase
    .from("beta_invites")
    .select("id,token,label,email,created_by,created_at,expires_at,used_at,used_by_email,is_active,access_tier")
    .order("created_at", { ascending: false })
    .limit(200);
  if (invites.error) {
    return {
      invites: [],
      sessions: [],
      stats: {
        total_invites_sent: 0,
        total_activated: 0,
        currently_active_sessions: 0,
      },
    };
  }

  const sessions = await supabase
    .from("beta_sessions")
    .select("id,invite_id,created_at,last_seen_at,ip_address,user_agent")
    .order("last_seen_at", { ascending: false })
    .limit(500);
  if (sessions.error) {
    return {
      invites: (invites.data ?? []) as Record<string, unknown>[],
      sessions: [],
      stats: {
        total_invites_sent: (invites.data ?? []).length,
        total_activated: 0,
        currently_active_sessions: 0,
      },
    };
  }

  const sessionsByInvite = new Map<string, Record<string, unknown>[]>();
  for (const session of (sessions.data ?? []) as Record<string, unknown>[]) {
    const inviteId = String(session.invite_id ?? "");
    if (!inviteId) continue;
    if (!sessionsByInvite.has(inviteId)) sessionsByInvite.set(inviteId, []);
    sessionsByInvite.get(inviteId)!.push(session);
  }

  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const inviteRows: Array<Record<string, unknown>> = ((invites.data ?? []) as Record<string, unknown>[]).map((invite) => {
    const inviteId = String(invite.id ?? "");
    const inviteSessions = sessionsByInvite.get(inviteId) ?? [];
    const activeSession = inviteSessions.some((session) => {
      const ts = Date.parse(String(session.last_seen_at ?? ""));
      return Number.isFinite(ts) && now - ts <= oneDayMs;
    });
    return {
      ...invite,
      session_active: activeSession,
      session_count: inviteSessions.length,
    };
  });

  return {
    invites: inviteRows,
    sessions: sessions.data ?? [],
    stats: {
      total_invites_sent: inviteRows.length,
      total_activated: inviteRows.filter((row) => Boolean(row.used_at)).length,
      currently_active_sessions: inviteRows.filter((row) => row.session_active === true).length,
    },
  };
}

export async function computeAvionicsIntelligence(options?: { days?: number; top?: number }) {
  const supabase = createPrivilegedServerClient();
  const lookbackDays = Math.max(1, Number(options?.days ?? 90));
  const topN = Math.max(1, Number(options?.top ?? 30));
  const cutoffDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let offset = 0;
  const pageSize = 1000;
  let listingsScanned = 0;
  let listingsWithAvionicsText = 0;
  let listingsWithObservations = 0;
  let listingsWithObservationsInAvionicsText = 0;
  let observationRowsTotal = 0;
  let matchedRows = 0;
  let unresolvedRows = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;

  const unresolvedCounts = new Map<string, number>();
  const parserCounts = new Map<string, number>();
  const sourceStats = new Map<
    string,
    {
      listings_scanned: number;
      listings_with_avionics_text: number;
      listings_with_observations: number;
      matched_rows: number;
      unresolved_rows: number;
    }
  >();

  while (true) {
    const to = offset + pageSize - 1;
    const page = await withTimeout(
      supabase
        .from("aircraft_listings")
        .select("source_site,last_seen_date,avionics_description,description_full,description,description_intelligence")
        .gte("last_seen_date", cutoffDate)
        .order("last_seen_date", { ascending: false })
        .range(offset, to),
      12000,
      "avionics intelligence query"
    );

    if (page.error) throw new Error(page.error.message);
    const rows = (page.data ?? []) as ListingRow[];
    if (rows.length === 0) break;

    for (const row of rows) {
      listingsScanned += 1;
      const source = inferSource(row);
      if (!sourceStats.has(source)) {
        sourceStats.set(source, {
          listings_scanned: 0,
          listings_with_avionics_text: 0,
          listings_with_observations: 0,
          matched_rows: 0,
          unresolved_rows: 0,
        });
      }
      const sourceRow = sourceStats.get(source)!;
      sourceRow.listings_scanned += 1;

      const text = `${String(row.avionics_description ?? "")} ${String(row.description_full ?? "")} ${String(row.description ?? "")}`.trim();
      const hasAvionicsText = AVIONICS_HINT_RE.test(text);
      if (hasAvionicsText) {
        listingsWithAvionicsText += 1;
        sourceRow.listings_with_avionics_text += 1;
      }

      const parsed = asObject(row.description_intelligence);
      const parserVersion = String(parsed.avionics_parser_version ?? "").trim();
      if (parserVersion) {
        parserCounts.set(parserVersion, (parserCounts.get(parserVersion) ?? 0) + 1);
      }

      const detailed = Array.isArray(parsed.avionics_detailed) ? (parsed.avionics_detailed as Array<Record<string, unknown>>) : [];
      const unresolved = Array.isArray(parsed.avionics_unresolved) ? parsed.avionics_unresolved : [];
      let rowMatched = 0;
      let rowUnresolved = 0;

      for (const item of detailed) {
        const canonical = String(item?.canonical_name ?? "").trim();
        if (!canonical) continue;
        rowMatched += 1;
        const confidence = asNumber(item?.confidence);
        if (confidence !== null) {
          confidenceSum += confidence;
          confidenceCount += 1;
        }
      }

      for (const token of unresolved) {
        const normalized = normalizeToken(token);
        if (!normalized) continue;
        rowUnresolved += 1;
        unresolvedCounts.set(normalized, (unresolvedCounts.get(normalized) ?? 0) + 1);
      }

      const rowTotal = rowMatched + rowUnresolved;
      if (rowTotal > 0) {
        listingsWithObservations += 1;
        sourceRow.listings_with_observations += 1;
        if (hasAvionicsText) listingsWithObservationsInAvionicsText += 1;
      }

      matchedRows += rowMatched;
      unresolvedRows += rowUnresolved;
      observationRowsTotal += rowTotal;
      sourceRow.matched_rows += rowMatched;
      sourceRow.unresolved_rows += rowUnresolved;
    }

    offset += rows.length;
    if (rows.length < pageSize) break;
  }

  const sortedUnresolved = Array.from(unresolvedCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([token, count]) => ({ token, count }));

  const parserVersionBreakdown = Array.from(parserCounts.entries())
    .sort((a, b) => compareSemver(b[0], a[0]))
    .reduce<Record<string, number>>((acc, [version, count]) => {
      acc[version] = count;
      return acc;
    }, {});

  const leadingParserVersion = Object.entries(parserVersionBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
  const matchedRatePct = observationRowsTotal > 0 ? Number(((matchedRows / observationRowsTotal) * 100).toFixed(2)) : 0;
  const unresolvedRatePct = observationRowsTotal > 0 ? Number(((unresolvedRows / observationRowsTotal) * 100).toFixed(2)) : 0;
  const extractionCoveragePct =
    listingsWithAvionicsText > 0 ? Number(((listingsWithObservationsInAvionicsText / listingsWithAvionicsText) * 100).toFixed(2)) : 0;
  const avgMatchConfidence = confidenceCount > 0 ? Number((confidenceSum / confidenceCount).toFixed(4)) : 0;

  const [unitsActive, aliasesTotal, marketValuesTotal, priceObservationsTotal] = await Promise.all([
    safeCount("avionics_units"),
    safeCount("avionics_aliases"),
    safeCount("avionics_market_values"),
    safeCount("avionics_price_observations"),
  ]);

  const sourceBreakdown = Array.from(sourceStats.entries())
    .map(([source, stats]) => {
      const total = stats.matched_rows + stats.unresolved_rows;
      return {
        source_site: source,
        ...stats,
        observation_rows_total: total,
        matched_rate_pct: total > 0 ? Number(((stats.matched_rows / total) * 100).toFixed(2)) : 0,
      };
    })
    .sort((a, b) => b.observation_rows_total - a.observation_rows_total);

  return {
    computed_at: new Date().toISOString(),
    window_days: lookbackDays,
    cutoff_date: cutoffDate,
    listings_scanned: listingsScanned,
    listings_with_avionics_text: listingsWithAvionicsText,
    listings_with_observations: listingsWithObservations,
    listings_with_observations_in_avionics_text: listingsWithObservationsInAvionicsText,
    observation_rows_total: observationRowsTotal,
    matched_rows: matchedRows,
    unresolved_rows: unresolvedRows,
    matched_rate_pct: matchedRatePct,
    unresolved_rate_pct: unresolvedRatePct,
    extraction_coverage_pct: extractionCoveragePct,
    avg_match_confidence: avgMatchConfidence,
    parser_version_breakdown: parserVersionBreakdown,
    leading_parser_version: leadingParserVersion,
    top_unresolved_tokens: sortedUnresolved,
    catalog: {
      units_active: unitsActive,
      aliases_total: aliasesTotal,
      market_values_total: marketValuesTotal,
      price_observations_total: priceObservationsTotal,
    },
    source_breakdown: sourceBreakdown,
  };
}
