import { unstable_cache } from "next/cache";
import {
  aggregateListingFilterOptionsFromRows,
  parseListingFilterOptionsRpcPayload,
  type ListingsFilterOptionsClientShape,
} from "../listings/filterOptionsAggregate";
import { CATEGORY_PARAM_TO_DB } from "../listings/categoryMap";
import { createPrivilegedServerClient, createServerClient } from "../supabase/server";

export type ListingFilters = {
  minDealRating?: number;
  maxPrice?: number;
  limit?: number;
  onlyActive?: boolean;
};

export type ListingsPageQuery = {
  page?: number;
  pageSize?: number;
  q?: string;
  make?: string;
  model?: string;
  modelFamily?: string;
  subModel?: string;
  source?: string;
  state?: string;
  risk?: string;
  dealTier?: string;
  minValueScore?: number;
  minPrice?: number;
  maxPrice?: number;
  priceStatus?: "all" | "priced";
  yearMin?: number;
  yearMax?: number;
  totalTimeMin?: number;
  totalTimeMax?: number;
  maintenanceBand?: "any" | "light" | "moderate" | "heavy" | "severe";
  engineTime?: "any" | "fresh" | "mid" | "approaching" | "hasHours";
  trueCostMin?: number;
  trueCostMax?: number;
  sortBy?: string;
  category?: string;
  ownershipType?: "all" | "full" | "fractional";
};

function createReadServerClient() {
  try {
    return createPrivilegedServerClient();
  } catch {
    return createServerClient();
  }
}

function isTransientSupabaseUpstreamFailure(rawMessage: unknown): boolean {
  const message = String(rawMessage ?? "").toLowerCase();
  return (
    message.includes("statement timeout") ||
    message.includes("connection timed out") ||
    message.includes("error code 522") ||
    message.includes("cloudflare") ||
    message.includes("<!doctype html") ||
    message.includes("bad gateway") ||
    message.includes("gateway timeout") ||
    message.includes("fetch failed")
  );
}

export async function getAircraftListingsCount() {
  const supabase = createPrivilegedServerClient();
  const result = await supabase
    .from("aircraft_listings")
    .select("id", { count: "exact", head: true });
  if (result.error) throw new Error(result.error.message);
  return typeof result.count === "number" ? result.count : 0;
}

export type ListingFilterOption = {
  make: string | null;
  model: string | null;
  state: string | null;
  source: string | null;
  dealTier: string | null;
  valueScore: number | null;
};

function parseImageUrlCandidates(value: unknown): string[] {
  const normalize = (input: unknown) =>
    Array.from(
      new Set(
        (Array.isArray(input) ? input : [])
          .map((item) => String(item ?? "").trim())
          .filter((item) => item.length > 0)
      )
    );

  if (Array.isArray(value)) return normalize(value);
  if (typeof value !== "string") return [];

  const raw = value.trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      return normalize(JSON.parse(raw));
    } catch {
      // Fall through to other parsing strategies.
    }
  }
  if (raw.includes(",")) {
    return normalize(raw.split(","));
  }
  return [raw];
}

function countDefaultListingDetails(row: Record<string, unknown>): number {
  const hasText = (value: unknown) => String(value ?? "").trim().length > 0;
  const hasNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0;

  return [
    hasText(row.make),
    hasText(row.model),
    hasNumber(row.year),
    hasText(row.n_number),
    hasNumber(row.asking_price),
    hasText(row.location_label) || hasText(row.location_state),
    hasNumber(row.total_time_airframe),
    hasNumber(row.time_since_overhaul),
  ].filter(Boolean).length;
}

function hasMultipleListingPhotos(row: Record<string, unknown>): boolean {
  const candidates = new Set<string>();
  const primary = String(row.primary_image_url ?? "").trim();
  if (primary) candidates.add(primary);
  for (const url of parseImageUrlCandidates(row.image_urls)) {
    candidates.add(url);
  }
  return candidates.size > 1;
}

function shouldIncludeInDefaultListings(row: Record<string, unknown>): boolean {
  const tier = String(row.deal_tier ?? "").trim().toUpperCase();
  if (tier !== "EXCEPTIONAL_DEAL") return false;
  if (!hasMultipleListingPhotos(row)) return false;
  return countDefaultListingDetails(row) >= 5;
}

export async function getListings(filters: ListingFilters = {}) {
  const supabase = createReadServerClient();
  const {
    minDealRating = 0,
    maxPrice,
    limit = 1000,
    onlyActive = true,
  } = filters;

  let query = supabase
    .from("public_listings")
    .select("*")
    .gte("deal_rating", minDealRating)
    .order("deal_rating", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (onlyActive) query = query.eq("is_active", true);
  if (typeof maxPrice === "number") {
    query = applyPositivePriceCeiling(query, maxPrice);
  }

  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result.data ?? [];
}

const LISTINGS_PAGE_COLUMNS_PUBLIC =
  "id,source,source_id,url,listing_url:url,make,model,year,asking_price,value_score,avionics_score,avionics_installed_value,risk_level,total_time_airframe,location_label,location_state,deferred_total,true_cost,primary_image_url,image_urls,time_since_overhaul,deal_rating,deal_tier,vs_median_price,n_number,is_active,engine_hours_smoh,engine_tbo_hours,engine_remaining_value,engine_overrun_liability,engine_reserve_per_hour,ev_hours_smoh,ev_tbo_hours,ev_hours_remaining,ev_pct_life_remaining,ev_exchange_price,ev_engine_remaining_value,ev_engine_overrun_liability,ev_engine_reserve_per_hour,ev_score_contribution,ev_data_quality,ev_explanation";
const LISTINGS_PAGE_COLUMNS_AIRCRAFT =
  "id,source,source_id,url,listing_url:source_url,make,model,year,asking_price,value_score,avionics_score,avionics_installed_value,risk_level,total_time_airframe,location_label:location_raw,location_state:state,deferred_total,true_cost,primary_image_url,image_urls,time_since_overhaul,deal_rating,deal_tier,vs_median_price,n_number,is_active";

function columnsForListingsTable(table: string): string {
  return table === "aircraft_listings"
    ? LISTINGS_PAGE_COLUMNS_AIRCRAFT
    : LISTINGS_PAGE_COLUMNS_PUBLIC;
}

const SE_TURBOPROP_OR =
  "make.ilike.%Pilatus%,make.ilike.%TBM%,make.ilike.%Daher%,make.ilike.%Socata%,make.ilike.%Quest%,model.ilike.%PC-12%,model.ilike.%PC12%,model.ilike.%TBM%,model.ilike.%Caravan%,model.ilike.%Grand Caravan%,model.ilike.%208%,model.ilike.%Meridian%,model.ilike.%M500%,model.ilike.%M600%,model.ilike.%Kodiak%,model.ilike.%Jetprop%";
const ME_TURBOPROP_OR =
  "model.ilike.%King Air%,model.ilike.%Conquest%,model.ilike.%Cheyenne%,model.ilike.%MU-2%,model.ilike.%MU2%,model.ilike.%Twin Otter%,model.ilike.%Commander 690%,model.ilike.%Metroliner%,model.ilike.%Metro%,model.ilike.%441%,make.ilike.%Swearingen%,make.ilike.%Mitsubishi%";
const JET_OR =
  "make.ilike.%Citation%,model.ilike.%Citation%,model.ilike.%Phenom%,model.ilike.%HondaJet%,model.ilike.%Eclipse%,model.ilike.%Premier%";
const SEA_OR =
  "model.ilike.%Seaplane%,model.ilike.%Amphib%,model.ilike.%Float%,model.ilike.%Flying Boat%,model.ilike.%SeaRey%,model.ilike.%Sea Rey%,make.ilike.%Icon%,make.ilike.%Lake%,make.ilike.%Seawind%,make.ilike.%Progressive Aerodyne%";
const MULTI_OR =
  "model.ilike.%Twin%,model.ilike.%Seneca%,model.ilike.%Aztec%,model.ilike.%Baron%,model.ilike.%310%,model.ilike.%340%,model.ilike.%402%,model.ilike.%414%,model.ilike.%421%";
const HELICOPTER_MAKE_PATTERNS = [
  "%Robinson%",
  "%Bell%",
  "%Sikorsky%",
  "%Eurocopter%",
  "%Airbus Helicopter%",
  "%MD Helicopters%",
  "%Schweizer%",
  "%Agusta%",
  "%AgustaWestland%",
  "%Leonardo%",
  "%Enstrom%",
  "%Kaman%",
  "%Hughes Helicopter%",
];
const HELICOPTER_MODEL_PATTERNS = [
  "%R22%",
  "%R44%",
  "%R66%",
  "%EC120%",
  "%EC130%",
  "%EC135%",
  "%H125%",
  "%AS350%",
  "%UH-%",
  "%AW109%",
  "%AW119%",
  "%AW139%",
  "%MD500%",
  "%rotorcraft%",
  "%helicopter%",
];
const HELICOPTER_OR =
  [
    ...HELICOPTER_MAKE_PATTERNS.map((pattern) => `make.ilike.${pattern}`),
    ...HELICOPTER_MODEL_PATTERNS.map((pattern) => `model.ilike.${pattern}`),
  ].join(",");
const LSP_OR =
  "model.ilike.%LSA%,model.ilike.%Light Sport%,make.ilike.%Flight Design%,make.ilike.%Tecnam%,make.ilike.%Jabiru%,make.ilike.%Pipistrel%";
/** Fallback when `aircraft_type` is null/unknown — keep broad enough to cover common piston singles. */
const SINGLE_OR =
  "make.ilike.%Cessna%,make.ilike.%Piper%,make.ilike.%Beechcraft%,make.ilike.%Cirrus%,make.ilike.%Mooney%,make.ilike.%Diamond%,make.ilike.%Grumman%,make.ilike.%Vans%,make.ilike.%Zenith%,make.ilike.%American Champion%,make.ilike.%CubCrafters%,make.ilike.%Maule%,make.ilike.%Aviat%,make.ilike.%Sonex%,make.ilike.%Flight Design%,make.ilike.%Pitts%";

type FractionalFields = {
  is_fractional_ownership: boolean | null;
  fractional_share_numerator: number | null;
  fractional_share_denominator: number | null;
  fractional_share_percent: number | null;
  fractional_share_price: number | null;
  fractional_full_price_estimate: number | null;
  fractional_review_needed: boolean | null;
};

function toNumericOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replaceAll(",", "").trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function deriveEngineValueFallback(row: Record<string, unknown>): Record<string, unknown> {
  const evHoursSmoh =
    toNumericOrNull(row.ev_hours_smoh) ??
    toNumericOrNull(row.engine_hours_smoh) ??
    toNumericOrNull(row.engine_time_since_overhaul) ??
    toNumericOrNull(row.time_since_overhaul);
  const evTboHours =
    toNumericOrNull(row.ev_tbo_hours) ??
    toNumericOrNull(row.engine_tbo_hours);
  const evHoursRemaining =
    toNumericOrNull(row.ev_hours_remaining) ??
    (typeof evHoursSmoh === "number" && typeof evTboHours === "number"
      ? Math.round(evTboHours - evHoursSmoh)
      : null);
  const evPctLifeRemaining =
    toNumericOrNull(row.ev_pct_life_remaining) ??
    (typeof evHoursSmoh === "number" && typeof evTboHours === "number" && evTboHours > 0
      ? clampNumber((evTboHours - evHoursSmoh) / evTboHours, -1, 1)
      : null);
  const evEngineRemainingValue =
    toNumericOrNull(row.ev_engine_remaining_value) ??
    toNumericOrNull(row.engine_remaining_value);
  const evEngineOverrunLiability =
    toNumericOrNull(row.ev_engine_overrun_liability) ??
    toNumericOrNull(row.engine_overrun_liability);
  const evEngineReservePerHour =
    toNumericOrNull(row.ev_engine_reserve_per_hour) ??
    toNumericOrNull(row.engine_reserve_per_hour);
  const evExchangePrice = toNumericOrNull(row.ev_exchange_price);
  const evScoreContribution = toNumericOrNull(row.ev_score_contribution);

  const existingQuality = String(row.ev_data_quality ?? "").trim();
  let derivedQuality: string | null = null;
  if (!existingQuality) {
    const hasTbo = typeof evTboHours === "number" && Number.isFinite(evTboHours);
    const hasSmoh = typeof evHoursSmoh === "number" && Number.isFinite(evHoursSmoh);
    const hasValuation =
      typeof evEngineRemainingValue === "number" ||
      typeof evEngineOverrunLiability === "number" ||
      typeof evEngineReservePerHour === "number";
    if (hasTbo && hasSmoh && hasValuation) derivedQuality = "full";
    else if (hasTbo) derivedQuality = "tbo_only";
    else if (hasSmoh) derivedQuality = "hours_only";
  }

  return {
    ...row,
    ev_hours_smoh: evHoursSmoh,
    ev_tbo_hours: evTboHours,
    ev_hours_remaining: evHoursRemaining,
    ev_pct_life_remaining: evPctLifeRemaining,
    ev_engine_remaining_value: evEngineRemainingValue,
    ev_engine_overrun_liability: evEngineOverrunLiability,
    ev_engine_reserve_per_hour: evEngineReservePerHour,
    ev_exchange_price: evExchangePrice,
    ev_score_contribution: evScoreContribution,
    ev_data_quality: existingQuality || derivedQuality,
  };
}

function normalizeEngineValueRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => deriveEngineValueFallback(row));
}

function toRecordRows(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (row): row is Record<string, unknown> =>
      typeof row === "object" && row !== null && !Array.isArray(row)
  );
}

function parseFractionalFromDescriptionIntelligence(value: unknown): FractionalFields {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = null;
    }
  }
  const obj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  const pricing = obj?.pricing_context;
  const pricingObj = pricing && typeof pricing === "object" ? (pricing as Record<string, unknown>) : null;
  if (!pricingObj) {
    return {
      is_fractional_ownership: null,
      fractional_share_numerator: null,
      fractional_share_denominator: null,
      fractional_share_percent: null,
      fractional_share_price: null,
      fractional_full_price_estimate: null,
      fractional_review_needed: null,
    };
  }
  return {
    is_fractional_ownership: pricingObj.is_fractional === true,
    fractional_share_numerator: toNumericOrNull(pricingObj.share_numerator),
    fractional_share_denominator: toNumericOrNull(pricingObj.share_denominator),
    fractional_share_percent: toNumericOrNull(pricingObj.share_percent),
    fractional_share_price: toNumericOrNull(pricingObj.share_price),
    fractional_full_price_estimate: toNumericOrNull(pricingObj.normalized_full_price),
    fractional_review_needed: pricingObj.review_needed === true,
  };
}

async function attachFractionalFields(
  supabase: ReturnType<typeof createServerClient>,
  rows: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
  if (!rows.length) return rows;
  const ids = Array.from(
    new Set(rows.map((row) => String(row.id ?? "")).filter((value) => value.length > 0))
  );
  if (!ids.length) return rows;

  const byId = new Map<string, FractionalFields>();
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const direct = await supabase
      .from("aircraft_listings")
      .select(
        "id,is_fractional_ownership,fractional_share_numerator,fractional_share_denominator,fractional_share_percent,fractional_share_price,fractional_full_price_estimate,fractional_review_needed"
      )
      .in("id", chunk);
    if (!direct.error) {
      for (const row of direct.data ?? []) {
        byId.set(String(row.id), {
          is_fractional_ownership: row.is_fractional_ownership ?? null,
          fractional_share_numerator: toNumericOrNull(row.fractional_share_numerator),
          fractional_share_denominator: toNumericOrNull(row.fractional_share_denominator),
          fractional_share_percent: toNumericOrNull(row.fractional_share_percent),
          fractional_share_price: toNumericOrNull(row.fractional_share_price),
          fractional_full_price_estimate: toNumericOrNull(row.fractional_full_price_estimate),
          fractional_review_needed: row.fractional_review_needed ?? null,
        });
      }
      continue;
    }

    const fallback = await supabase
      .from("aircraft_listings")
      .select("id,description_intelligence")
      .in("id", chunk);
    if (!fallback.error) {
      for (const row of fallback.data ?? []) {
        byId.set(String(row.id), parseFractionalFromDescriptionIntelligence(row.description_intelligence));
      }
    }
  }

  return rows.map((row) => {
    const merged = byId.get(String(row.id ?? ""));
    return merged ? { ...row, ...merged } : row;
  });
}

function applyOwnershipFilterToRows(
  rows: Record<string, unknown>[],
  ownershipType: string
): Record<string, unknown>[] {
  if (ownershipType !== "fractional" && ownershipType !== "full") return rows;
  return rows.filter((row) => {
    const isFractional = row.is_fractional_ownership === true;
    if (ownershipType === "fractional") return isFractional;
    return !isFractional;
  });
}

type ParsedListingsSearch = {
  makeToken?: string;
  modelToken?: string;
  yearToken?: number;
  orClause?: string;
};

export function isDefaultListingsLandingQuery(query: ListingsPageQuery): boolean {
  const hasText = (value: unknown) => String(value ?? "").trim().length > 0;
  const ownershipType = String(query.ownershipType ?? "").trim().toLowerCase();
  const isDefaultOwnership = !ownershipType || ownershipType === "all";
  const priceStatus = String(query.priceStatus ?? "").trim().toLowerCase();
  const maintenanceBand = String(query.maintenanceBand ?? "").trim().toLowerCase();
  const engineTime = String(query.engineTime ?? "").trim().toLowerCase();
  const isDefaultPriceStatus = !priceStatus || priceStatus === "all";
  const isDefaultMaintenanceBand = !maintenanceBand || maintenanceBand === "any";
  const isDefaultEngineTime = !engineTime || engineTime === "any";
  return (
    !hasText(query.q) &&
    !hasText(query.make) &&
    !hasText(query.model) &&
    !hasText(query.modelFamily) &&
    !hasText(query.subModel) &&
    !hasText(query.source) &&
    !hasText(query.state) &&
    !hasText(query.risk) &&
    !hasText(query.dealTier) &&
    !hasText(query.category) &&
    isDefaultOwnership &&
    Number(query.minValueScore ?? 0) <= 0 &&
    Number(query.minPrice ?? 0) <= 0 &&
    isDefaultPriceStatus &&
    Number(query.yearMin ?? 0) <= 0 &&
    Number(query.yearMax ?? 0) <= 0 &&
    Number(query.totalTimeMin ?? 0) <= 0 &&
    Number(query.totalTimeMax ?? 0) <= 0 &&
    isDefaultMaintenanceBand &&
    isDefaultEngineTime &&
    Number(query.trueCostMin ?? 0) <= 0 &&
    Number(query.trueCostMax ?? 0) <= 0 &&
    Number(query.maxPrice ?? 0) <= 0
  );
}

function normalizeDealTier(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function getDealTierPriority(value: unknown): number {
  const tier = normalizeDealTier(value);
  if (tier === "EXCEPTIONAL_DEAL") return 0;
  if (tier === "GOOD_DEAL") return 1;
  if (tier === "FAIR_MARKET") return 2;
  if (tier === "ABOVE_MARKET") return 3;
  if (tier === "OVERPRICED") return 4;
  return 5;
}

function applyDealTierPreference(
  rows: Record<string, unknown>[],
  enabled: boolean
): Record<string, unknown>[] {
  if (!enabled || rows.length < 2) return rows;
  return rows
    .map((row, index) => ({ row, index, priority: getDealTierPriority(row.deal_tier) }))
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      // Keep existing DB sort behavior inside each deal-tier bucket.
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}

function parseListingsSearch(rawQuery: string): ParsedListingsSearch {
  const q = rawQuery.replaceAll(",", " ").trim();
  if (!q) return {};
  const upper = q.toUpperCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  const firstToken = tokens[0] ?? "";
  const secondToken = tokens[1] ?? "";

  if (tokens.length >= 2) {
    if (/^[A-Za-z-]+$/.test(firstToken) && /^\d{2,4}[A-Za-z]{0,2}$/.test(secondToken)) {
      const parsedYear = Number(secondToken);
      if (/^\d{4}$/.test(secondToken) && Number.isFinite(parsedYear)) {
        return { makeToken: firstToken, yearToken: parsedYear };
      }
      return { makeToken: firstToken, modelToken: secondToken };
    }
    if (/^\d{4}$/.test(firstToken) && /^[A-Za-z-]+$/.test(secondToken)) {
      return { yearToken: Number(firstToken), makeToken: secondToken };
    }
  }

  // Tail-number lookups are common and should avoid broad OR scans.
  if (/^N?\d{1,5}[A-Z]{0,2}$/.test(upper)) {
    const withPrefix = upper.startsWith("N") ? upper : `N${upper}`;
    const withoutPrefix = withPrefix.replace(/^N/, "");
    return { orClause: `n_number.eq.${withPrefix},n_number.eq.${withoutPrefix}` };
  }

  // Fast path for exact source-id lookups (e.g., tap_12345).
  if (/^[A-Za-z]{2,20}_[A-Za-z0-9-]+$/.test(q)) {
    return { orClause: `source_id.ilike.${q}` };
  }

  const clauses = [
    `make.ilike.%${q}%`,
    `model.ilike.%${q}%`,
    `n_number.ilike.%${upper}%`,
    `source_id.ilike.%${q}%`,
  ];

  if (/^\d{4}$/.test(q)) {
    clauses.push(`year.eq.${Number(q)}`);
  }

  return { orClause: clauses.join(",") };
}

function isSimpleSearchOnlyQuery(query: ListingsPageQuery): boolean {
  const q = String(query.q ?? "").trim();
  if (!q) return false;
  const priceStatus = String(query.priceStatus ?? "").trim().toLowerCase();
  const maintenanceBand = String(query.maintenanceBand ?? "").trim().toLowerCase();
  const engineTime = String(query.engineTime ?? "").trim().toLowerCase();
  const isDefaultPriceStatus = !priceStatus || priceStatus === "all";
  const isDefaultMaintenanceBand = !maintenanceBand || maintenanceBand === "any";
  const isDefaultEngineTime = !engineTime || engineTime === "any";
  return (
    !String(query.make ?? "").trim() &&
    !String(query.model ?? "").trim() &&
    !String(query.modelFamily ?? "").trim() &&
    !String(query.subModel ?? "").trim() &&
    !String(query.source ?? "").trim() &&
    !String(query.state ?? "").trim() &&
    !String(query.risk ?? "").trim() &&
    !String(query.ownershipType ?? "").trim() &&
    !String(query.dealTier ?? "").trim() &&
    !String(query.category ?? "").trim() &&
    Number(query.minValueScore ?? 0) <= 0 &&
    Number(query.minPrice ?? 0) <= 0 &&
    isDefaultPriceStatus &&
    Number(query.yearMin ?? 0) <= 0 &&
    Number(query.yearMax ?? 0) <= 0 &&
    Number(query.totalTimeMin ?? 0) <= 0 &&
    Number(query.totalTimeMax ?? 0) <= 0 &&
    isDefaultMaintenanceBand &&
    isDefaultEngineTime &&
    Number(query.trueCostMin ?? 0) <= 0 &&
    Number(query.trueCostMax ?? 0) <= 0 &&
    Number(query.maxPrice ?? 0) <= 0
  );
}

function normalizeSourceFilterValue(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "tap" || normalized === "trade-a-plane" || normalized === "tradeaplane" || normalized === "trade_a_plane" || normalized === "tradaplane") {
    return "tradaplane";
  }
  if (normalized === "aircraftforsale" || normalized === "aircraft_for_sale" || normalized === "afs") return "afs";
  if (normalized === "aero_trader") return "aerotrader";
  if (normalized === "global_air") return "globalair";
  if (normalized === "ctrl") return "controller";
  return normalized;
}

function sourceAliasesForFilter(normalizedSource: string): string[] {
  if (normalizedSource === "tradaplane") return ["tap", "trade-a-plane", "tradeaplane", "trade_a_plane", "tradaplane"];
  if (normalizedSource === "controller") return ["controller", "ctrl"];
  if (normalizedSource === "afs") return ["aircraftforsale", "aircraft_for_sale", "afs"];
  if (normalizedSource === "aerotrader") return ["aerotrader", "aero_trader"];
  if (normalizedSource === "globalair") return ["globalair", "global_air"];
  return [normalizedSource];
}

function sourceDomainNeedlesForFilter(normalizedSource: string): string[] {
  if (normalizedSource === "tradaplane") return ["trade-a-plane", "tradeaplane"];
  if (normalizedSource === "controller" || normalizedSource === "controller_cdp") return ["controller"];
  if (normalizedSource === "aerotrader") return ["aerotrader"];
  if (normalizedSource === "afs") return ["aircraftforsale"];
  if (normalizedSource === "aso") return ["aso"];
  if (normalizedSource === "globalair") return ["globalair"];
  if (normalizedSource === "barnstormers") return ["barnstormers"];
  if (normalizedSource === "avbuyer") return ["avbuyer"];
  return [];
}

function applySourceFilter(
  query: any,
  sourceInput: string,
  includeExtendedSourceFields: boolean
) {
  const normalizedSource = normalizeSourceFilterValue(sourceInput);
  if (!normalizedSource) return query;

  const fields = includeExtendedSourceFields
    ? ["source", "source_site", "listing_source"]
    : ["source"];

  if (normalizedSource === "unknown") {
    const unknownClauses = fields.flatMap((field) => [
      `${field}.is.null`,
      `${field}.eq.`,
      `${field}.eq.unknown`,
    ]);
    return query.or(unknownClauses.join(","));
  }

  const aliases = sourceAliasesForFilter(normalizedSource);
  const clauses = fields.flatMap((field) => aliases.map((alias) => `${field}.eq.${alias}`));
  if (normalizedSource === "controller") {
    for (const field of fields) {
      clauses.push(`${field}.like.controller*`);
    }
  }
  if (includeExtendedSourceFields) {
    const domainNeedles = sourceDomainNeedlesForFilter(normalizedSource);
    for (const needle of domainNeedles) {
      clauses.push(`source_url.ilike.*${needle}*`);
      clauses.push(`url.ilike.*${needle}*`);
    }
  }
  return query.or(clauses.join(","));
}

function applyPositivePriceCeiling(query: any, maxPrice: number) {
  if (!Number.isFinite(maxPrice) || maxPrice <= 0) return query;
  return query
    .not("asking_price", "is", null)
    .gt("asking_price", 0)
    .lte("asking_price", maxPrice);
}

function applyPositiveNumericRange(
  query: any,
  column: string,
  minValue: number,
  maxValue: number
) {
  let next = query;
  const hasMin = Number.isFinite(minValue) && minValue > 0;
  const hasMax = Number.isFinite(maxValue) && maxValue > 0;
  if (!hasMin && !hasMax) return next;
  if (hasMin) next = next.gte(column, minValue);
  if (hasMax) next = next.lte(column, maxValue);
  return next;
}

function applyPriceFilters(
  query: any,
  opts: { minPrice: number; maxPrice: number; priceStatus: string }
) {
  const { minPrice, maxPrice, priceStatus } = opts;
  let next = query;
  const normalizedStatus = String(priceStatus ?? "").trim().toLowerCase();
  const hasMin = Number.isFinite(minPrice) && minPrice > 0;
  const hasMax = Number.isFinite(maxPrice) && maxPrice > 0;
  const needsPositivePrice = normalizedStatus === "priced" || hasMin || hasMax;

  if (!needsPositivePrice) return next;

  next = next.not("asking_price", "is", null).gt("asking_price", 0);
  if (hasMin) next = next.gte("asking_price", minPrice);
  if (hasMax) next = next.lte("asking_price", maxPrice);
  return next;
}

function applyMaintenanceBandFilter(query: any, band: string) {
  const normalized = String(band ?? "").trim().toLowerCase();
  if (!normalized || normalized === "any") return query;
  let next = query.not("deferred_total", "is", null);
  if (normalized === "light") return next.lte("deferred_total", 25000);
  if (normalized === "moderate") return next.gt("deferred_total", 25000).lte("deferred_total", 100000);
  if (normalized === "heavy") return next.gt("deferred_total", 100000).lte("deferred_total", 250000);
  if (normalized === "severe") return next.gt("deferred_total", 250000);
  return query;
}

function applyEngineTimeFilter(query: any, value: string, table: string) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "any") return query;
  const isPublic = table === "public_listings";
  if (!isPublic) {
    if (normalized === "hashours") {
      return query.not("time_since_overhaul", "is", null);
    }
    return query;
  }
  if (normalized === "fresh") return query.gte("ev_pct_life_remaining", 0.75);
  if (normalized === "mid") return query.gte("ev_pct_life_remaining", 0.5).lt("ev_pct_life_remaining", 0.75);
  if (normalized === "approaching") return query.lt("ev_pct_life_remaining", 0.5);
  if (normalized === "hashours") return query.not("ev_hours_smoh", "is", null);
  return query;
}

function applyHelicopterExclusion(query: any) {
  let nextQuery = query;
  for (const pattern of HELICOPTER_MAKE_PATTERNS) {
    nextQuery = nextQuery.not("make", "ilike", pattern);
  }
  for (const pattern of HELICOPTER_MODEL_PATTERNS) {
    nextQuery = nextQuery.not("model", "ilike", pattern);
  }
  return nextQuery;
}

function applyCategoryFilter(query: any, categoryInput: string) {
  const category = String(categoryInput ?? "").trim().toLowerCase();
  if (!category) return applyHelicopterExclusion(query);

  if (category === "helicopter") {
    return query.or(HELICOPTER_OR);
  }

  if (category === "se_turboprop") {
    return applyHelicopterExclusion(
      query
        .or("aircraft_type.eq.turboprop,aircraft_type.is.null,aircraft_type.eq.unknown")
        .or(SE_TURBOPROP_OR)
    );
  }
  if (category === "me_turboprop") {
    return applyHelicopterExclusion(
      query
        .or("aircraft_type.eq.turboprop,aircraft_type.is.null,aircraft_type.eq.unknown")
        .or(ME_TURBOPROP_OR)
    );
  }

  const typeList = CATEGORY_PARAM_TO_DB[category as keyof typeof CATEGORY_PARAM_TO_DB];
  if (!typeList?.length) return applyHelicopterExclusion(query);

  const legacyOr =
    category === "single"
      ? SINGLE_OR
      : category === "multi"
        ? MULTI_OR
        : category === "jet"
          ? JET_OR
          : category === "lsp"
            ? LSP_OR
            : category === "sea"
              ? SEA_OR
              : null;

  const inList = typeList.join(",");
  if (!legacyOr) {
    return applyHelicopterExclusion(query);
  }
  return applyHelicopterExclusion(
    query.or(
      `aircraft_type.in.(${inList}),and(aircraft_type.is.null,or(${legacyOr})),and(aircraft_type.eq.unknown,or(${legacyOr}))`
    )
  );
}

async function runSimpleSearchListingsPage(
  supabase: ReturnType<typeof createServerClient>,
  opts: {
    parsedSearch: ParsedListingsSearch;
    sortBy: string;
    from: number;
    to: number;
    page: number;
    pageSize: number;
    ownershipType: string;
    preferDealTier: boolean;
  }
) {
  const { parsedSearch, sortBy, from, to, page, pageSize, ownershipType, preferDealTier } = opts;
  let query = supabase
    .from("aircraft_listings")
    .select(LISTINGS_PAGE_COLUMNS_AIRCRAFT)
    .eq("is_active", true);

  if (parsedSearch.makeToken) query = query.ilike("make", `%${parsedSearch.makeToken}%`);
  if (parsedSearch.modelToken) query = query.ilike("model", `%${parsedSearch.modelToken}%`);
  if (typeof parsedSearch.yearToken === "number") query = query.eq("year", parsedSearch.yearToken);
  if (parsedSearch.orClause) query = query.or(parsedSearch.orClause);

  // Always prioritize stronger deal tiers first, then apply requested sort within buckets.
  query = query.order("deal_rating", { ascending: false, nullsFirst: false });
  if (sortBy === "price_low") query = query.order("asking_price", { ascending: true, nullsFirst: false });
  else if (sortBy === "price_high") query = query.order("asking_price", { ascending: false, nullsFirst: false });
  else if (sortBy === "year_newest") query = query.order("year", { ascending: false, nullsFirst: false });
  else if (sortBy === "year_oldest") query = query.order("year", { ascending: true, nullsFirst: false });
  else if (sortBy === "market_best") query = query.order("vs_median_price", { ascending: true, nullsFirst: false });
  else if (sortBy === "market_worst") query = query.order("vs_median_price", { ascending: false, nullsFirst: false });
  else query = query.order("value_score", { ascending: false, nullsFirst: false });

  const result = await query.range(from, to);
  if (result.error) throw new Error(result.error.message);
  const enrichedRows = await attachFractionalFields(
    supabase,
    normalizeEngineValueRows(toRecordRows(result.data))
  );
  const filteredRows = applyOwnershipFilterToRows(enrichedRows, ownershipType);
  const orderedRows = applyDealTierPreference(filteredRows, preferDealTier);

  return {
    rows: orderedRows,
    total: orderedRows.length,
    page,
    pageSize,
  };
}

async function runDefaultCuratedListingsPage(
  supabase: ReturnType<typeof createServerClient>,
  opts: {
    listBaseTable: string;
    from: number;
    to: number;
    page: number;
    pageSize: number;
    ownershipType: string;
  }
) {
  const { listBaseTable, from, to, page, pageSize, ownershipType } = opts;
  const columns = columnsForListingsTable(listBaseTable);
  const candidateQuery = supabase
    .from(listBaseTable)
    .select(columns)
    .eq("is_active", true)
    .eq("deal_tier", "EXCEPTIONAL_DEAL")
    .not("primary_image_url", "is", null)
    .not("image_urls", "is", null)
    .order("deal_rating", { ascending: false, nullsFirst: false })
    .order("value_score", { ascending: false, nullsFirst: false })
    .limit(1500);

  const result = await candidateQuery;
  if (result.error) throw new Error(result.error.message);

  const enrichedRows = await attachFractionalFields(
    supabase,
    normalizeEngineValueRows(toRecordRows(result.data))
  );
  const ownershipFilteredRows = applyOwnershipFilterToRows(enrichedRows, ownershipType);
  const curatedRows = ownershipFilteredRows.filter(shouldIncludeInDefaultListings);
  const pagedRows = curatedRows.slice(from, to + 1);

  return {
    rows: pagedRows,
    total: curatedRows.length,
    page,
    pageSize,
  };
}

export async function getListingsPage(query: ListingsPageQuery = {}) {
  const page = Math.max(1, Number(query.page ?? 1));
  const pageSize = Math.max(1, Math.min(100, Number(query.pageSize ?? 24)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const q = String(query.q ?? "").trim();
  const preferDealTier = true;
  const make = String(query.make ?? "").trim();
  const model = String(query.model ?? "").trim();
  const modelFamily = String(query.modelFamily ?? "").trim();
  const subModel = String(query.subModel ?? "").trim();
  const source = String(query.source ?? "").trim();
  const state = String(query.state ?? "").trim();
  const risk = String(query.risk ?? "").trim();
  const ownershipType = String(query.ownershipType ?? "").trim().toLowerCase();
  const dealTier = String(query.dealTier ?? "").trim();
  const category = String(query.category ?? "").trim();
  const minValueScore = Number(query.minValueScore ?? 0);
  const minPrice = Number(query.minPrice ?? 0);
  const maxPrice = Number(query.maxPrice ?? 0);
  const priceStatus = String(query.priceStatus ?? "all").trim().toLowerCase();
  const yearMin = Number(query.yearMin ?? 0);
  const yearMax = Number(query.yearMax ?? 0);
  const totalTimeMin = Number(query.totalTimeMin ?? 0);
  const totalTimeMax = Number(query.totalTimeMax ?? 0);
  const maintenanceBand = String(query.maintenanceBand ?? "any").trim().toLowerCase();
  const engineTime = String(query.engineTime ?? "any").trim().toLowerCase();
  const trueCostMin = Number(query.trueCostMin ?? 0);
  const trueCostMax = Number(query.trueCostMax ?? 0);
  const sortBy = String(query.sortBy ?? "value_desc");
  const requestedOwnershipType = ownershipType === "fractional" || ownershipType === "full";
  const listBaseTable =
    requestedOwnershipType
      ? "aircraft_listings"
      : "public_listings";
  const listBaseColumns = columnsForListingsTable(listBaseTable);
  const supabase = createReadServerClient();

  if (isDefaultListingsLandingQuery(query)) {
    const curatedBases = requestedOwnershipType
      ? (["aircraft_listings"] as const)
      : (["aircraft_listings", "public_listings"] as const);
    let lastError: unknown = null;
    for (const base of curatedBases) {
      try {
        return await runDefaultCuratedListingsPage(supabase, {
          listBaseTable: base,
          from,
          to,
          page,
          pageSize,
          ownershipType,
        });
      } catch (error) {
        lastError = error;
        const message = String(error instanceof Error ? error.message : "").toLowerCase();
        const aircraftDenied =
          message.includes("permission denied") ||
          message.includes("row-level security") ||
          message.includes("rls");
        if (base === "aircraft_listings" && aircraftDenied) {
          continue;
        }
        if (requestedOwnershipType && message.includes("permission denied") && message.includes("aircraft_listings")) {
          return getListingsPage({ ...query, ownershipType: "all" });
        }
        throw error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "default listings load failed"));
  }

  let dbQuery = supabase
    .from(listBaseTable)
    .select(listBaseColumns)
    .eq("is_active", true);

  const parsedSearch = parseListingsSearch(q);

  if (isSimpleSearchOnlyQuery(query)) {
    try {
      return await runSimpleSearchListingsPage(supabase, {
        parsedSearch,
        sortBy,
        from,
        to,
        page,
        pageSize,
        ownershipType,
        preferDealTier,
      });
    } catch {
      // Fall through to standard public_listings query pipeline.
    }
  }

  if (parsedSearch.makeToken) dbQuery = dbQuery.ilike("make", `%${parsedSearch.makeToken}%`);
  if (parsedSearch.modelToken) dbQuery = dbQuery.ilike("model", `%${parsedSearch.modelToken}%`);
  if (typeof parsedSearch.yearToken === "number") dbQuery = dbQuery.eq("year", parsedSearch.yearToken);
  if (parsedSearch.orClause) dbQuery = dbQuery.or(parsedSearch.orClause);
  if (make) dbQuery = dbQuery.ilike("make", `%${make}%`);
  if (subModel) dbQuery = dbQuery.ilike("model", subModel);
  else if (modelFamily) dbQuery = dbQuery.ilike("model", `%${modelFamily}%`);
  else if (model) dbQuery = dbQuery.ilike("model", `%${model}%`);
  dbQuery = applySourceFilter(dbQuery, source, listBaseTable === "aircraft_listings");
  if (state) dbQuery = dbQuery.eq("location_state", state.toUpperCase());
  if (risk) dbQuery = dbQuery.eq("risk_level", risk.toUpperCase());
  if (dealTier === "TOP_DEALS") dbQuery = dbQuery.or("deal_tier.eq.EXCEPTIONAL_DEAL,deal_tier.eq.GOOD_DEAL");
  else if (dealTier) dbQuery = dbQuery.eq("deal_tier", dealTier.toUpperCase());
  if (Number.isFinite(minValueScore) && minValueScore > 0) dbQuery = dbQuery.gte("value_score", minValueScore);
  dbQuery = applyPriceFilters(dbQuery, { minPrice, maxPrice, priceStatus });
  dbQuery = applyPositiveNumericRange(dbQuery, "year", yearMin, yearMax);
  dbQuery = applyPositiveNumericRange(dbQuery, "total_time_airframe", totalTimeMin, totalTimeMax);
  dbQuery = applyMaintenanceBandFilter(dbQuery, maintenanceBand);
  dbQuery = applyEngineTimeFilter(dbQuery, engineTime, listBaseTable);
  dbQuery = applyPositiveNumericRange(dbQuery, "true_cost", trueCostMin, trueCostMax);
  dbQuery = applyCategoryFilter(dbQuery, category);

  dbQuery = dbQuery.order("deal_rating", { ascending: false, nullsFirst: false });
  if (sortBy === "value_desc") dbQuery = dbQuery.order("value_score", { ascending: false, nullsFirst: false });
  else if (sortBy === "value_asc") dbQuery = dbQuery.order("value_score", { ascending: true, nullsFirst: false });
  else if (sortBy === "price_low") dbQuery = dbQuery.order("asking_price", { ascending: true, nullsFirst: false });
  else if (sortBy === "price_high") dbQuery = dbQuery.order("asking_price", { ascending: false, nullsFirst: false });
  else if (sortBy === "market_best") dbQuery = dbQuery.order("vs_median_price", { ascending: true, nullsFirst: false });
  else if (sortBy === "market_worst") dbQuery = dbQuery.order("vs_median_price", { ascending: false, nullsFirst: false });
  else if (sortBy === "risk_low") dbQuery = dbQuery.order("risk_level", { ascending: false, nullsFirst: false });
  else if (sortBy === "risk_high") dbQuery = dbQuery.order("risk_level", { ascending: true, nullsFirst: false });
  else if (sortBy === "deferred_low") dbQuery = dbQuery.order("deferred_total", { ascending: true, nullsFirst: false });
  else if (sortBy === "deferred_high") dbQuery = dbQuery.order("deferred_total", { ascending: false, nullsFirst: false });
  else if (sortBy === "tt_low") dbQuery = dbQuery.order("total_time_airframe", { ascending: true, nullsFirst: false });
  else if (sortBy === "tt_high") dbQuery = dbQuery.order("total_time_airframe", { ascending: false, nullsFirst: false });
  else if (sortBy === "year_newest") dbQuery = dbQuery.order("year", { ascending: false, nullsFirst: false });
  else if (sortBy === "year_oldest") dbQuery = dbQuery.order("year", { ascending: true, nullsFirst: false });
  else if (sortBy === "engine_life" && listBaseTable === "public_listings") {
    dbQuery = dbQuery.order("ev_pct_life_remaining", { ascending: false, nullsFirst: false });
  }
  else if (sortBy === "deal_desc") dbQuery = dbQuery.order("value_score", { ascending: false, nullsFirst: false });
  else dbQuery = dbQuery.order("value_score", { ascending: false, nullsFirst: false });

  dbQuery = dbQuery.range(from, to);
  let result = await dbQuery;
  if (result.error && isTransientSupabaseUpstreamFailure(result.error.message)) {
    let fallbackQuery = supabase
      .from(listBaseTable)
      .select(listBaseColumns)
      .eq("is_active", true);
    if (parsedSearch.makeToken) fallbackQuery = fallbackQuery.ilike("make", `%${parsedSearch.makeToken}%`);
    if (parsedSearch.modelToken) fallbackQuery = fallbackQuery.ilike("model", `%${parsedSearch.modelToken}%`);
    if (typeof parsedSearch.yearToken === "number") fallbackQuery = fallbackQuery.eq("year", parsedSearch.yearToken);
    if (parsedSearch.orClause) fallbackQuery = fallbackQuery.or(parsedSearch.orClause);
    if (make) fallbackQuery = fallbackQuery.ilike("make", `%${make}%`);
    if (subModel) fallbackQuery = fallbackQuery.ilike("model", subModel);
    else if (modelFamily) fallbackQuery = fallbackQuery.ilike("model", `%${modelFamily}%`);
    else if (model) fallbackQuery = fallbackQuery.ilike("model", `%${model}%`);
    fallbackQuery = applySourceFilter(fallbackQuery, source, listBaseTable === "aircraft_listings");
    if (state) fallbackQuery = fallbackQuery.eq("location_state", state.toUpperCase());
    if (risk) fallbackQuery = fallbackQuery.eq("risk_level", risk.toUpperCase());
    if (dealTier === "TOP_DEALS") fallbackQuery = fallbackQuery.or("deal_tier.eq.EXCEPTIONAL_DEAL,deal_tier.eq.GOOD_DEAL");
    else if (dealTier) fallbackQuery = fallbackQuery.eq("deal_tier", dealTier.toUpperCase());
    if (Number.isFinite(minValueScore) && minValueScore > 0) fallbackQuery = fallbackQuery.gte("value_score", minValueScore);
    fallbackQuery = applyPriceFilters(fallbackQuery, { minPrice, maxPrice, priceStatus });
    fallbackQuery = applyPositiveNumericRange(fallbackQuery, "year", yearMin, yearMax);
    fallbackQuery = applyPositiveNumericRange(fallbackQuery, "total_time_airframe", totalTimeMin, totalTimeMax);
    fallbackQuery = applyMaintenanceBandFilter(fallbackQuery, maintenanceBand);
    fallbackQuery = applyEngineTimeFilter(fallbackQuery, engineTime, listBaseTable);
    fallbackQuery = applyPositiveNumericRange(fallbackQuery, "true_cost", trueCostMin, trueCostMax);
    fallbackQuery = applyCategoryFilter(fallbackQuery, category);
    fallbackQuery = fallbackQuery
      .order("deal_rating", { ascending: false, nullsFirst: false })
      .order("value_score", { ascending: false, nullsFirst: false });
    result = await fallbackQuery.range(from, to);
  }
  if (result.error && isTransientSupabaseUpstreamFailure(result.error.message) && q) {
    // Last-resort fallback: keep search responsive on hot terms.
    const emergencyQuery = supabase
      .from(listBaseTable)
      .select(listBaseColumns)
      .eq("is_active", true)
      .or(`make.ilike.%${q}%,model.ilike.%${q}%`)
      .order("deal_rating", { ascending: false, nullsFirst: false })
      .range(from, to)
      .order("value_score", { ascending: false, nullsFirst: false });
    const emergencyResult = await emergencyQuery;
    if (!emergencyResult.error) {
      result = emergencyResult;
    }
  }
  if (result.error) {
    const permissionDenied =
      String(result.error.message).toLowerCase().includes("permission denied") &&
      String(result.error.message).toLowerCase().includes("aircraft_listings");
    if (permissionDenied && requestedOwnershipType) {
      return getListingsPage({ ...query, ownershipType: "all" });
    }
    const transientFailure = isTransientSupabaseUpstreamFailure(result.error.message);
    if (transientFailure) {
      if (q) {
        let tableFallback = supabase
          .from("aircraft_listings")
          .select(LISTINGS_PAGE_COLUMNS_AIRCRAFT)
          .eq("is_active", true);

        if (parsedSearch.makeToken) tableFallback = tableFallback.ilike("make", `%${parsedSearch.makeToken}%`);
        if (parsedSearch.modelToken) tableFallback = tableFallback.ilike("model", `%${parsedSearch.modelToken}%`);
        if (typeof parsedSearch.yearToken === "number") tableFallback = tableFallback.eq("year", parsedSearch.yearToken);
        if (parsedSearch.orClause) tableFallback = tableFallback.or(parsedSearch.orClause);

        const tableResult = await tableFallback
          .order("deal_rating", { ascending: false, nullsFirst: false })
          .order("value_score", { ascending: false, nullsFirst: false })
          .range(from, to);

        if (!tableResult.error) {
          const enrichedTableRows = await attachFractionalFields(
            supabase,
            normalizeEngineValueRows(toRecordRows(tableResult.data))
          );
          const filteredTableRows = applyOwnershipFilterToRows(enrichedTableRows, ownershipType);
          const orderedTableRows = applyDealTierPreference(filteredTableRows, preferDealTier);
          return {
            rows: orderedTableRows,
            total: orderedTableRows.length,
            page,
            pageSize,
          };
        }
      }

      return {
        rows: [],
        total: 0,
        page,
        pageSize,
      };
    }
    throw new Error(result.error.message);
  }

  let total = result.data?.length ?? 0;
  try {
    let countQuery = supabase.from(listBaseTable).select("id", { count: "exact", head: true }).eq("is_active", true);
    if (parsedSearch.makeToken) countQuery = countQuery.ilike("make", `%${parsedSearch.makeToken}%`);
    if (parsedSearch.modelToken) countQuery = countQuery.ilike("model", `%${parsedSearch.modelToken}%`);
    if (typeof parsedSearch.yearToken === "number") countQuery = countQuery.eq("year", parsedSearch.yearToken);
    if (parsedSearch.orClause) countQuery = countQuery.or(parsedSearch.orClause);
    if (make) countQuery = countQuery.ilike("make", `%${make}%`);
    if (subModel) countQuery = countQuery.ilike("model", subModel);
    else if (modelFamily) countQuery = countQuery.ilike("model", `%${modelFamily}%`);
    else if (model) countQuery = countQuery.ilike("model", `%${model}%`);
    countQuery = applySourceFilter(countQuery, source, listBaseTable === "aircraft_listings");
    if (state) countQuery = countQuery.eq("location_state", state.toUpperCase());
    if (risk) countQuery = countQuery.eq("risk_level", risk.toUpperCase());
    if (dealTier === "TOP_DEALS") countQuery = countQuery.or("deal_tier.eq.EXCEPTIONAL_DEAL,deal_tier.eq.GOOD_DEAL");
    else if (dealTier) countQuery = countQuery.eq("deal_tier", dealTier.toUpperCase());
    if (Number.isFinite(minValueScore) && minValueScore > 0) countQuery = countQuery.gte("value_score", minValueScore);
    countQuery = applyPriceFilters(countQuery, { minPrice, maxPrice, priceStatus });
    countQuery = applyPositiveNumericRange(countQuery, "year", yearMin, yearMax);
    countQuery = applyPositiveNumericRange(countQuery, "total_time_airframe", totalTimeMin, totalTimeMax);
    countQuery = applyMaintenanceBandFilter(countQuery, maintenanceBand);
    countQuery = applyEngineTimeFilter(countQuery, engineTime, listBaseTable);
    countQuery = applyPositiveNumericRange(countQuery, "true_cost", trueCostMin, trueCostMax);
    countQuery = applyCategoryFilter(countQuery, category);
    const countResult = await countQuery;
    if (!countResult.error && typeof countResult.count === "number") {
      total = countResult.count;
    }
  } catch {
    // Ignore count failures and fall back to current page length.
  }

  const enrichedRows = await attachFractionalFields(
    supabase,
    normalizeEngineValueRows(toRecordRows(result.data))
  );
  const filteredRows = applyOwnershipFilterToRows(enrichedRows, ownershipType);
  const orderedRows = applyDealTierPreference(filteredRows, preferDealTier);
  if (ownershipType === "fractional" || ownershipType === "full") {
    total = orderedRows.length;
  }
  return {
    rows: orderedRows,
    total,
    page,
    pageSize,
  };
}

/**
 * Full filter-options payload for UI + /api/listings/options.
 * Prefers DB RPC `get_listing_filter_options_payload` (set-based); falls back to chunked reads if RPC is missing or fails.
 */
export async function getListingFilterOptionsClientPayload(): Promise<ListingsFilterOptionsClientShape> {
  const supabase = createReadServerClient();
  const { data, error } = await supabase.rpc("get_listing_filter_options_payload");
  if (!error && data != null) {
    const parsed = parseListingFilterOptionsRpcPayload(data);
    if (parsed) return parsed;
  }
  const rows = await fetchListingFilterOptionsRowsChunked();
  return aggregateListingFilterOptionsFromRows(
    rows.map((row) => ({
      make: row.make,
      model: row.model,
      state: row.state,
      source: row.source,
      dealTier: row.dealTier,
      valueScore: row.valueScore,
    }))
  );
}

/** @deprecated Prefer getListingFilterOptionsClientPayload — avoids shipping raw rows. */
export async function getListingFilterOptions(): Promise<ListingFilterOption[]> {
  return fetchListingFilterOptionsRowsChunked();
}

function isAircraftListingsAccessDenied(message: string): boolean {
  const m = message.toLowerCase();
  return (
    (m.includes("permission denied") && m.includes("aircraft_listings")) ||
    m.includes("row-level security") ||
    (m.includes("aircraft_listings") && m.includes("policy"))
  );
}

async function fetchListingFilterOptionsRowsChunked(): Promise<ListingFilterOption[]> {
  const supabase = createReadServerClient();
  const tables = ["aircraft_listings", "public_listings"] as const;
  let lastError: Error | null = null;

  for (const table of tables) {
    const chunkSizes = [2000, 1000, 500];
    const maxRows = 50000;
    const selectColumns =
      table === "aircraft_listings"
        ? "make,model,location_state,state,source,source_site,deal_tier,value_score"
        : "make,model,location_state,source,deal_tier,value_score";

    for (const chunkSize of chunkSizes) {
      const allRows: Array<Record<string, unknown>> = [];

      try {
        for (let offset = 0; offset < maxRows; offset += chunkSize) {
          const result = await supabase
            .from(table)
            .select(selectColumns)
            .eq("is_active", true)
            .order("id", { ascending: true })
            .range(offset, offset + chunkSize - 1);

          if (result.error) {
            throw new Error(result.error.message);
          }

          const rows = (result.data ?? []) as unknown as Record<string, unknown>[];
          if (rows.length === 0) break;
          allRows.push(...rows);
          if (rows.length < chunkSize) break;
        }

        return allRows.map((row) => ({
          make: (row.make as string | null | undefined) ?? null,
          model: (row.model as string | null | undefined) ?? null,
          state:
            table === "aircraft_listings"
              ? ((row.location_state ?? row.state) as string | null | undefined) ?? null
              : ((row.location_state as string | null | undefined) ?? null),
          source:
            table === "aircraft_listings"
              ? ((row.source ?? row.source_site) as string | null | undefined) ?? null
              : ((row.source as string | null | undefined) ?? null),
          dealTier: (row.deal_tier as string | null | undefined) ?? null,
          valueScore:
            typeof row.value_score === "number"
              ? row.value_score
              : toNumericOrNull(row.value_score),
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? "");
        if (table === "aircraft_listings" && isAircraftListingsAccessDenied(message)) {
          lastError = new Error(message);
          break;
        }
        if (!isTransientSupabaseUpstreamFailure(message)) throw new Error(message);
        lastError = new Error(message);
      }
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error("getListingFilterOptions: exhausted retries without a successful read");
}

async function fetchDefaultListingsHomeUncached(): Promise<{
  rows: Record<string, unknown>[];
  total: number;
  filterOptions: ListingsFilterOptionsClientShape;
}> {
  const query: ListingsPageQuery = {
    page: 1,
    pageSize: 24,
    sortBy: "deal_desc",
    q: "",
    make: "",
    model: "",
    modelFamily: "",
    subModel: "",
    source: "",
    state: "",
    risk: "",
    dealTier: "",
    minValueScore: 0,
    minPrice: 0,
    maxPrice: 0,
    priceStatus: "all",
    yearMin: 0,
    yearMax: 0,
    totalTimeMin: 0,
    totalTimeMax: 0,
    maintenanceBand: "any",
    engineTime: "any",
    trueCostMin: 0,
    trueCostMax: 0,
    category: "",
  };
  const [pageResult, filterOptions] = await Promise.all([
    getListingsPage(query),
    getListingFilterOptionsClientPayload(),
  ]);
  return { rows: pageResult.rows, total: pageResult.total, filterOptions };
}

const getCachedDefaultListingsHome = unstable_cache(fetchDefaultListingsHomeUncached, ["listings-default-home-v1"], {
  revalidate: 90,
  tags: ["listings-default"],
});

/**
 * Cached first paint for the common case: /listings page 1, 24 rows, deal_desc, no filters.
 * Call only when URL-derived query matches `isDefaultListingsLandingQuery` and sort/page/size match.
 */
export async function loadCachedDefaultListingsHomeIfEligible(
  query: ListingsPageQuery,
  resolved: { page: number; pageSize: number; sortBy: string }
): Promise<{ rows: Record<string, unknown>[]; total: number; filterOptions: ListingsFilterOptionsClientShape } | null> {
  if (!isDefaultListingsLandingQuery(query)) return null;
  if (resolved.page !== 1 || resolved.pageSize !== 24 || resolved.sortBy !== "deal_desc") return null;
  return getCachedDefaultListingsHome();
}

export async function getListingById(id: string) {
  const supabase = createServerClient();
  const byId = await supabase
    .from("public_listings")
    .select("*")
    .eq("id", id)
    .limit(1);

  if (byId.error) throw new Error(byId.error.message);
  if ((byId.data ?? []).length > 0) return byId.data![0];

  const bySource = await supabase
    .from("public_listings")
    .select("*")
    .eq("source_id", id)
    .limit(1);
  if (bySource.error) throw new Error(bySource.error.message);
  return (bySource.data ?? [null])[0];
}

export async function getComparableListings(
  make: string,
  model: string,
  maxPrice?: number,
  opts: { minYear?: number; maxYear?: number; excludeId?: string; limit?: number } = {}
) {
  const supabase = createServerClient();
  const { minYear, maxYear, excludeId, limit = 20 } = opts;
  let query = supabase
    .from("public_listings")
    .select("*")
    .eq("make", make)
    .eq("model", model)
    .eq("is_active", true)
    .limit(limit);

  if (typeof minYear === "number") query = query.gte("year", minYear);
  if (typeof maxYear === "number") query = query.lte("year", maxYear);
  if (typeof maxPrice === "number") query = query.lte("asking_price", maxPrice);
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  const rows = result.data ?? [];
  if (!excludeId) return rows;
  return rows.filter((row) => row?.id !== excludeId && row?.source_id !== excludeId);
}

export async function getComparableListingsByModelFamily(
  make: string,
  modelFamily: string,
  maxPrice?: number,
  opts: { minYear?: number; maxYear?: number; excludeId?: string; limit?: number } = {}
) {
  const supabase = createServerClient();
  const { minYear, maxYear, excludeId, limit = 20 } = opts;
  let query = supabase
    .from("public_listings")
    .select("*")
    .eq("make", make)
    .ilike("model", `${modelFamily}%`)
    .eq("is_active", true)
    .limit(limit);

  if (typeof minYear === "number") query = query.gte("year", minYear);
  if (typeof maxYear === "number") query = query.lte("year", maxYear);
  if (typeof maxPrice === "number") query = query.lte("asking_price", maxPrice);
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  const rows = result.data ?? [];
  if (!excludeId) return rows;
  return rows.filter((row) => row?.id !== excludeId && row?.source_id !== excludeId);
}

export async function getComparableListingsByCategory(
  make: string,
  category: string,
  maxPrice?: number,
  opts: { excludeId?: string; limit?: number } = {}
) {
  const supabase = createServerClient();
  const { excludeId, limit = 20 } = opts;
  let query = supabase
    .from("public_listings")
    .select("*")
    .eq("make", make)
    .eq("aircraft_category", category)
    .eq("is_active", true)
    .limit(limit);
  if (typeof maxPrice === "number") query = query.lte("asking_price", maxPrice);

  const result = await query;
  if (result.error) throw new Error(result.error.message);
  const rows = result.data ?? [];
  if (!excludeId) return rows;
  return rows.filter((row) => row?.id !== excludeId && row?.source_id !== excludeId);
}

export async function getListingWithFaaSnapshot(id: string) {
  const listing = await getListingById(id);
  if (!listing) return null;

  const nNumber =
    typeof listing.n_number === "string" ? listing.n_number.trim() : "";
  if (!nNumber) return listing;

  const supabase = createServerClient();
  const snapshot = await supabase.rpc("get_faa_snapshot", {
    n_number_input: nNumber,
  });
  if (snapshot.error) return listing;
  const row = Array.isArray(snapshot.data) ? snapshot.data[0] : null;
  if (!row) return listing;

  return { ...listing, ...row };
}

export type RecentOwnershipChange = {
  id: string;
  n_number: string | null;
  listing_id: string | null;
  old_owner: string | null;
  new_owner: string | null;
  old_cert_date: string | null;
  new_cert_date: string | null;
  detected_at: string | null;
  asking_price_at_detection: number | null;
  estimated_sale_price: number | null;
  estimation_method: string | null;
  notes: string | null;
  listing?: {
    id: string;
    make: string | null;
    model: string | null;
    year: number | null;
    days_on_market: number | null;
  } | null;
};

export type InternalDealSignal = {
  id: string;
  normalized_engine_value: number | null;
  sold_engine_median_price: number | null;
  engine_remaining_time_factor: number | null;
  avionics_bundle_multiplier: number | null;
  avionics_bundle_adjusted_value: number | null;
  estimated_component_value: number | null;
  component_gap_value: number | null;
  flip_candidate_triggered: boolean | null;
  flip_candidate_threshold: number | null;
};

export async function getRecentOwnershipChanges(opts: { days?: number; limit?: number } = {}): Promise<RecentOwnershipChange[]> {
  const supabase = createPrivilegedServerClient();
  const days = Math.max(1, Math.min(365, Number(opts.days ?? 30)));
  const limit = Math.max(1, Math.min(500, Number(opts.limit ?? 50)));

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const base = await supabase
    .from("detected_ownership_changes")
    .select(
      "id,n_number,listing_id,old_owner,new_owner,old_cert_date,new_cert_date,detected_at,asking_price_at_detection,estimated_sale_price,estimation_method,notes"
    )
    .gte("detected_at", cutoff)
    .order("detected_at", { ascending: false })
    .limit(limit);

  if (base.error) throw new Error(base.error.message);
  const rows = (base.data ?? []) as RecentOwnershipChange[];
  const listingIds = Array.from(
    new Set(
      rows
        .map((row) => row.listing_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  );
  if (listingIds.length === 0) return rows;

  const listingMap = new Map<string, RecentOwnershipChange["listing"]>();
  const chunkSize = 200;
  for (let i = 0; i < listingIds.length; i += chunkSize) {
    const chunk = listingIds.slice(i, i + chunkSize);
    const listingResult = await supabase
      .from("aircraft_listings")
      .select("id,make,model,year,days_on_market")
      .in("id", chunk);
    if (listingResult.error) throw new Error(listingResult.error.message);
    for (const listing of listingResult.data ?? []) {
      listingMap.set(String(listing.id), {
        id: String(listing.id),
        make: listing.make ?? null,
        model: listing.model ?? null,
        year: listing.year ?? null,
        days_on_market: listing.days_on_market ?? null,
      });
    }
  }

  return rows.map((row) => ({
    ...row,
    listing: row.listing_id ? listingMap.get(row.listing_id) ?? null : null,
  }));
}

export async function getInternalDealSignals(ids: string[]): Promise<InternalDealSignal[]> {
  const supabase = createPrivilegedServerClient();
  const uniqueIds = Array.from(new Set(ids.map((id) => String(id || "").trim()).filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const rows: InternalDealSignal[] = [];
  const chunkSize = 200;
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    const result = await supabase
      .from("aircraft_listings")
      .select(
        "id,normalized_engine_value,sold_engine_median_price,engine_remaining_time_factor,avionics_bundle_multiplier,avionics_bundle_adjusted_value,estimated_component_value,component_gap_value,flip_candidate_triggered,flip_candidate_threshold"
      )
      .in("id", chunk);
    if (result.error) throw new Error(result.error.message);

    for (const row of result.data ?? []) {
      rows.push({
        id: String(row.id),
        normalized_engine_value: row.normalized_engine_value ?? null,
        sold_engine_median_price: row.sold_engine_median_price ?? null,
        engine_remaining_time_factor: row.engine_remaining_time_factor ?? null,
        avionics_bundle_multiplier: row.avionics_bundle_multiplier ?? null,
        avionics_bundle_adjusted_value: row.avionics_bundle_adjusted_value ?? null,
        estimated_component_value: row.estimated_component_value ?? null,
        component_gap_value: row.component_gap_value ?? null,
        flip_candidate_triggered: row.flip_candidate_triggered ?? null,
        flip_candidate_threshold: row.flip_candidate_threshold ?? null,
      });
    }
  }

  return rows;
}

