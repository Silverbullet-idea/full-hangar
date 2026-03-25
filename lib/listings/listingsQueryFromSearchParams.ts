import type { ListingsPageQuery } from "../db/listingsRepository";

type FlatParams = Record<string, string>;

/** App Router page `searchParams` shape (or compatible). */
export type RequestSearchParams = Record<string, string | string[] | undefined>;

export function parseSearchParamValue(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Flatten `searchParams` for listings URL → query parsing.
 * Handles plain objects and `URLSearchParams` (some runtimes / tooling pass the latter).
 */
export function toFlatSearchParamsRecord(
  searchParams?: RequestSearchParams | URLSearchParams | null
): Record<string, string> {
  if (searchParams == null) return {};
  if (typeof URLSearchParams !== "undefined" && searchParams instanceof URLSearchParams) {
    const acc: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      if (!(key in acc)) acc[key] = value.trim();
    });
    return acc;
  }
  const rec = searchParams as RequestSearchParams;
  return Object.keys(rec).reduce<Record<string, string>>((out, key) => {
    out[key] = parseSearchParamValue(rec[key]);
    return out;
  }, {});
}

/**
 * Positive integer-ish params from the query string.
 * `Number("2025?")` is NaN (common when URLs pick up a stray `?`); `parseInt` still reads the prefix.
 */
function num(raw: string | undefined, fallback = 0): number {
  const s = String(raw ?? "").trim();
  if (!s) return fallback;
  const asNumber = Number(s);
  if (Number.isFinite(asNumber)) {
    const n = Math.floor(asNumber);
    return n > 0 ? n : fallback;
  }
  const asInt = parseInt(s, 10);
  if (Number.isFinite(asInt) && asInt > 0) return asInt;
  return fallback;
}

/** Maps UI `dealScore` URL param to value_score bounds (max 0 = no upper cap). */
export function dealScoreToBounds(dealScoreRaw: string): { min: number; max: number } {
  const v = dealScoreRaw.trim().toLowerCase();
  if (v === "exceptional") return { min: 78, max: 0 };
  if (v === "strong") return { min: 65, max: 77 };
  if (v === "good") return { min: 50, max: 64 };
  return { min: 0, max: 0 };
}

export function buildListingsPageQueryFromFlatParams(
  search: FlatParams,
  overrides?: { ownershipType?: "all" | "full" | "fractional" }
): ListingsPageQuery {
  const ownershipTypeRaw = (search.ownershipType ?? "all").toLowerCase();
  const ownershipType =
    ownershipTypeRaw === "fractional" || ownershipTypeRaw === "full" || ownershipTypeRaw === "all"
      ? ownershipTypeRaw
      : "all";
  const ds = dealScoreToBounds(search.dealScore ?? "");
  const minFromUrl = num(search.minValueScore, 0);
  const maxFromUrl = num(search.maxValueScore, 0);
  const minValueScore = ds.min > 0 ? ds.min : minFromUrl;
  const maxValueScore = ds.max > 0 ? ds.max : maxFromUrl;
  const hideUndisclosed = String(search.hidePriceUndisclosed ?? "").toLowerCase() === "true";
  const priceStatusRaw = String(search.priceStatus ?? "all").toLowerCase();
  const priceStatus: "all" | "priced" = hideUndisclosed || priceStatusRaw === "priced" ? "priced" : "all";

  const mb = String(search.maintenanceBand ?? "any").toLowerCase();
  const maintenanceBand =
    mb === "light" || mb === "moderate" || mb === "heavy" || mb === "severe" ? mb : "any";
  const et = String(search.engineTime ?? "any").toLowerCase();
  const engineTime =
    et === "fresh" || et === "mid" || et === "approaching"
      ? et
      : et === "hashours"
        ? "hasHours"
        : "any";

  let yearMin = num(search.minYear, 0) || num(search.yearMin, 0) || num(search.fromYear, 0);
  let yearMax = num(search.maxYear, 0) || num(search.yearMax, 0) || num(search.toYear, 0);
  if (yearMin > 0 && yearMax > 0 && yearMin > yearMax) {
    const t = yearMin;
    yearMin = yearMax;
    yearMax = t;
  }

  return {
    page: num(search.page, 0) || 1,
    pageSize: Math.min(48, Math.max(12, num(search.pageSize, 0) || 24)),
    q: search.q ?? "",
    make: search.make ?? "",
    model: search.model ?? "",
    modelFamily: search.modelFamily ?? "",
    subModel: search.subModel ?? "",
    source: search.source ?? "",
    state: search.state ?? "",
    risk: search.risk ?? "",
    dealTier: ds.min > 0 ? "" : (search.dealTier ?? ""),
    minValueScore,
    maxValueScore,
    minPrice: num(search.minPrice, 0),
    maxPrice: num(search.maxPrice, 0),
    priceStatus,
    yearMin,
    yearMax,
    totalTimeMin:
      num(search.minTTAF, 0) ||
      num(search.totalTimeMin, 0) ||
      num(search.minTT, 0) ||
      num(search.ttMin, 0),
    totalTimeMax:
      num(search.maxTTAF, 0) ||
      num(search.totalTimeMax, 0) ||
      num(search.maxTT, 0) ||
      num(search.ttMax, 0),
    maintenanceBand: maintenanceBand as ListingsPageQuery["maintenanceBand"],
    engineTime: engineTime as ListingsPageQuery["engineTime"],
    trueCostMin: num(search.trueCostMin, 0),
    trueCostMax: num(search.trueCostMax, 0),
    sortBy: search.sortBy ?? "flip_desc",
    category: search.category ?? "",
    ownershipType: overrides?.ownershipType ?? ownershipType,
    priceReducedOnly: String(search.priceDropOnly ?? "").toLowerCase() === "true",
    addedToday: String(search.addedToday ?? "").toLowerCase() === "true",
    location: search.location ?? "",
    minEngineScore: num(search.minEngine, 0) || num(search.minEngineScore, 0),
    minAvionicsScore: num(search.minAvionics, 0) || num(search.minAvionicsScore, 0),
    minQualityScore: num(search.minQuality, 0) || num(search.minQualityScore, 0) || num(search.minCondition, 0),
    minMarketValueScore:
      num(search.minValue, 0) ||
      num(search.minMarket, 0) ||
      num(search.minMarketScore, 0) ||
      num(search.minMkt, 0),
    engineLife: search.engineLife ?? "",
    avionics: search.avionics ?? "",
    dealPattern: search.dealPattern ?? "",
  };
}

/** Comma / plus separated facet tokens (lowercased), for URL ↔ UI sync. */
export function parseListingFacetTokens(raw: string): string[] {
  return String(raw ?? "")
    .split(/[,+]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
