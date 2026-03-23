import type { ListingsPageQuery } from "../db/listingsRepository";

type FlatParams = Record<string, string>;

function num(raw: string | undefined, fallback = 0): number {
  const value = Number(raw ?? "");
  if (!Number.isFinite(value)) return fallback;
  const n = Math.floor(value);
  return n > 0 ? n : fallback;
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
    yearMin: num(search.minYear, 0) || num(search.yearMin, 0),
    yearMax: num(search.maxYear, 0) || num(search.yearMax, 0),
    totalTimeMin: num(search.minTTAF, 0) || num(search.totalTimeMin, 0),
    totalTimeMax: num(search.maxTTAF, 0) || num(search.totalTimeMax, 0),
    maintenanceBand: maintenanceBand as ListingsPageQuery["maintenanceBand"],
    engineTime: engineTime as ListingsPageQuery["engineTime"],
    trueCostMin: num(search.trueCostMin, 0),
    trueCostMax: num(search.trueCostMax, 0),
    sortBy: search.sortBy ?? "deal_desc",
    category: search.category ?? "",
    ownershipType: overrides?.ownershipType ?? ownershipType,
    priceReducedOnly: String(search.priceDropOnly ?? "").toLowerCase() === "true",
    addedToday: String(search.addedToday ?? "").toLowerCase() === "true",
    location: search.location ?? "",
    minEngineScore: num(search.minEngine, 0),
    minAvionicsScore: num(search.minAvionics, 0),
    minQualityScore: num(search.minQuality, 0),
    minMarketValueScore: num(search.minValue, 0),
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
