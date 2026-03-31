/**
 * Saved search `filters` JSON (column `saved_searches.filters`) ↔ `/listings` query string.
 * Versioned so we can migrate if URL vocabulary changes.
 */

import type { ListingsPageQuery } from "../db/listingsRepository"
import { buildListingsPageQueryFromFlatParams, toFlatSearchParamsRecord } from "./listingsQueryFromSearchParams"

export const SAVED_LISTINGS_FILTERS_VERSION = 1 as const

export type SavedListingsFiltersV1 = {
  v: typeof SAVED_LISTINGS_FILTERS_VERSION
  /** Subset of listings URL params (no `page` — reopen at page 1). */
  params: Record<string, string>
}

/** Keys understood by `buildListingsPageQueryFromFlatParams` / listings UI (omit `page`). */
export const LISTINGS_SAVED_SEARCH_PARAM_KEYS = [
  "q",
  "category",
  "make",
  "model",
  "modelFamily",
  "subModel",
  "source",
  "state",
  "risk",
  "dealTier",
  "dealScore",
  "minValueScore",
  "maxValueScore",
  "minPrice",
  "maxPrice",
  "priceStatus",
  "hidePriceUndisclosed",
  "yearMin",
  "yearMax",
  "minYear",
  "maxYear",
  "fromYear",
  "toYear",
  "totalTimeMin",
  "totalTimeMax",
  "minTTAF",
  "maxTTAF",
  "minTT",
  "maxTT",
  "ttMin",
  "ttMax",
  "maintenanceBand",
  "engineTime",
  "trueCostMin",
  "trueCostMax",
  "sortBy",
  "ownershipType",
  "priceDropOnly",
  "addedToday",
  "location",
  "minEngine",
  "minAvionics",
  "minQuality",
  "minValue",
  "minEngineScore",
  "minAvionicsScore",
  "minQualityScore",
  "minMarket",
  "minMkt",
  "minCondition",
  "engineLife",
  "avionics",
  "dealPattern",
  "pageSize",
] as const

type SearchParamsLike = { get(name: string): string | null }

export function buildSavedListingsFiltersFromSearchParams(sp: SearchParamsLike): SavedListingsFiltersV1 {
  const params: Record<string, string> = {}
  for (const key of LISTINGS_SAVED_SEARCH_PARAM_KEYS) {
    const v = sp.get(key)
    if (v != null && v !== "") params[key] = v
  }
  return { v: SAVED_LISTINGS_FILTERS_VERSION, params }
}

/** Build query string for `/listings?…` (no leading `?`). */
export function savedListingsFiltersToQueryString(filters: unknown): string {
  if (filters && typeof filters === "object" && filters !== null) {
    const o = filters as Record<string, unknown>
    if (o.v === SAVED_LISTINGS_FILTERS_VERSION && o.params && typeof o.params === "object" && o.params !== null) {
      const usp = new URLSearchParams()
      for (const [k, val] of Object.entries(o.params as Record<string, string>)) {
        if (val != null && String(val).trim() !== "") usp.set(k, String(val))
      }
      return usp.toString()
    }
    // Legacy: flat JSON object of param → string (pre-versioned rows)
    if (!("v" in o)) {
      const usp = new URLSearchParams()
      for (const [k, val] of Object.entries(o)) {
        if (val == null) continue
        const s = String(val).trim()
        if (s !== "") usp.set(k, s)
      }
      return usp.toString()
    }
  }
  return ""
}

export function savedListingsHref(filters: unknown): string {
  const qs = savedListingsFiltersToQueryString(filters)
  return qs ? `/listings?${qs}` : "/listings"
}

/** Map stored `saved_searches.filters` → repository query (cron, server jobs). */
export function savedSearchFiltersToListingsPageQuery(filters: unknown): ListingsPageQuery {
  const qs = savedListingsFiltersToQueryString(filters)
  const usp = new URLSearchParams(qs)
  const flat = toFlatSearchParamsRecord(usp)
  return buildListingsPageQueryFromFlatParams(flat)
}
